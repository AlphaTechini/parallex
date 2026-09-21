import { Suspense } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { TemplateDashboard } from "@/components/templates/TemplateDashboard";
import { Spinner } from "@/components/ui/Spinner";

export default function TemplatesPage() {
  return (
    <AuthGuard>
      <AppShell>
        <Suspense
          fallback={
            <div className="page-loading">
              <Spinner label="Loading templates" />
            </div>
          }
        >
          <TemplateDashboard />
        </Suspense>
      </AppShell>
    </AuthGuard>
  );
}
