import { publicKey } from "@/server/corr/signing";

// The public key that checks the server's signatures on issued letters (Ed25519, PEM).
export async function GET() {
  const k = await publicKey();
  return Response.json(k, { headers: { "Cache-Control": "public, max-age=3600" } });
}
