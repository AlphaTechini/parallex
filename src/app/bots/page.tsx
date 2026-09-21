import { Suspense } from "react";

import { BotDetailPageContent } from "@/components/bots/BotDetailPageContent";
import { Spinner } from "@/components/ui/Spinner";

export default function BotDetailRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="page-loading">
          <Spinner label="Loading bot" />
        </div>
      }
    >
      <BotDetailPageContent />
    </Suspense>
  );
}
