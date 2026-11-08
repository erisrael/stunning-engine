function decodeAttribute(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (entity, name: string) => {
    if (name.startsWith("#")) {
      const number = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
    }
    return ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" } as Record<string, string>)[name.toLowerCase()] ?? entity;
  });
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? decodeAttribute(match[1] ?? match[2] ?? match[3] ?? "") : "";
}

/** Separate uploaded slips from generated invoice PDFs; never treat a PDF as an image. */
export function cmsReceiptAttachments(html: string, baseUrl: string): { imageUrl: string | null; pdfUrl: string | null } {
  const base = new URL(baseUrl);
  const images: string[] = [], pdfs: string[] = [], downloads: string[] = [];
  for (const match of html.matchAll(/<(img|a)\b[^>]*>/gi)) {
    const tag = match[0], image = match[1].toLowerCase() === "img";
    const candidates = image ? [attribute(tag, "src"), attribute(tag, "data-src")] : [attribute(tag, "href")];
    for (const candidate of candidates) {
      if (!candidate) continue;
      let url: URL;
      try { url = new URL(candidate, base); } catch { continue; }
      if (url.origin !== base.origin || url.username || url.password || !/^https?:$/.test(url.protocol)) continue;
      const path = url.pathname;
      if (/avatar|logo|favicon|previewUrl/i.test(path)) continue;
      const mime = attribute(tag, "type").toLowerCase();
      if (/\.pdf$/i.test(path) || mime === "application/pdf") pdfs.push(url.href);
      else if (/\/invoices\/\d+\/download\/?$/i.test(path)) downloads.push(url.href);
      else if (/\.(?:jpe?g|png|webp|gif|avif)$/i.test(path) || (image && /\/(?:storage|uploads)\//i.test(path))) images.push(url.href);
    }
  }
  return { imageUrl: images[0] ?? null, pdfUrl: pdfs[0] ?? downloads[0] ?? null };
}
