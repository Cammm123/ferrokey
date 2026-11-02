import { MessageView } from "./MessageView";

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  return <MessageView id={(await params).id} />;
}
