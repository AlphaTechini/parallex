export const MODEL_CATALOG = [
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    blurb: "Cost-sensitive research",
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    blurb: "Balanced intelligence and cost",
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
  },
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    blurb: "Complex professional work",
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
  },
  {
    id: "gpt-6-astra",
    label: "GPT-6 Astra",
    blurb: "Hardest end-to-end research and document work",
    efforts: ["low", "medium", "high", "xhigh", "max"],
  },
] as const;

export const DEFAULT_MODEL = "gpt-5.6-terra";
export const DEFAULT_EFFORT = "medium";
