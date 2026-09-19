export const FIRECRAWL_OUTPUT_BUDGET = 180_000;
export const MAX_RESULT_DOCUMENTS = 100;
export const MAX_DOCUMENT_EVIDENCE_CHARS = 8_000;

const MAX_ARRAY_ITEMS = 100;
const MAX_OBJECT_KEYS = 100;
const DEFAULT_STRING_LIMIT = 4_000;
const URL_STRING_LIMIT = 2_048;
const SHORT_STRING_LIMIT = 500;
const DOCUMENT_METADATA_BUDGET = 1_500;

type JsonObject = { [key: string]: JsonValue };
type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
type JsonContainer = JsonObject | JsonValue[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keyPriority(key: string): number {
  const normalized = key.toLowerCase();
  if (["ok", "capability", "url", "sourceurl", "sources", "documents"].includes(normalized)) {
    return 100;
  }
  if (["title", "description", "publisher", "retrievedat", "retrievalmethod"].includes(normalized)) {
    return 80;
  }
  if (["data", "results", "rows", "output", "answer", "markdown"].includes(normalized)) {
    return 70;
  }
  if (["providerdata", "screenshot", "images", "audio", "video", "rawhtml", "html"].includes(normalized)) {
    return 20;
  }
  return 50;
}

function stringLimitForKey(key: string): number {
  const normalized = key.toLowerCase();
  if (
    normalized.includes("url") ||
    normalized.includes("href") ||
    normalized.includes("scrapeid") ||
    normalized.includes("mediaurl")
  ) {
    return URL_STRING_LIMIT;
  }
  if (
    normalized === "title" ||
    normalized === "label" ||
    normalized === "publisher" ||
    normalized === "filename" ||
    normalized === "mimetype"
  ) {
    return SHORT_STRING_LIMIT;
  }
  if (
    normalized.includes("markdown") ||
    normalized.includes("html") ||
    normalized.includes("summary") ||
    normalized.includes("answer") ||
    normalized.includes("highlight") ||
    normalized.includes("excerpt") ||
    normalized.includes("evidence") ||
    normalized.includes("abstract") ||
    normalized.includes("snippet") ||
    normalized.includes("content") ||
    normalized.includes("pageattribution")
  ) {
    return MAX_DOCUMENT_EVIDENCE_CHARS;
  }
  return DEFAULT_STRING_LIMIT;
}

function normalizeJsonValue(
  value: unknown,
  key: string,
  seen: WeakSet<object>,
): JsonValue {
  if (value === null) return null;
  if (typeof value === "string") {
    return value.replace(/\u0000/g, "").slice(0, stringLimitForKey(key));
  }
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString().slice(0, DEFAULT_STRING_LIMIT);
  if (typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    const limit = key.toLowerCase() === "documents" ? MAX_RESULT_DOCUMENTS : MAX_ARRAY_ITEMS;
    const result = value
      .slice(0, limit)
      .map((item) => normalizeJsonValue(item, key, seen));
    seen.delete(value);
    return result;
  }

  const entries = Object.entries(value).filter(([entryKey]) => entryKey.length <= 200);
  const selected = entries
    .map(([entryKey, entryValue], index) => ({ entryKey, entryValue, index }))
    .sort((left, right) => {
      const priority = keyPriority(right.entryKey) - keyPriority(left.entryKey);
      return priority === 0 ? left.index - right.index : priority;
    })
    .slice(0, MAX_OBJECT_KEYS)
    .sort((left, right) => left.index - right.index);
  const result: JsonObject = {};
  for (const entry of selected) {
    result[entry.entryKey] = normalizeJsonValue(entry.entryValue, entry.entryKey, seen);
  }
  seen.delete(value);
  return result;
}

function serializedLength(value: JsonValue): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

type StringSlot = {
  parent: JsonContainer;
  key: string | number;
  value: string;
};

function findLongestString(value: JsonValue): StringSlot | undefined {
  let longest: StringSlot | undefined;
  const visit = (current: JsonValue, parent: JsonContainer | undefined, key: string | number | undefined) => {
    if (typeof current === "string") {
      if (parent !== undefined && (longest === undefined || current.length > longest.value.length)) {
        longest = { parent, key: key as string | number, value: current };
      }
      return;
    }
    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) {
        visit(current[index], current, index);
      }
      return;
    }
    if (typeof current === "object" && current !== null) {
      for (const [entryKey, entryValue] of Object.entries(current)) {
        visit(entryValue, current, entryKey);
      }
    }
  };
  visit(value, undefined, undefined);
  return longest;
}

