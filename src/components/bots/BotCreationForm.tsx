"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useState } from "react";

import { api } from "../../../convex/_generated/api";
import { BotAvatar } from "@/components/bots/BotAvatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { safeErrorMessage } from "@/lib/errors";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function BotCreationForm() {
  const profile = useQuery(api.userProfiles.getMyProfile, {});
  const emailIdentities = useQuery(api.bots.listEmailIdentities, {});
  const generateUpload = useMutation(api.bots.generateAvatarUploadUrl);
  const finalizeUpload = useMutation(api.bots.finalizeAvatarUpload);
  const createBot = useMutation(api.bots.createBot);
  const router = useRouter();
  const [name, setName] = useState("");
  const [mission, setMission] = useState("");
  const [memory, setMemory] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailMode, setEmailMode] = useState<"existing" | "new" | null>(null);
  const [selectedInboxId, setSelectedInboxId] = useState("");
  const [emailPrefix, setEmailPrefix] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveRecipient = recipientEmail || profile?.accountEmail || "";
  const activeEmailIdentities = (emailIdentities ?? []).filter(
    (identity) => identity.status === "active" && identity.address !== null,
  );
  const emailAddressLimitReached = (emailIdentities?.length ?? 0) >= 3;
  const normalizedEmailPrefix = emailPrefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  const effectiveEmailMode =
    emailMode ?? (activeEmailIdentities.length > 0 ? "existing" : "new");
  const effectiveInboxId =
    selectedInboxId || activeEmailIdentities[0]?._id || "";
  const emailSelectionReady =
    effectiveEmailMode === "existing"
      ? Boolean(effectiveInboxId)
      : !emailAddressLimitReached;

  function handleAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError(null);
    if (file && (!file.type.startsWith("image/") || file.size > MAX_AVATAR_BYTES)) {
      setAvatar(null);
      setAvatarPreview(null);
      setError("Choose an image smaller than 2 MB.");
      return;
    }
    setAvatar(file);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
  }

  async function uploadAvatar(): Promise<Id<"_storage"> | undefined> {
    if (!avatar) return undefined;
    const { uploadUrl, token } = await generateUpload({});
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": avatar.type },
      body: avatar,
    });
    if (!response.ok) throw new Error("INVALID_AVATAR");
    const body = (await response.json()) as { storageId: Id<"_storage"> };
    await finalizeUpload({ token, storageId: body.storageId });
    return body.storageId;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const avatarStorageId = await uploadAvatar();
      const result = await createBot({
        name,
        mission,
        memory: memory || undefined,
        recipientEmail: effectiveRecipient,
        avatarStorageId,
        ...(effectiveEmailMode === "existing"
          ? { emailInboxId: effectiveInboxId as Id<"agentMailInboxes"> }
          : { desiredEmailUsername: normalizedEmailPrefix || name }),
      });
      router.push(`/bots?botId=${result.botId}`);
    } catch (cause) {
      setError(safeErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="creation-layout" onSubmit={handleSubmit}>
      <Card className="form-card">
        <div className="section-heading">
          <span>Identity</span>
          <h2>Name the specialist</h2>
        </div>
        <label className="field-label">
          <span>Bot name</span>
          <input
            className="text-input"
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Market Signal"
            required
            value={name}
          />
        </label>
        <label className="field-label">
          <span className="label-row">
            Mission <small>{mission.length}/500</small>
          </span>
          <textarea
            className="text-area"
            maxLength={500}
            onChange={(event) => setMission(event.target.value)}
            placeholder="Tracks product launches and market shifts in climate software."
            required
            rows={4}
            value={mission}
          />
          <small>
            Mission is descriptive metadata shown on the dashboard. It is not
            sent to the model. Put behavior rules in Memory.
          </small>
        </label>
        <label className="field-label">
          <span>Memory</span>
          <textarea
            className="text-area"
            onChange={(event) => setMemory(event.target.value)}
            placeholder="Prefer primary sources. Call out conflicting claims."
            rows={6}
            value={memory}
          />
          <small>Private instructions that guide this bot&apos;s research.</small>
        </label>
      </Card>

      <div className="creation-sidebar">
        <Card className="form-card">
          <div className="section-heading">
            <span>Delivery</span>
            <h2>Choose the destination</h2>
          </div>
          <label className="field-label">
            <span>Recipient email</span>
            <input
              className="text-input"
              onChange={(event) => setRecipientEmail(event.target.value)}
              placeholder={profile?.accountEmail ?? "you@company.com"}
              required
              type="email"
              value={effectiveRecipient}
            />
            <small>Reports arrive here from the bot&apos;s own inbox.</small>
          </label>
          {activeEmailIdentities.length > 0 ? (
            <label className="field-label">
              <span>Bot email address</span>
              <select
                onChange={(event) => {
                  const value = event.target.value;
                  setEmailMode(value === "new" ? "new" : "existing");
                  if (value !== "new") setSelectedInboxId(value);
                }}
                value={effectiveEmailMode === "new" ? "new" : effectiveInboxId}
              >
                {activeEmailIdentities.map((identity) => (
                  <option key={identity._id} value={identity._id}>
                    {identity.address}
                  </option>
                ))}
                {!emailAddressLimitReached ? (
                  <option value="new">Create a new address</option>
                ) : null}
              </select>
            </label>
          ) : null}
          {effectiveEmailMode === "new" && !emailAddressLimitReached ? (
            <label className="field-label">
              <span>Email prefix</span>
              <input
                className="text-input"
                maxLength={30}
                onChange={(event) => setEmailPrefix(event.target.value)}
                placeholder={name || "research-bot"}
                value={emailPrefix}
              />
              <small>
                {normalizedEmailPrefix || "research-bot"}@agentmail.to. Leave
                blank to derive the prefix from the bot name.
              </small>
            </label>
          ) : null}
          {effectiveEmailMode === "new" && emailAddressLimitReached ? (
            <p className="form-error">
              Your account already has three email addresses. Assign an
              existing one to continue.
            </p>
          ) : null}
          <p className="limit-note">
            Unlimited bots can share up to three email addresses.
          </p>
        </Card>

        <Card className="form-card avatar-card">
          <div className="avatar-preview">
            {avatarPreview ? (
              <BotAvatar
                avatar={{ kind: "upload", url: avatarPreview }}
                name={name || "New bot"}
                size="large"
              />
            ) : (
              <BotAvatar
                avatar={{ kind: "default", colorIndex: 2 }}
                name={name || "New bot"}
                size="large"
              />
            )}
            <div>
              <strong>{avatar ? avatar.name : "Auto-generated avatar"}</strong>
              <span>Image, up to 2 MB</span>
            </div>
          </div>
          <label className="file-label">
            Choose image
            <input accept="image/*" onChange={handleAvatar} type="file" />
          </label>
        </Card>

        {error ? <p className="form-error">{error}</p> : null}
        <Button
          disabled={submitting || !emailSelectionReady}
          size="large"
          type="submit"
        >
          {submitting ? "Creating bot..." : "Create research bot"}
        </Button>
      </div>
    </form>
  );
}
