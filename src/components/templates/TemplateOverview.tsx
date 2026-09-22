"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import {
  deployedTemplateMemory,
} from "@/components/templates/templateCatalog";
import type {
  BotTemplate,
  EditableTemplate,
  TemplateSchedule,
} from "@/components/templates/types";
import { Button } from "@/components/ui/Button";
import { safeErrorMessage } from "@/lib/errors";
import styles from "@/components/templates/templates.module.css";

type EmailIdentity = {
  _id: Id<"agentMailInboxes">;
  address: string | null;
  desiredUsername: string;
  status: string;
};

function editableTemplate(template: BotTemplate): EditableTemplate {
  return {
    name: template.name,
    mission: template.mission,
    memory: template.memory,
    schedules: template.schedules.map((schedule) => ({ ...schedule })),
  };
}

function scheduleLabel(schedule: TemplateSchedule): string {
  const cadence =
    schedule.interval === 1
      ? schedule.frequency
      : `every ${schedule.interval} ${schedule.frequency === "daily" ? "days" : `${schedule.frequency} periods`}`;
  return `${cadence} at ${String(schedule.localHour).padStart(2, "0")}:${String(schedule.localMinute).padStart(2, "0")}`;
}

export function TemplateOverview({
  template,
  accountEmail,
  credentialsConfigured,
  emailIdentities,
  timezone,
  onBack,
}: {
  template: BotTemplate;
  accountEmail: string;
  credentialsConfigured: boolean;
  emailIdentities: EmailIdentity[];
  timezone: string;
  onBack: () => void;
}) {
  const createBot = useMutation(api.bots.createBot);
  const router = useRouter();
  const [draft, setDraft] = useState(() => editableTemplate(template));
  const [editing, setEditing] = useState(false);
  const activeIdentities = emailIdentities.filter(
    (identity) => identity.status === "active" && identity.address !== null,
  );
  const [emailMode, setEmailMode] = useState<"existing" | "new" | null>(null);
  const [selectedInboxId, setSelectedInboxId] = useState("");
  const [newPrefix, setNewPrefix] = useState(template.id.slice(0, 30));
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [confirmedEmailChoice, setConfirmedEmailChoice] = useState<string | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedPrefix = newPrefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  const atAddressLimit = emailIdentities.length >= 3;
  const effectiveEmailMode =
    emailMode ?? (activeIdentities.length > 0 ? "existing" : "new");
  const effectiveInboxId = selectedInboxId || activeIdentities[0]?._id || "";
  const emailReady =
    effectiveEmailMode === "existing"
      ? Boolean(effectiveInboxId)
      : Boolean(normalizedPrefix) && !atAddressLimit;
  const recipientEmail = (deliveryEmail || accountEmail).trim();
  const normalizedRecipientEmail = recipientEmail.toLowerCase();
  const recipientReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    normalizedRecipientEmail,
  );
  const emailChoiceKey = [
    effectiveEmailMode,
    effectiveInboxId,
    normalizedPrefix,
    normalizedRecipientEmail,
  ].join(":");
  const emailChoiceConfirmed = confirmedEmailChoice === emailChoiceKey;
  const emailConfirmationReady = emailReady && recipientReady;

  function updateSchedule(
    scheduleId: string,
    update: Partial<TemplateSchedule>,
  ) {
    setDraft((current) => ({
      ...current,
      schedules: current.schedules.map((schedule) =>
        schedule.id === scheduleId ? { ...schedule, ...update } : schedule,
      ),
    }));
  }

  async function deploy() {
    if (
      !credentialsConfigured ||
      !emailConfirmationReady ||
      !emailChoiceConfirmed ||
      submitting
    ) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createBot({
        name: draft.name,
        mission: draft.mission,
        memory: deployedTemplateMemory(draft, timezone),
        recipientEmail: normalizedRecipientEmail,
        ...(effectiveEmailMode === "existing"
          ? { emailInboxId: effectiveInboxId as Id<"agentMailInboxes"> }
          : { desiredEmailUsername: normalizedPrefix }),
      });
      router.push(`/bots?botId=${result.botId}`);
    } catch (cause) {
      setError(safeErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.overviewShell}>
      <div className={styles.overviewTopline}>
        <button className={styles.backButton} onClick={onBack} type="button">
          Back to templates
        </button>
        <Button
          onClick={() => setEditing((current) => !current)}
          size="small"
          variant={editing ? "primary" : "secondary"}
        >
          {editing ? "Finish editing" : "Edit template"}
        </Button>
      </div>

      <header className={styles.overviewHeader}>
        <span className={styles.overviewMark}>
          {template.name
            .split(" ")
            .slice(0, 2)
            .map((part) => part[0])
            .join("")}
        </span>
        <div>
          <span className="eyebrow">Template overview</span>
          {editing ? (
            <input
              aria-label="Bot name"
              className={styles.titleInput}
              maxLength={80}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              value={draft.name}
            />
          ) : (
            <h1>{draft.name}</h1>
          )}
          <p>{template.outcome}</p>
        </div>
      </header>

      <div className={styles.overviewGrid}>
        <main className={styles.reviewColumn}>
          <section className={styles.reviewSection}>
            <div className={styles.sectionNumber}>01</div>
            <div>
              <span className="eyebrow">Mission</span>
              <h2>What this bot owns</h2>
              {editing ? (
                <textarea
                  className={styles.editArea}
                  maxLength={500}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      mission: event.target.value,
                    }))
                  }
                  rows={5}
                  value={draft.mission}
                />
              ) : (
                <p className={styles.largeCopy}>{draft.mission}</p>
              )}
            </div>
          </section>

          <section className={styles.reviewSection}>
            <div className={styles.sectionNumber}>02</div>
            <div>
              <span className="eyebrow">Private memory</span>
              <h2>How the agent works</h2>
              {editing ? (
                <textarea
                  className={`${styles.editArea} ${styles.memoryEditor}`}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      memory: event.target.value,
                    }))
                  }
                  rows={24}
                  value={draft.memory}
                />
              ) : (
                <pre className={styles.memoryBlock}>{draft.memory}</pre>
              )}
            </div>
          </section>

          <section className={styles.reviewSection}>
            <div className={styles.sectionNumber}>03</div>
            <div>
              <span className="eyebrow">Automation</span>
              <h2>
                {draft.schedules.length === 0
                  ? "No default schedule"
                  : `${draft.schedules.length} first-run schedule${draft.schedules.length === 1 ? "" : "s"}`}
              </h2>
              {draft.schedules.length === 0 ? (
                <p className={styles.largeCopy}>
                  This template starts on demand. The bot can still create a schedule
                  later when you ask.
                </p>
              ) : (
                <div className={styles.scheduleList}>
                  {draft.schedules.map((schedule) => (
                    <article className={styles.scheduleCard} key={schedule.id}>
                      {editing ? (
                        <>
                          <label>
                            Schedule name
                            <input
                              onChange={(event) =>
                                updateSchedule(schedule.id, {
                                  name: event.target.value,
                                })
                              }
                              value={schedule.name}
                            />
                          </label>
                          <label>
                            Research prompt
                            <textarea
                              onChange={(event) =>
                                updateSchedule(schedule.id, {
                                  researchPrompt: event.target.value,
                                })
                              }
                              rows={6}
                              value={schedule.researchPrompt}
                            />
                          </label>
                          <div className={styles.scheduleFields}>
                            <label>
                              Frequency
                              <select
                                onChange={(event) =>
                                  updateSchedule(schedule.id, {
                                    frequency: event.target.value as TemplateSchedule["frequency"],
                                  })
                                }
                                value={schedule.frequency}
                              >
                                <option value="hourly">Hourly</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                              </select>
                            </label>
                            <label>
                              Interval
                              <input
                                min={1}
                                onChange={(event) =>
                                  updateSchedule(schedule.id, {
                                    interval: Math.max(1, Number(event.target.value)),
                                  })
                                }
                                type="number"
                                value={schedule.interval}
                              />
                            </label>
                            <label>
                              Local hour
                              <input
                                max={23}
                                min={0}
                                onChange={(event) =>
                                  updateSchedule(schedule.id, {
                                    localHour: Math.max(
                                      0,
                                      Math.min(23, Number(event.target.value)),
                                    ),
                                  })
                                }
                                type="number"
                                value={schedule.localHour}
                              />
                            </label>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={styles.scheduleHeading}>
                            <strong>{schedule.name}</strong>
                            <span>{scheduleLabel(schedule)}</span>
                          </div>
                          <p>{schedule.summary}</p>
                          <small>{schedule.researchPrompt}</small>
                        </>
                      )}
                    </article>
                  ))}
                </div>
              )}
              {draft.schedules.length > 0 ? (
                <p className={styles.timezoneNote}>
                  Schedule timezone: <code>{timezone}</code>. The bot checks for an
                  existing equivalent schedule before creating one.
                </p>
              ) : null}
            </div>
          </section>
        </main>

        <aside className={styles.deployColumn}>
          <section className={styles.emailPanel}>
            <span className="eyebrow">Email identity</span>
            <h2>Choose how this bot sends</h2>
            <p>
              One address can be shared by several bots. Your account can have up
              to three addresses.
            </p>

            {activeIdentities.length > 0 ? (
              <label className={styles.radioChoice}>
                <input
                  checked={effectiveEmailMode === "existing"}
                  name="email-mode"
                  onChange={() => setEmailMode("existing")}
                  type="radio"
                />
                <span>
                  <strong>Use an existing address</strong>
                  <small>Share an inbox that is already active.</small>
                </span>
              </label>
            ) : null}
            {effectiveEmailMode === "existing" && activeIdentities.length > 0 ? (
              <select
                className={styles.identitySelect}
                onChange={(event) => setSelectedInboxId(event.target.value)}
                value={effectiveInboxId}
              >
                {activeIdentities.map((identity) => (
                  <option key={identity._id} value={identity._id}>
                    {identity.address}
                  </option>
                ))}
              </select>
            ) : null}

            <label
              className={`${styles.radioChoice} ${
                atAddressLimit ? styles.disabledChoice : ""
              }`}
            >
              <input
                checked={effectiveEmailMode === "new"}
                disabled={atAddressLimit}
                name="email-mode"
                onChange={() => setEmailMode("new")}
                type="radio"
              />
              <span>
                <strong>Create a new address</strong>
                <small>
                  {atAddressLimit
                    ? "Three addresses are already assigned."
                    : "Choose a memorable address prefix."}
                </small>
              </span>
            </label>
            {effectiveEmailMode === "new" && !atAddressLimit ? (
              <label className={styles.addressField}>
                <span>Address prefix</span>
                <span className={styles.addressInputRow}>
                  <input
                    aria-label="AgentMail address prefix"
                    maxLength={30}
                    onChange={(event) => setNewPrefix(event.target.value)}
                    value={newPrefix}
                  />
                  <strong>@agentmail.to</strong>
                </span>
                {newPrefix !== normalizedPrefix ? (
                  <small>Available characters are normalized to {normalizedPrefix || "a valid prefix"}.</small>
                ) : null}
              </label>
            ) : null}
            <label className={styles.addressField}>
              <span>Reports go to</span>
              <input
                aria-label="Report delivery email"
                className={styles.deliveryInput}
                onChange={(event) => setDeliveryEmail(event.target.value)}
                placeholder="you@company.com"
                type="email"
                value={recipientEmail}
              />
              <small>
                A report delivery address is required before you deploy this bot.
              </small>
            </label>
            <div className={styles.emailConfirm}>
              <Button
                disabled={!emailConfirmationReady}
                onClick={() => {
                  setConfirmedEmailChoice(emailChoiceKey);
                  setError(null);
                }}
                size="small"
                type="button"
                variant="secondary"
              >
                {emailChoiceConfirmed
                  ? "Email choice confirmed"
                  : "Confirm email choice"}
              </Button>
              <small
                className={
                  emailChoiceConfirmed
                    ? styles.confirmedEmailChoice
                    : styles.unconfirmedEmailChoice
                }
              >
                {emailChoiceConfirmed
                  ? "Saved for deployment. You can now confirm and deploy."
                  : "Confirm the sending address and report delivery email to unlock deployment."}
              </small>
            </div>
          </section>

          <section className={styles.examplePanel}>
            <span className="eyebrow">Try it with</span>
            <p>&ldquo;{template.exampleRequest}&rdquo;</p>
            <small>
              Reports are delivered to {recipientEmail || "the address you enter above"}.
            </small>
          </section>
        </aside>
      </div>

      <div className={styles.deployBar}>
        <div>
          <span>{draft.name}</span>
          <strong>
            {effectiveEmailMode === "existing"
              ? activeIdentities.find(
                  (identity) => identity._id === effectiveInboxId,
                )?.address ?? "Select an address"
              : normalizedPrefix
                ? `${normalizedPrefix}@agentmail.to`
                : "Choose an address"}
          </strong>
          {error ? <small className={styles.deployError}>{error}</small> : null}
        </div>
        {credentialsConfigured ? (
          <Button
            disabled={!emailConfirmationReady || !emailChoiceConfirmed || submitting}
            onClick={() => void deploy()}
            size="large"
          >
            {submitting ? "Deploying..." : "Confirm and deploy"}
          </Button>
        ) : (
          <Link
            className="button button-primary button-large"
            href="/settings"
          >
            Add API key in Settings
          </Link>
        )}
      </div>
    </div>
  );
}