function findLargestArray(value: JsonValue): JsonValue[] | undefined {
  let largest: JsonValue[] | undefined;
  const visit = (current: JsonValue) => {
    if (Array.isArray(current)) {
      if (current.length > (largest?.length ?? 0)) largest = current;
      for (const item of current) visit(item);
      return;
    }
    if (typeof current === "object" && current !== null) {
      for (const item of Object.values(current)) visit(item);
    }
  };
  visit(value);
  return largest;
}

type PropertySlot = {
  parent: JsonObject;
  key: string;
};

function findDroppableProperty(value: JsonValue): PropertySlot | undefined {
  let candidate: (PropertySlot & { priority: number; valueSize: number }) | undefined;
  const visit = (current: JsonValue, isRoot: boolean) => {
    if (Array.isArray(current)) {
      for (const item of current) visit(item, false);
      return;
    }
    if (typeof current !== "object" || current === null) return;
    for (const [key, child] of Object.entries(current)) {
      const priority = keyPriority(key);
      const valueSize = serializedLength(child);
      if ((!isRoot || Object.keys(current).length > 1) &&
          (candidate === undefined || priority < candidate.priority ||
            (priority === candidate.priority && valueSize > candidate.valueSize))) {
        candidate = { parent: current, key, priority, valueSize };
      }
      visit(child, false);
    }
  };
  visit(value, true);
  return candidate;
}

function reduceToBudget(value: JsonValue, maxChars: number): JsonValue {
  for (let attempt = 0; attempt < 2_000 && serializedLength(value) > maxChars; attempt += 1) {
    const stringSlot = findLongestString(value);
    if (stringSlot !== undefined && stringSlot.value.length > 0) {
      const nextLength = Math.max(0, Math.floor(stringSlot.value.length / 2));
      if (Array.isArray(stringSlot.parent) && typeof stringSlot.key === "number") {
        stringSlot.parent[stringSlot.key] = stringSlot.value.slice(0, nextLength);
      } else if (!Array.isArray(stringSlot.parent) && typeof stringSlot.key === "string") {
        stringSlot.parent[stringSlot.key] = stringSlot.value.slice(0, nextLength);
      }
      continue;
    }

    const array = findLargestArray(value);
    if (array !== undefined && array.length > 0) {
      array.pop();
      continue;
    }

    const property = findDroppableProperty(value);
    if (property !== undefined) {
      delete property.parent[property.key];
      continue;
    }
    break;
  }
  return value;
}

export function boundedJson(value: unknown, maxChars = FIRECRAWL_OUTPUT_BUDGET): unknown {
  const normalized = normalizeJsonValue(value, "", new WeakSet<object>());
  const bounded = reduceToBudget(normalized, Math.max(128, Math.trunc(maxChars)));
  if (serializedLength(bounded) <= maxChars) return bounded;
  if (isRecord(value)) return { ok: false, error: "output_budget_exceeded" };
  if (Array.isArray(value)) return [];
  return null;
}

export function boundedJsonString(value: unknown, maxChars = FIRECRAWL_OUTPUT_BUDGET): string {
  const bounded = boundedJson(value, maxChars);
  const serialized = JSON.stringify(bounded);
  return serialized === undefined ? "null" : serialized;
}

export function boundedProviderDocument(value: unknown): Record<string, unknown> {
  const bounded = boundedJson(value, MAX_DOCUMENT_EVIDENCE_CHARS + DOCUMENT_METADATA_BUDGET);
  return isRecord(bounded) ? bounded : {};
}
