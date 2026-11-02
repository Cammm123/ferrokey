import { ProfileView } from "./ProfileView";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  return <ProfileView id={(await params).id} />;
}
