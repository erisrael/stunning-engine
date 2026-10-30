import { notFound } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { getProfile } from "@/server/profiles";
import { ProfileCard } from "@/components/app/profile-card";

export async function generateMetadata() {
  return { title: "Profile" };
}

// A colleague's profile: what they chose to show, and their files for their lead, HR and Admin.
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const profile = await getProfile(viewer, (await params).id);
  if (!profile) notFound();
  return <ProfileCard profile={profile} />;
}
