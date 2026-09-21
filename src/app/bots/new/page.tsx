import Link from "next/link";

import { BotCreationForm } from "@/components/bots/BotCreationForm";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";

export default function NewBotPage() {
  return (
    <AuthGuard>
      <AppShell>
      <div className="page-heading compact">
        <div>
          <Link className="back-link" href="/dashboard">
            ← Dashboard
          </Link>
          <span className="eyebrow">New research identity</span>
          <h1>Create a bot</h1>
          <p>Define what people see and how the bot should research.</p>
        </div>
      </div>
      <BotCreationForm />
      </AppShell>
    </AuthGuard>
  );
}
