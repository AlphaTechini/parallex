export const MODEL_CATALOG = [
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    blurb: "Cost-sensitive research",
    provider: "openai",
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    blurb: "Balanced intelligence and cost",
    provider: "openai",
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
  },
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    blurb: "Complex professional work",
    provider: "openai",
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
  },
  {
    id: "gpt-6-astra",
    label: "GPT-6 Astra",
    blurb: "Hardest end-to-end research and document work",
    provider: "openai",
    efforts: ["low", "medium", "high", "xhigh", "max"],
  },
  {
    id: "glm-5.3-flash",
    label: "GLM-5.3 Flash",
    blurb: "Fast Coding Plan research",
    provider: "zhipu",
    efforts: ["low", "high", "max"],
  },
  {
    id: "glm-5.3",
    label: "GLM-5.3",
    blurb: "Deep Coding Plan research",
    provider: "zhipu",
    efforts: ["low", "high", "max"],
  },
] as const;

export const DEFAULT_MODEL = "gpt-5.6-terra";
export const DEFAULT_EFFORT = "medium";

export type ProviderId = (typeof MODEL_CATALOG)[number]["provider"];
export type ModelId = (typeof MODEL_CATALOG)[number]["id"];

export function defaultModelForProviders(providers: ProviderId[]): ModelId {
  return providers.includes("openai") ? DEFAULT_MODEL : "glm-5.3-flash";
}

export function defaultEffortForModel(modelId: string): string {
  const model = MODEL_CATALOG.find((candidate) => candidate.id === modelId);
  if (model?.efforts.some((effort) => effort === DEFAULT_EFFORT)) {
    return DEFAULT_EFFORT;
  }
  return model?.efforts[0] ?? DEFAULT_EFFORT;
}
