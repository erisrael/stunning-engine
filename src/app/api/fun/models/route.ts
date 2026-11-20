import { NextResponse } from "next/server";
import { getViewer } from "@/server/auth";
import { listModels, uploadModel } from "@/server/fun-models";

// Seed Town models: the list (signed in), and uploads (Admin; a .glb file as form data).
export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json({ models: await listModels() });
}

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "Choose a .glb file." }, { status: 400 });
    const name = String(form.get("name") ?? (file as File).name ?? "Model");
    return NextResponse.json(await uploadModel(viewer, name, new Uint8Array(await file.arrayBuffer())));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
