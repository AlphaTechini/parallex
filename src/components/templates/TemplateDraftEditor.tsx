"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import type { TemplateSpecification } from "../../../convex/lib/templateFramework";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { api } from "../../../convex/_generated/api";
import { BotAvatar } from "@/components/bots/BotAvatar";
import { Button } from "@/components/ui/Button";
import { safeErrorMessage } from "@/lib/errors";
import styles from "@/components/templates/templates.module.css";

type EmailIdentity = {
  _id: Id<"agentMailInboxes">;
  address: string | null;
  desiredUsername: string;
  status: string;
};

type DraftDoc = TemplateSpecification & {
  _id: Id<"templateDrafts">;
  status: "draft" | "published" | "archived";
  revision: number;
  deploymentCount: number;
  updatedAt: number;
};

const CATEGORY_OPTIONS: Array<TemplateSpecification["category"]> = [
  "everyday",
  "software",
  "ai",
  "hardware",
  "custom",
];

const IMPORTANCE_OPTIONS: Array<
  TemplateSpecification["evaluationCriteria"][number]["importance"]
> = ["essential", "high", "medium", "low"];

const FREQUENCY_OPTIONS: Array<
  TemplateSpecification["schedules"][number]["frequency"]
> = ["hourly", "daily", "weekly", "monthly"];

function specFromDoc(draft: DraftDoc): TemplateSpecification {
  return {
    name: draft.name,
    shortDescription: draft.shortDescription,
    mission: draft.mission,
    outcome: draft.outcome,
    exampleRequest: draft.exampleRequest,
    category: draft.category,
    role: draft.role,
    intendedUser: draft.intendedUser,
    intakeQuestions: [...draft.intakeQuestions],
    hardConstraints: [...draft.hardConstraints],
    evaluationCriteria: draft.evaluationCriteria.map((criterion) => ({
      ...criterion,
    })),
    pricingMethod: draft.pricingMethod,
    researchWorkflow: [...draft.researchWorkflow],
    sourceStandards: [...draft.sourceStandards],
    rankingMethod: [...draft.rankingMethod],
    outputRequirements: [...draft.outputRequirements],
    actionRules: [...draft.actionRules],
    uncertaintyRules: [...draft.uncertaintyRules],
    safetyBoundaries: [...draft.safetyBoundaries],
    schedules: draft.schedules.map((schedule) => ({ ...schedule })),
  };
}

function scheduleCadence(
  schedule: TemplateSpecification["schedules"][number],
): string {
  const base =
    schedule.interval === 1
      ? schedule.frequency
      : `every ${schedule.interval} ${schedule.frequency === "daily" ? "days" : `${schedule.frequency} periods`}`;
  return `${base} at ${String(schedule.localHour).padStart(2, "0")}:${String(schedule.localMinute).padStart(2, "0")}`;
}

