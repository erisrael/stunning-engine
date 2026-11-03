import { RemotePad } from "./pad";

// A phone as the remote of a presentation (Phase 12c), opened from the QR the deck shows.
export const dynamic = "force-dynamic";
export const metadata = { title: "Remote", robots: { index: false } };

export default async function RemotePage({ params }: { params: Promise<{ token: string }> }) {
  return <RemotePad token={(await params).token} />;
}
