import { notFound, redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { findPerson, getProfile } from "@/server/profiles";
import { ProfileCard } from "@/components/app/profile-card";

export async function generateMetadata() {
  return { title: "Profile" };
}

// A colleague's profile at /people/<handle>: what they chose to show, and their files for their lead, HR and Admin.
// An old link by internal id moves to the handle address, so ids never show.
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const ref = decodeURIComponent((await params).id);
  const person = await findPerson(ref);
  if (!person) notFound();
  if (ref !== person.handle) redirect(`/people/${encodeURIComponent(person.handle)}`);
  const profile = await getProfile(viewer, person.id);
  if (!profile) notFound();
  return <ProfileCard profile={profile} />;
}