export function TemplateDraftEditor({
  draft,
  initialMemory,
  accountEmail,
  credentialsConfigured,
  emailIdentities,
  timezone,
  onBack,
}: {
  draft: DraftDoc;
  initialMemory: string;
  accountEmail: string;
  credentialsConfigured: boolean;
  emailIdentities: EmailIdentity[];
  timezone: string;
  onBack: () => void;
}) {
  const updateDraft = useMutation(api.templateDrafts.updateMine);
  const generateUpload = useMutation(api.bots.generateAvatarUploadUrl);
  const finalizeUpload = useMutation(api.bots.finalizeAvatarUpload);
  const createBot = useMutation(api.bots.createBot);
  const router = useRouter();

  const [spec, setSpec] = useState<TemplateSpecification>(() =>
    specFromDoc(draft),
  );
  const [savedJson, setSavedJson] = useState<string>(() =>
    JSON.stringify(specFromDoc(draft)),
  );
  const [revision, setRevision] = useState(draft.revision);
  const [memoryPreview, setMemoryPreview] = useState(initialMemory);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >(draft.status === "draft" ? "idle" : "saved");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarStorageId, setAvatarStorageId] = useState<Id<"_storage">>();
  const [avatarBusy, setAvatarBusy] = useState(false);

  const activeIdentities = emailIdentities.filter(
    (identity) => identity.status === "active" && identity.address !== null,
  );
  const [emailMode, setEmailMode] = useState<"existing" | "new" | null>(null);
  const [selectedInboxId, setSelectedInboxId] = useState("");
  const [newPrefix, setNewPrefix] = useState(
    spec.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30),
  );
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [confirmedEmailChoice, setConfirmedEmailChoice] = useState<
    string | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const specJson = JSON.stringify(spec);
  const dirty = specJson !== savedJson;
  const saveInProgress = useRef(false);

  useEffect(() => {
    if (!dirty || saveInProgress.current) return;
    setSaveState("saving");
    const handle = setTimeout(async () => {
      saveInProgress.current = true;
      setSaveError(null);
      try {
        const result = await updateDraft({ draftId: draft._id, ...spec });
        setSavedJson(JSON.stringify(spec));
        setRevision(result.revision);
        setMemoryPreview(result.compiledMemory);
        setSaveState("saved");
      } catch (cause) {
        setSaveState("error");
        setSaveError(safeErrorMessage(cause));
      } finally {
        saveInProgress.current = false;
      }
    }, 900);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specJson, dirty, draft._id, updateDraft]);

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
  const deployReady =
    credentialsConfigured &&
    emailConfirmationReady &&
    emailChoiceConfirmed &&
    !dirty &&
    saveState !== "saving" &&
    saveState !== "error";

  function patchSpec(update: Partial<TemplateSpecification>) {
    setSpec((current) => ({ ...current, ...update }));
  }

  function patchList(field: keyof TemplateSpecification, value: string) {
    const items = value
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    patchSpec({ [field]: items } as Partial<TemplateSpecification>);
  }

  function listValue(field: keyof TemplateSpecification): string {
    const value = spec[field];
    return Array.isArray(value) ? (value as string[]).join("\n") : "";
  }

  async function handleAvatar(file: File | null) {
    setError(null);
    if (!file) {
      setAvatarPreview(null);
      setAvatarStorageId(undefined);
      return;
    }
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      setError("Choose an image smaller than 2 MB.");
      return;
    }
    setAvatarBusy(true);
    try {
      const { uploadUrl, token } = await generateUpload({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("INVALID_AVATAR");
      const body = (await response.json()) as { storageId: Id<"_storage"> };
      await finalizeUpload({ token, storageId: body.storageId });
      setAvatarPreview(URL.createObjectURL(file));
      setAvatarStorageId(body.storageId);
    } catch (cause) {
      setError(safeErrorMessage(cause));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function deploy() {
    if (!deployReady || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createBot({
        templateDraftId: draft._id,
        timezone,
        recipientEmail: normalizedRecipientEmail,
        ...(effectiveEmailMode === "existing"
          ? { emailInboxId: effectiveInboxId as Id<"agentMailInboxes"> }
          : { desiredEmailUsername: normalizedPrefix }),
        ...(avatarStorageId !== undefined ? { avatarStorageId } : {}),
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
        <span
          className={`${styles.saveStatus} ${
            saveState === "saving"
              ? styles.saveStatusSaving
              : saveState === "saved"
                ? styles.saveStatusSaved
                : saveState === "error"
                  ? styles.saveStatusError
                  : ""
          }`}
        >
          {saveState === "saving"
            ? "Saving changes..."
            : saveState === "error"
              ? "Save failed"
              : dirty
                ? "Unsaved changes"
                : `Saved at revision ${revision}`}
        </span>
      </div>

      <header className={styles.overviewHeader}>
        <span className={styles.overviewMark}>
          {spec.name
            .split(" ")
            .slice(0, 2)
            .map((part) => part[0])
            .join("")}
        </span>
        <div>
          <span className="eyebrow">
            {draft.status === "published"
              ? `My template | deployed ${draft.deploymentCount} time${draft.deploymentCount === 1 ? "" : "s"}`
              : "Agent-created draft"}
          </span>
          <h1>{spec.name}</h1>
          <p>{spec.outcome}</p>
        </div>
      </header>

      <div className={styles.overviewGrid}>
        <main className={styles.reviewColumn}>
          <section className={styles.reviewSection}>
            <div className={styles.sectionNumber}>01</div>
            <div>
              <span className="eyebrow">Basics</span>
              <h2>Identity and purpose</h2>
              <label className={styles.fieldLabel}>
                Name
                <input
                  maxLength={80}
                  onChange={(event) =>
                    patchSpec({ name: event.target.value })
                  }
                  value={spec.name}
                />
              </label>
              <label className={styles.fieldLabel}>
                Short description
                <textarea
                  maxLength={240}
                  onChange={(event) =>
                    patchSpec({ shortDescription: event.target.value })
                  }
                  rows={2}
                  value={spec.shortDescription}
                />
              </label>
              <label className={styles.fieldLabel}>
                Mission
                <textarea
                  maxLength={500}
                  onChange={(event) =>
                    patchSpec({ mission: event.target.value })
                  }
                  rows={3}
                  value={spec.mission}
                />
              </label>
              <label className={styles.fieldLabel}>
                Expected outcome
                <textarea
                  maxLength={500}
                  onChange={(event) =>
                    patchSpec({ outcome: event.target.value })
                  }
                  rows={2}
                  value={spec.outcome}
                />
              </label>
              <label className={styles.fieldLabel}>
                Example request
                <textarea
                  maxLength={500}
                  onChange={(event) =>
                    patchSpec({ exampleRequest: event.target.value })
                  }
                  rows={2}
                  value={spec.exampleRequest}
                />
              </label>
              <label className={styles.fieldLabel}>
                Category
                <select
                  onChange={(event) =>
                    patchSpec({
                      category: event.target
                        .value as TemplateSpecification["category"],
                    })
                  }
                  value={spec.category}
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className={styles.reviewSection}>
            <div className={styles.sectionNumber}>02</div>
            <div>
              <span className="eyebrow">Role</span>
              <h2>Who the agent becomes</h2>
              <label className={styles.fieldLabel}>
                Role definition
                <textarea
                  className={styles.editArea}
                  maxLength={1500}
                  onChange={(event) => patchSpec({ role: event.target.value })}
                  rows={5}
                  value={spec.role}
                />
              </label>
              <label className={styles.fieldLabel}>
                Intended user
                <textarea
                  maxLength={1000}
                  onChange={(event) =>
                    patchSpec({ intendedUser: event.target.value })
                  }
                  rows={3}
                  value={spec.intendedUser}
                />
              </label>
            </div>
          </section>

          <section className={styles.reviewSection}>
            <div className={styles.sectionNumber}>03</div>
            <div>
              <span className="eyebrow">Intake</span>
              <h2>Questions asked before research</h2>
              <label className={styles.fieldLabel}>
                One question per line (3 to 12)
                <textarea
                  className={styles.editArea}
                  onChange={(event) =>
                    patchList("intakeQuestions", event.target.value)
                  }
                  rows={Math.max(4, spec.intakeQuestions.length + 1)}
                  value={listValue("intakeQuestions")}
                />
              </label>
              <label className={styles.fieldLabel}>
                Hard constraints, one per line (1 to 12)
                <textarea
                  className={styles.editArea}
                  onChange={(event) =>
                    patchList("hardConstraints", event.target.value)
                  }
                  rows={Math.max(3, spec.hardConstraints.length + 1)}
                  value={listValue("hardConstraints")}
                />
              </label>
            </div>
          </section>

          <section className={styles.reviewSection}>
            <div className={styles.sectionNumber}>04</div>
            <div>
              <span className="eyebrow">Evaluation</span>
              <h2>Criteria, weights, and pricing</h2>
              <div className={styles.criteriaList}>
                {spec.evaluationCriteria.map((criterion, index) => (
                  <article className={styles.criteriaCard} key={index}>
                    <div className={styles.criteriaHeading}>
                      <input
                        aria-label="Criterion name"
                        maxLength={120}
                        onChange={(event) =>
                          patchSpec({
                            evaluationCriteria:
                              spec.evaluationCriteria.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                          })
                        }
                        placeholder="Criterion name"
                        value={criterion.name}
                      />
                      {spec.evaluationCriteria.length > 3 ? (
                        <button
                          className={styles.removeButton}
                          onClick={() =>
                            patchSpec({
                              evaluationCriteria:
                                spec.evaluationCriteria.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                            })
                          }
                          type="button"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <textarea
                      aria-label="Criterion description"
                      maxLength={800}
                      onChange={(event) =>
                        patchSpec({
                          evaluationCriteria: spec.evaluationCriteria.map(
                            (item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, description: event.target.value }
                                : item,
                          ),
                        })
                      }
                      placeholder="What this criterion measures and how it is judged"
                      rows={2}
                      value={criterion.description}
                    />
                    <div className={styles.criteriaFields}>
                      <label>
                        Importance
                        <select
                          onChange={(event) =>
                            patchSpec({
                              evaluationCriteria: spec.evaluationCriteria.map(
                                (item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        importance: event.target
                                          .value as TemplateSpecification["evaluationCriteria"][number]["importance"],
                                      }
                                    : item,
                              ),
                            })
                          }
                          value={criterion.importance}
                        >
                          {IMPORTANCE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Weight (1-100)
                        <input
                          max={100}
                          min={1}
                          onChange={(event) =>
                            patchSpec({
                              evaluationCriteria:
                                spec.evaluationCriteria.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        weight: Math.max(
                                          1,
                                          Math.min(
                                            100,
                                            Number(event.target.value) || 1,
                                          ),
                                        ),
                                      }
                                    : item,
                                ),
                            })
                          }
                          type="number"
                          value={criterion.weight}
                        />
                      </label>
                      <label className={styles.checkboxLabel}>
                        <input
                          checked={criterion.priceRelevant}
                          onChange={(event) =>
                            patchSpec({
                              evaluationCriteria:
                                spec.evaluationCriteria.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        priceRelevant: event.target.checked,
                                      }
                                    : item,
                                ),
                            })
                          }
                          type="checkbox"
                        />
                        Price-relevant
                      </label>
                    </div>
                  </article>
                ))}
              </div>
              {spec.evaluationCriteria.length < 12 ? (
                <Button
                  onClick={() =>
                    patchSpec({
                      evaluationCriteria: [
                        ...spec.evaluationCriteria,
                        {
                          name: "",
                          description: "",
                          importance: "medium",
                          weight: 50,
                          priceRelevant: false,
                        },
                      ],
                    })
                  }
                  size="small"
                  variant="secondary"
                >
                  Add criterion
                </Button>
              ) : null}
              <label className={styles.fieldLabel}>
                Pricing method: how all-in cost and value are computed
                <textarea
                  className={styles.editArea}
                  maxLength={3000}
                  onChange={(event) =>
                    patchSpec({ pricingMethod: event.target.value })
                  }
                  rows={5}
                  value={spec.pricingMethod}
                />
              </label>
            </div>
          </section>

          <section className={styles.reviewSection}>
            <div className={styles.sectionNumber}>05</div>
            <div>
              <span className="eyebrow">Research</span>
              <h2>Workflow and source standards</h2>
              <label className={styles.fieldLabel}>
                Workflow steps in order, one per line (3 to 15)
                <textarea
                  className={styles.editArea}
                  onChange={(event) =>
                    patchList("researchWorkflow", event.target.value)
                  }
                  rows={Math.max(5, spec.researchWorkflow.length + 1)}
                  value={listValue("researchWorkflow")}
                />
              </label>
              <label className={styles.fieldLabel}>
                Source standards, one per line (2 to 12)
                <textarea
                  className={styles.editArea}
                  onChange={(event) =>
                    patchList("sourceStandards", event.target.value)
                  }
                  rows={Math.max(4, spec.sourceStandards.length + 1)}
                  value={listValue("sourceStandards")}
                />
              </label>
            </div>
          </section>

          <section className={styles.reviewSection}>
            <div className={styles.sectionNumber}>06</div>
            <div>
              <span className="eyebrow">Ranking and output</span>
              <h2>How options rank and what returns</h2>
              <label className={styles.fieldLabel}>
                Ranking rules, one per line (2 to 12)
                <textarea
                  className={styles.editArea}
                  onChange={(event) =>
                    patchList("rankingMethod", event.target.value)
                  }
                  rows={Math.max(4, spec.rankingMethod.length + 1)}
                  value={listValue("rankingMethod")}
                />
              </label>
              <label className={styles.fieldLabel}>
                Output requirements, one per line (3 to 15)
                <textarea
                  className={styles.editArea}
                  onChange={(event) =>
                    patchList("outputRequirements", event.target.value)
                  }
                  rows={Math.max(5, spec.outputRequirements.length + 1)}
                  value={listValue("outputRequirements")}
                />
              </label>
            </div>
          </section>

          <section className={styles.reviewSection}>
            <div className={styles.sectionNumber}>07</div>
            <div>
              <span className="eyebrow">Boundaries</span>
              <h2>Actions, uncertainty, and safety</h2>
              <label className={styles.fieldLabel}>
                Action rules, one per line (1 to 12)
                <textarea
                  className={styles.editArea}
                  onChange={(event) =>
                    patchList("actionRules", event.target.value)
                  }
                  rows={Math.max(3, spec.actionRules.length + 1)}
                  value={listValue("actionRules")}
                />
              </label>
              <label className={styles.fieldLabel}>
                Uncertainty rules, one per line (2 to 12)
                <textarea
                  className={styles.editArea}
                  onChange={(event) =>
                    patchList("uncertaintyRules", event.target.value)
                  }
                  rows={Math.max(4, spec.uncertaintyRules.length + 1)}
                  value={listValue("uncertaintyRules")}
                />
              </label>
              <label className={styles.fieldLabel}>
                Safety boundaries, one per line (1 to 12)
                <textarea
                  className={styles.editArea}
                  onChange={(event) =>
                    patchList("safetyBoundaries", event.target.value)
                  }
                  rows={Math.max(3, spec.safetyBoundaries.length + 1)}
                  value={listValue("safetyBoundaries")}
                />
              </label>
            </div>
          </section>

          <section className={styles.reviewSection}>
            <div className={styles.sectionNumber}>08</div>
            <div>
              <span className="eyebrow">Automation</span>
              <h2>
                {spec.schedules.length === 0
                  ? "No recurring schedule"
                  : `${spec.schedules.length} first-run schedule${spec.schedules.length === 1 ? "" : "s"}`}
              </h2>
              {spec.schedules.length === 0 ? (
                <p className={styles.largeCopy}>
                  This template starts on demand. The deployed bot can still
                  create a schedule later when asked.
                </p>
              ) : (
                <div className={styles.scheduleList}>
                  {spec.schedules.map((schedule, index) => (
                    <article className={styles.scheduleCard} key={index}>
                      <div className={styles.criteriaHeading}>
                        <input
                          aria-label="Schedule name"
                          maxLength={160}
                          onChange={(event) =>
                            patchSpec({
                              schedules: spec.schedules.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                            })
                          }
                          value={schedule.name}
                        />
                        <button
                          className={styles.removeButton}
                          onClick={() =>
                            patchSpec({
                              schedules: spec.schedules.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            })
                          }
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                      <label className={styles.fieldLabel}>
                        Research prompt
                        <textarea
                          maxLength={6000}
                          onChange={(event) =>
                            patchSpec({
                              schedules: spec.schedules.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      researchPrompt: event.target.value,
                                    }
                                  : item,
                              ),
                            })
                          }
                          rows={5}
                          value={schedule.researchPrompt}
                        />
                      </label>
                      <div className={styles.scheduleFields}>
                        <label>
                          Frequency
                          <select
                            onChange={(event) =>
                              patchSpec({
                                schedules: spec.schedules.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          frequency: event.target
                                            .value as TemplateSpecification["schedules"][number]["frequency"],
                                        }
                                      : item,
                                ),
                              })
                            }
                            value={schedule.frequency}
                          >
                            {FREQUENCY_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Interval
                          <input
                            max={365}
                            min={1}
                            onChange={(event) =>
                              patchSpec({
                                schedules: spec.schedules.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          interval: Math.max(
                                            1,
                                            Math.min(
                                              365,
                                              Number(event.target.value) || 1,
                                            ),
                                          ),
                                        }
                                      : item,
                                ),
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
                              patchSpec({
                                schedules: spec.schedules.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          localHour: Math.max(
                                            0,
                                            Math.min(
                                              23,
                                              Number(event.target.value) || 0,
                                            ),
                                          ),
                                        }
                                      : item,
                                ),
                              })
                            }
                            type="number"
                            value={schedule.localHour}
                          />
                        </label>
                      </div>
                      <small>{scheduleCadence(schedule)} | timezone {timezone}</small>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className={styles.reviewSection}>
            <div className={styles.sectionNumber}>09</div>
            <div>
              <span className="eyebrow">Canonical memory</span>
              <h2>What the deployed bot receives</h2>
              <p className={styles.timezoneNote}>
                This preview is compiled by the backend from the structured
                sections above. Deployment always recompiles from the latest
                saved revision.
              </p>
              <pre className={styles.memoryBlock}>
                {memoryPreview || "Save a change or deploy to compile the canonical memory preview."}
              </pre>
              {saveError ? (
                <p className={styles.deployError}>{saveError}</p>
              ) : null}
            </div>
          </section>
        </main>

        <aside className={styles.deployColumn}>
          <section className={styles.emailPanel}>
            <span className="eyebrow">Bot avatar</span>
            <h2>Optional profile image</h2>
            <div className={styles.avatarPicker}>
              {avatarPreview ? (
                <BotAvatar
                  avatar={{ kind: "upload", url: avatarPreview }}
                  name={spec.name || "New bot"}
                  size="large"
                />
              ) : (
                <BotAvatar
                  avatar={{ kind: "default", colorIndex: 3 }}
                  name={spec.name || "New bot"}
                  size="large"
                />
              )}
              <label className={styles.fileLabel}>
                {avatarBusy ? "Uploading..." : "Choose image"}
                <input
                  accept="image/*"
                  disabled={avatarBusy}
                  onChange={(event) =>
                    void handleAvatar(event.target.files?.[0] ?? null)
                  }
                  type="file"
                />
              </label>
            </div>
          </section>

          <section className={styles.emailPanel}>
            <span className="eyebrow">Email identity</span>
            <h2>Choose how this bot sends</h2>
            <p>
              One address can be shared by several bots. Your account can have
              up to three addresses.
            </p>
            {activeIdentities.length > 0 ? (
              <label className={styles.radioChoice}>
                <input
                  checked={effectiveEmailMode === "existing"}
                  name="draft-email-mode"
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
                name="draft-email-mode"
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
                A report delivery address is required before you deploy this
                bot.
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
            <p>&ldquo;{spec.exampleRequest}&rdquo;</p>
            <small>
              Reports are delivered to {recipientEmail || "the address you enter above"}.
            </small>
          </section>
        </aside>
      </div>

      <div className={styles.deployBar}>
        <div>
          <span>{spec.name}</span>
          <strong>
            {effectiveEmailMode === "existing"
              ? activeIdentities.find(
                  (identity) => identity._id === effectiveInboxId,
                )?.address ?? "Select an address"
              : normalizedPrefix
                ? `${normalizedPrefix}@agentmail.to`
                : "Choose an address"}
          </strong>
          {dirty || saveState === "saving" ? (
            <small className={styles.deployError}>
              Save pending: deployment uses the latest saved revision.
            </small>
          ) : null}
          {error ? <small className={styles.deployError}>{error}</small> : null}
        </div>
        {credentialsConfigured ? (
          <Button
            disabled={!deployReady || submitting}
            onClick={() => void deploy()}
            size="large"
          >
            {submitting
              ? "Deploying..."
              : draft.status === "published"
                ? "Deploy again"
                : "Confirm and deploy"}
          </Button>
        ) : (
          <a className="button button-primary button-large" href="/settings">
            Add API key in Settings
          </a>
        )}
      </div>
    </div>
  );
}
