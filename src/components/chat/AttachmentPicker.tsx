"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { type ChangeEvent, useRef, useState } from "react";

import { api } from "../../../convex/_generated/api";
import { Spinner } from "@/components/ui/Spinner";
import { safeErrorMessage } from "@/lib/errors";
import { formatBytes } from "@/lib/format";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.epub,.csv,.html,.htm,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp,.gif,.heic,.heif";

export type UploadedAttachment = {
  id: Id<"messageAttachments">;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export function AttachmentPicker({
  attachments,
  onChange,
  disabled,
}: {
  attachments: UploadedAttachment[];
  onChange: (attachments: UploadedAttachment[]) => void;
  disabled?: boolean;
}) {
  const generateUpload = useMutation(api.attachments.generateResearchUploadUrl);
  const finalizeUpload = useMutation(api.attachments.finalizeResearchUpload);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    setError(null);
    try {
      const next = [...attachments];
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          throw new Error("UNSUPPORTED_RESEARCH_FILE");
        }
        const { uploadUrl, token } = await generateUpload({});
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!response.ok) throw new Error("UPLOAD_FAILED");
        const body = (await response.json()) as { storageId: Id<"_storage"> };
        const result = await finalizeUpload({
          token,
          storageId: body.storageId,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
        });
        next.push({
          id: result.attachmentId,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        });
      }
      onChange(next);
    } catch (cause) {
      setError(safeErrorMessage(cause));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="attachment-picker">
      {attachments.length ? (
        <div className="attachment-chips">
          {attachments.map((attachment) => (
            <span className="attachment-chip" key={attachment.id}>
              <span aria-hidden="true">▤</span>
              <span>{attachment.fileName}</span>
              <small>{formatBytes(attachment.sizeBytes)}</small>
              <button
                aria-label={`Remove ${attachment.fileName}`}
                onClick={() => onChange(attachments.filter((item) => item.id !== attachment.id))}
                type="button"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <button
        className="attachment-trigger"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        title="Attach a document"
        type="button"
      >
        {uploading ? <Spinner label="Uploading document" /> : <span aria-hidden="true">＋</span>}
        <span>{uploading ? "Uploading" : "Attach"}</span>
      </button>
      <input
        accept={ACCEPTED}
        className="sr-only"
        multiple
        onChange={upload}
        ref={inputRef}
        type="file"
      />
      {error ? <span className="form-error">{error}</span> : null}
    </div>
  );
}
