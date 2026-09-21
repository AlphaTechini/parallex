"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import { BotAvatar } from "@/components/bots/BotAvatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { safeErrorMessage } from "@/lib/errors";

type Props = {
  bot: {
    _id: Id<"bots">;
    name: string;
    mission: string;
    emailCapability: string;
    emailAddress: string | null;
    avatar:
      | { kind: "default"; colorIndex: number }
      | { kind: "upload"; url: string | null };
  };
};

export function BotCard({ bot }: Props) {
  const retry = useMutation(api.bots.retryEmailProvisioning);
  const [error, setError] = useState<string | null>(null);

  return (
    <article className="bot-card">
      <div className="bot-card-topline">
        <BotAvatar avatar={bot.avatar} name={bot.name} size="large" />
        {bot.emailCapability === "active" ? (
          <Badge tone="success">Email active</Badge>
        ) : bot.emailCapability === "failed" ? (
          <Badge tone="danger">Email failed</Badge>
        ) : (
          <Badge tone="working">Provisioning</Badge>
        )}
      </div>
      <div>
        <h2>{bot.name}</h2>
        <p className="bot-mission">{bot.mission}</p>
      </div>
      <div className="bot-card-meta">
        {bot.emailAddress ? (
          <code>{bot.emailAddress}</code>
        ) : bot.emailCapability === "failed" ? (
          <Button
            onClick={async () => {
              setError(null);
              try {
                await retry({ botId: bot._id });
              } catch (cause) {
                setError(safeErrorMessage(cause));
              }
            }}
            size="small"
            variant="secondary"
          >
            Retry email
          </Button>
        ) : (
          <span>Preparing a dedicated inbox</span>
        )}
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <Link className="text-link" href={`/bots?botId=${bot._id}`}>
        Open bot <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}
