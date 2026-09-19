import { mutation } from "./_generated/server";
import { getAuthenticatedUserId } from "./lib/authHelpers";
import { v } from "convex/values";

const MAX_RESEARCH_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/epub+zip",
  "text/csv",
  "text/html",
  "image/png",
  "image/jpeg",
  "image/tiff",
  "image/bmp",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
  "epub",
  "csv",
  "html",
  "htm",
  "png",
  "jpg",
  "jpeg",
  "tif",
  "tiff",
  "bmp",
  "webp",
  "gif",
  "heic",
  "heif",
]);

function normalizedMimeType(value: string): string {
  return value.split(";", 1)[0].trim().toLowerCase();
}

function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

function isAllowedResearchFile(fileName: string, mimeType: string): boolean {
  return (
    ALLOWED_MIME_TYPES.has(mimeType) ||
    ALLOWED_EXTENSIONS.has(fileExtension(fileName))
  );
}

export const generateResearchUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const token = crypto.randomUUID();
    const uploadUrl = await ctx.storage.generateUploadUrl();
    await ctx.db.insert("researchUploadClaims", {
      ownerId,
      token,
      createdAt: Date.now(),
    });
    return { uploadUrl, token };
  },
});

export const finalizeResearchUpload = mutation({
  args: {
    token: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const claim = await ctx.db
      .query("researchUploadClaims")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (
      claim === null ||
      claim.ownerId !== ownerId ||
      claim.storageId !== undefined ||
      claim.attachmentId !== undefined
    ) {
      throw new Error("NOT_FOUND");
    }

    const fileName = args.fileName.trim();
    const mimeType = normalizedMimeType(args.mimeType);
    if (
      !fileName ||
      fileName.includes("/") ||
      fileName.includes("\\") ||
      fileName.includes("\u0000") ||
      !isAllowedResearchFile(fileName, mimeType)
    ) {
      throw new Error("UNSUPPORTED_RESEARCH_FILE");
    }

    const existingStorageOwnership = await ctx.db
      .query("storageOwnership")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (existingStorageOwnership !== null) {
      throw new Error("STORAGE_ALREADY_CLAIMED");
    }

    const existingStorageClaim = await ctx.db
      .query("researchUploadClaims")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (existingStorageClaim !== null) {
      throw new Error("STORAGE_ALREADY_CLAIMED");
    }

    const metadata = await ctx.storage.getMetadata(args.storageId);
    const storedMimeType =
      metadata?.contentType === null || metadata?.contentType === undefined
        ? null
        : normalizedMimeType(metadata.contentType);
    if (
      metadata === null ||
      metadata.size > MAX_RESEARCH_UPLOAD_BYTES ||
      (storedMimeType !== null &&
        storedMimeType !== "application/octet-stream" &&
        !ALLOWED_MIME_TYPES.has(storedMimeType) &&
        !ALLOWED_EXTENSIONS.has(fileExtension(fileName)))
    ) {
      throw new Error("UNSUPPORTED_RESEARCH_FILE");
    }

    const now = Date.now();
    await ctx.db.insert("storageOwnership", {
      ownerId,
      storageId: args.storageId,
      purpose: "research",
      createdAt: now,
    });
    const attachmentId = await ctx.db.insert("messageAttachments", {
      ownerId,
      storageId: args.storageId,
      fileName,
      mimeType,
      sizeBytes: metadata.size,
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch("researchUploadClaims", claim._id, {
      storageId: args.storageId,
      attachmentId,
    });
    return { attachmentId };
  },
});
