// Reading scanned letters (OCR) with Tesseract, installed in the server image with English and Amharic (Dockerfile).
// Pictures are read directly; PDFs are turned into page images first with poppler's pdftoppm (up to 10 pages).
// Elsewhere set TESSERACT_PATH (and PDFTOPPM_PATH) to the programs. The text is kept with the attachment, shown on
// the letter, and searched in the registry. Nothing leaves the server.

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { get, nowIso, run } from "../db";
import { WorkflowError } from "../workflow";
import type { AppUser } from "../users";
import { audit, corrCan } from "./core";

const exec = (cmd: string, args: string[], timeout = 120_000) =>
  new Promise<{ stdout: string; stderr: string }>((ok, bad) =>
    execFile(cmd, args, { timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => (err ? bad(Object.assign(err, { stderr })) : ok({ stdout: String(stdout), stderr: String(stderr) }))),
  );

const CANDIDATES = (env: string | undefined, name: string, win: string[]) => [env, name, ...(process.platform === "win32" ? win : [])].filter(Boolean) as string[];
async function find(env: string | undefined, name: string, win: string[], probe: string[]) {
  for (const c of CANDIDATES(env, name, win)) {
    try {
      await exec(c, probe, 15_000);
      return c;
    } catch {
      /* not this one */
    }
  }
  return null;
}

let tools: Promise<{ tesseract: string | null; pdftoppm: string | null; langs: string[] }> | null = null;
export function ocrTools() {
  tools ??= (async () => {
    const tesseract = await find(process.env.TESSERACT_PATH, "tesseract", ["C:\\Program Files\\Tesseract-OCR\\tesseract.exe", "C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe"], ["--version"]);
    const pdftoppm = await find(process.env.PDFTOPPM_PATH, "pdftoppm", [], ["-v"]);
    let langs: string[] = [];
    if (tesseract)
      try {
        const out = await exec(tesseract, ["--list-langs"], 15_000);
        langs = `${out.stdout}\n${out.stderr}`.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[a-z_]{3,8}$/.test(l));
      } catch {
        langs = ["eng"];
      }
    return { tesseract, pdftoppm, langs };
  })();
  return tools;
}

export async function ocrStatus() {
  const t = await ocrTools();
  return { available: !!t.tesseract, pdf: !!t.pdftoppm, languages: t.langs.filter((l) => ["eng", "amh"].includes(l)) };
}

// The text of an image or PDF (Buffer), in English and Amharic when both are installed.
export async function ocrBuffer(data: Buffer, mime: string) {
  const t = await ocrTools();
  if (!t.tesseract) throw new WorkflowError("INVALID_STATE", "Text reading (OCR) is not installed on this server.");
  const lang = ["eng", "amh"].filter((l) => t.langs.includes(l)).join("+") || "eng";
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "corr-ocr-"));
  try {
    const images: string[] = [];
    if (mime === "application/pdf") {
      if (!t.pdftoppm) throw new WorkflowError("INVALID_STATE", "Reading PDFs needs poppler (pdftoppm) on the server; pictures can be read now.");
      const pdf = path.join(dir, "in.pdf");
      await fs.writeFile(pdf, data);
      await exec(t.pdftoppm, ["-r", "200", "-gray", "-png", "-f", "1", "-l", "10", pdf, path.join(dir, "page")]);
      for (const f of (await fs.readdir(dir)).filter((f) => f.startsWith("page") && f.endsWith(".png")).sort()) images.push(path.join(dir, f));
    } else if (/^image\/(png|jpeg|webp|tiff)$/.test(mime)) {
      const img = path.join(dir, `in.${mime.split("/")[1]}`);
      await fs.writeFile(img, data);
      images.push(img);
    } else throw new WorkflowError("VALIDATION", "Only scanned pictures and PDFs are read.");
    const pages: string[] = [];
    for (const img of images) {
      const out = await exec(t.tesseract, [img, "stdout", "-l", lang, "--psm", "3"]);
      pages.push(out.stdout.trim());
    }
    return { text: pages.join("\n\n— page break —\n\n").slice(0, 200_000), lang, pages: images.length };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Things worth suggesting from the text: a reference, a date and a subject line.
export function ocrHints(text: string) {
  const ref = /\b(?:ref(?:erence)?\.?\s*(?:no\.?|number)?|our\s+ref|ቁጥር)\s*[:：]?\s*([A-Z0-9][A-Z0-9/._-]{2,40})/i.exec(text)?.[1] ?? null;
  const subject = /\b(?:subject|re|ጉዳዩ)\s*[:：]\s*(.{4,160})/i.exec(text)?.[1]?.trim() ?? null;
  const date = /\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})\b/i.exec(text)?.[1] ?? null;
  return { ref, subject, date };
}

// Reads one attachment and keeps the text with it.
export async function ocrAttachment(user: AppUser, attachmentId: string) {
  if (!corrCan(user, "create")) throw new WorkflowError("FORBIDDEN", "You cannot read attachments here.");
  const { readAttachment } = await import("./delivery");
  const a = await readAttachment(attachmentId);
  if (!a) throw new WorkflowError("NOT_FOUND", "Attachment not found.");
  const { getDoc } = await import("./documents");
  await getDoc(user, a.document_id);
  const r = await ocrBuffer(a.data, a.mime);
  await run("UPDATE corr_attachments SET ocr_text = ?, ocr_at = ?, ocr_lang = ? WHERE id = ?", r.text, nowIso(), r.lang, attachmentId);
  await audit(user, a.document_id, "attachment.ocr", { name: a.name, pages: r.pages, lang: r.lang, chars: r.text.length });
  return { text: r.text, hints: ocrHints(r.text), pages: r.pages, lang: r.lang };
}

export async function attachmentText(attachmentId: string) {
  return (await get<{ ocr_text: string | null }>("SELECT ocr_text FROM corr_attachments WHERE id = ?", attachmentId))?.ocr_text ?? null;
}
