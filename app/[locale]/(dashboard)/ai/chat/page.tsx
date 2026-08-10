export const dynamic = "force-dynamic";

import { PageListLayout, PageListHeader, PageListTitle, PageListContent } from "@/components/layout/page/list-layout";
import { ChatInterface } from "./_components/chat-interface";
import { verifySession } from "@/services/lib/auth/auth";

export default async function AIChatPage() {
  await verifySession();

  return (
    <PageListLayout>
      <PageListHeader>
        <PageListTitle>AI Assistant</PageListTitle>
      </PageListHeader>
      <PageListContent>
        <ChatInterface />
      </PageListContent>
    </PageListLayout>
  );
}
