import { getViewer } from "@/server/auth";
import { mailAttachment } from "@/server/mail";

// An attachment of a message in the viewer's mailbox, fetched from the mail server when asked for. Pictures and PDFs
// open in the browser; everything else (and anything a browser could run) is downloaded.
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const u = new URL(request.url).searchParams;
  const file = await mailAttachment(viewer, { box: u.get("box"), folder: u.get("folder") ?? "INBOX", uid: Number(u.get("uid")), index: Number(u.get("i")) }).catch(() => null);
  if (!file) return new Response("Not found", { status: 404 });
  const inline = u.get("dl") !== "1" && /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/.test(file.type);
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": inline ? file.type : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
