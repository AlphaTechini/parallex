export const MODEL_CATALOG = [
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
  },
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
  },
  {
    id: "gpt-6-astra",
    label: "GPT-6 Astra",
    efforts: ["low", "medium", "high", "xhigh", "max"],
  },
] as const;

export type ModelId = (typeof MODEL_CATALOG)[number]["id"];
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
