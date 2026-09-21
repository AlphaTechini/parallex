"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import { BotMemoryEditor } from "@/components/bots/BotMemoryEditor";
import { Button } from "@/components/ui/Button";
import { safeErrorMessage } from "@/lib/errors";

type BotSettings = {
  name: string;
  mission: string;
  emailAddress: string | null;
  recipientEmail: string;
  botMemory: string | null;
};

export function BotSettingsPanel({
  bot,
  botId,
}: {
  bot: BotSettings;
  botId: Id<"bots">;
}) {
  const archive = useMutation(api.bots.archiveBot);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleArchive() {
    if (!window.confirm("Archive this bot? Existing history remains available.")) return;
    setError(null);
    try {
      await archive({ botId });
      router.replace("/dashboard");
    } catch (cause) {
      setError(safeErrorMessage(cause));
    }
  }

  return (
    <>
      <section className="detail-panel bot-settings-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Configuration</span>
            <h2>Bot information</h2>
          </div>
        </div>
        <dl className="bot-info-list">
          <div>
            <dt>Name</dt>
            <dd>{bot.name}</dd>
          </div>
          <div>
            <dt>Mission</dt>
            <dd>{bot.mission}</dd>
          </div>
          <div>
            <dt>From email</dt>
            <dd><code>{bot.emailAddress || "Provisioning inbox"}</code></dd>
          </div>
          <div>
            <dt>Recipient email</dt>
            <dd><code>{bot.recipientEmail}</code></dd>
          </div>
        </dl>
        <div className="bot-settings-archive">
          <div>
            <strong>Archive this bot</strong>
            <span>Archived bots stop all activity. Existing history remains available.</span>
          </div>
          <Button onClick={handleArchive} size="small" variant="quiet">
            Archive bot
          </Button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
      </section>
      <BotMemoryEditor botId={botId} initialMemory={bot.botMemory} />
    </>
  );
}
