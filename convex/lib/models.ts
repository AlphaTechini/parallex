export const MODEL_CATALOG = [
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    provider: "openai",
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    provider: "openai",
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
  },
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    provider: "openai",
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
  },
  {
    id: "gpt-6-astra",
    label: "GPT-6 Astra",
    provider: "openai",
    efforts: ["low", "medium", "high", "xhigh", "max"],
  },
] as const;

export type ModelId = (typeof MODEL_CATALOG)[number]["id"];
export type ProviderId = (typeof MODEL_CATALOG)[number]["provider"];
export type ReasoningEffort =
  (typeof MODEL_CATALOG)[number]["efforts"][number];

export function isValidModel(id: string): id is ModelId {
  return MODEL_CATALOG.some((model) => model.id === id);
}

export function isValidEffort(
  modelId: string,
  effort: string,
): effort is ReasoningEffort {
  const model = MODEL_CATALOG.find((candidate) => candidate.id === modelId);
  return model?.efforts.some((candidate) => candidate === effort) ?? false;
}

export function providerForModel(modelId: string): ProviderId | null {
  return MODEL_CATALOG.find((candidate) => candidate.id === modelId)?.provider ?? null;
}

export function providerForRun(run: {
  model: string;
  provider?: string;
}): ProviderId {
  const modelProvider = providerForModel(run.model);
  if (
    modelProvider === null ||
    (run.provider !== undefined && run.provider !== modelProvider)
  ) {
    throw new Error("INVALID_MODEL_PROVIDER");
  }
  return modelProvider;
}
