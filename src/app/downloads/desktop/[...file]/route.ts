import fs from "node:fs";
import path from "node:path";

// The Seed Town Windows app: its installer, the portable version and the update feed (latest.yml and the
// .blockmap files electron-updater reads), served from a folder on the server (DESKTOP_DOWNLOADS_DIR, by default
// data/downloads/desktop). /downloads/desktop/latest sends the newest installer. Only plain file names are served.

const dir = () => process.env.DESKTOP_DOWNLOADS_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data", "downloads", "desktop");
const TYPES: Record<string, string> = { ".exe": "application/vnd.microsoft.portable-executable", ".yml": "text/yaml; charset=utf-8", ".blockmap": "application/octet-stream", ".zip": "application/zip" };

export async function GET(_req: Request, ctx: { params: Promise<{ file: string[] }> }) {
  const { file } = await ctx.params;
  const name = (file ?? []).join("/");
  const d = dir();
  if (name === "latest" || name === "latest-portable") {
    const list = fs.existsSync(d) ? fs.readdirSync(d).filter((f) => (name === "latest" ? /^SeedTown-[\d.]+-x64\.exe$/.test(f) : /^SeedTown-[\d.]+-portable\.exe$/.test(f))) : [];
    const newest = list.sort((a, b) => fs.statSync(path.join(d, b)).mtimeMs - fs.statSync(path.join(d, a)).mtimeMs)[0];
    if (!newest) return new Response("The Windows app has not been published on this server yet.", { status: 404 });
    return Response.redirect(new URL(`/downloads/desktop/${newest}`, _req.url), 302);
  }
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(name) || name.startsWith(".")) return new Response(null, { status: 404 });
  const p = path.join(d, name);
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return new Response(null, { status: 404 });
  const stat = fs.statSync(p);
  const stream = fs.createReadStream(/* turbopackIgnore: true */ p);
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": TYPES[path.extname(name)] ?? "application/octet-stream",
      "Content-Length": String(stat.size),
      "Cache-Control": name.endsWith(".yml") ? "no-cache" : "public, max-age=86400",
      ...(name.endsWith(".exe") ? { "Content-Disposition": `attachment; filename="${name}"` } : {}),
    },
  });
}
