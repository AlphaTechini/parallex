import { Suspense } from "react";

import { ChatPageContent } from "@/components/chat/ChatPageContent";
import { Spinner } from "@/components/ui/Spinner";

export default function ChatsRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="page-loading">
          <Spinner label="Loading chat" />
        </div>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
