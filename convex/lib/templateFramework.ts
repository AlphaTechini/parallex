import {
  COMPREHENSIVE_TEMPLATE_FRAMEWORK,
  TEMPLATE_FRAMEWORK_VERSION,
} from "../../shared/templateFramework";

export type TemplateImportance = "essential" | "high" | "medium" | "low";

export type TemplateEvaluationCriterion = {
  name: string;
  description: string;
  importance: TemplateImportance;
  weight: number;
  priceRelevant: boolean;
};

export type TemplateScheduleSpecification = {
  id: string;
  name: string;
  summary: string;
  researchPrompt: string;
  frequency: "hourly" | "daily" | "weekly" | "monthly";
  interval: number;
  localHour: number;
  localMinute: number;
  weekday?: number;
  dayOfMonth?: number;
};

export type TemplateSpecification = {
  name: string;
  shortDescription: string;
  mission: string;
  outcome: string;
  exampleRequest: string;
  category: "everyday" | "software" | "ai" | "hardware" | "custom";
  role: string;
  intendedUser: string;
  intakeQuestions: string[];
  hardConstraints: string[];
  evaluationCriteria: TemplateEvaluationCriterion[];
  pricingMethod: string;
  researchWorkflow: string[];
  sourceStandards: string[];
  rankingMethod: string[];
  outputRequirements: string[];
  actionRules: string[];
  uncertaintyRules: string[];
  safetyBoundaries: string[];
  schedules: TemplateScheduleSpecification[];
};

function cleanText(
  value: string,
  field: string,
  minimum: number,
  maximum: number,
): string {
  const cleaned = value.replace(/\u0000/g, "").trim();
  if (cleaned.length < minimum || cleaned.length > maximum) {
    throw new Error(`INVALID_TEMPLATE_${field.toUpperCase()}`);
  }
  return cleaned;
}

function cleanList(
  values: string[],
  field: string,
  minimumItems: number,
  maximumItems: number,
  maximumLength = 1_000,
): string[] {
  if (values.length < minimumItems || values.length > maximumItems) {
    throw new Error(`INVALID_TEMPLATE_${field.toUpperCase()}`);
  }
  return values.map((value) => cleanText(value, field, 4, maximumLength));
}

export function normalizeTemplateSpecification(
  value: TemplateSpecification,
): TemplateSpecification {
  const evaluationCriteria = value.evaluationCriteria.map((criterion) => ({
    name: cleanText(criterion.name, "criteria", 2, 120),
    description: cleanText(criterion.description, "criteria", 8, 800),
    importance: criterion.importance,
    weight: criterion.weight,
    priceRelevant: criterion.priceRelevant,
  }));
  if (evaluationCriteria.length < 3 || evaluationCriteria.length > 12) {
    throw new Error("INVALID_TEMPLATE_EVALUATION_CRITERIA");
  }
  if (
    !evaluationCriteria.some((criterion) =>
      ["essential", "high"].includes(criterion.importance),
    ) ||
    evaluationCriteria.some(
      (criterion) =>
        !Number.isInteger(criterion.weight) ||
        criterion.weight < 1 ||
        criterion.weight > 100,
    )
  ) {
    throw new Error("INVALID_TEMPLATE_EVALUATION_CRITERIA");
  }

  const seenScheduleIds = new Set<string>();
  if (value.schedules.length > 3) {
    throw new Error("INVALID_TEMPLATE_SCHEDULES");
  }
  const schedules = value.schedules.map((schedule) => {
    const id = cleanText(schedule.id, "schedule", 2, 80)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!id || seenScheduleIds.has(id)) {
      throw new Error("INVALID_TEMPLATE_SCHEDULES");
    }
    seenScheduleIds.add(id);
    if (
      !Number.isInteger(schedule.interval) ||
      schedule.interval < 1 ||
      schedule.interval > 365 ||
      !Number.isInteger(schedule.localHour) ||
      schedule.localHour < 0 ||
      schedule.localHour > 23 ||
      !Number.isInteger(schedule.localMinute) ||
      schedule.localMinute < 0 ||
      schedule.localMinute > 59 ||
      (schedule.weekday !== undefined &&
        (!Number.isInteger(schedule.weekday) ||
          schedule.weekday < 1 ||
          schedule.weekday > 7)) ||
      (schedule.dayOfMonth !== undefined &&
        (!Number.isInteger(schedule.dayOfMonth) ||
          schedule.dayOfMonth < 1 ||
          schedule.dayOfMonth > 31))
    ) {
      throw new Error("INVALID_TEMPLATE_SCHEDULES");
    }
    return {
      ...schedule,
      id,
      name: cleanText(schedule.name, "schedule", 3, 160),
      summary: cleanText(schedule.summary, "schedule", 8, 500),
      researchPrompt: cleanText(
        schedule.researchPrompt,
        "schedule",
        20,
        6_000,
      ),
    };
  });

  return {
    name: cleanText(value.name, "name", 3, 80),
    shortDescription: cleanText(
      value.shortDescription,
      "description",
      12,
      240,
    ),
    mission: cleanText(value.mission, "mission", 20, 500),
    outcome: cleanText(value.outcome, "outcome", 12, 500),
    exampleRequest: cleanText(value.exampleRequest, "example", 8, 500),
    category: value.category,
    role: cleanText(value.role, "role", 20, 1_500),
    intendedUser: cleanText(value.intendedUser, "intended_user", 12, 1_000),
    intakeQuestions: cleanList(value.intakeQuestions, "intake", 3, 12),
    hardConstraints: cleanList(value.hardConstraints, "constraints", 1, 12),
    evaluationCriteria,
    pricingMethod: cleanText(value.pricingMethod, "pricing", 30, 3_000),
    researchWorkflow: cleanList(value.researchWorkflow, "workflow", 3, 15),
    sourceStandards: cleanList(value.sourceStandards, "sources", 2, 12),
    rankingMethod: cleanList(value.rankingMethod, "ranking", 2, 12),
    outputRequirements: cleanList(value.outputRequirements, "output", 3, 15),
    actionRules: cleanList(value.actionRules, "actions", 1, 12),
    uncertaintyRules: cleanList(value.uncertaintyRules, "uncertainty", 2, 12),
    safetyBoundaries: cleanList(value.safetyBoundaries, "safety", 1, 12),
    schedules,
  };
}

function bullets(values: string[]): string {
  return values.map((value) => `- ${value}`).join("\n");
}

function compileScheduleBootstrap(
  schedules: TemplateScheduleSpecification[],
  timezone: string,
): string | null {
  if (schedules.length === 0) return null;
  const definitions = schedules
    .map(
      (schedule) =>
        `- Stable schedule key: ${schedule.id}\n  Name: ${schedule.name}\n  Purpose: ${schedule.summary}\n  Research prompt: ${schedule.researchPrompt}\n  Recurrence: ${schedule.frequency}, interval ${schedule.interval}, local time ${String(schedule.localHour).padStart(2, "0")}:${String(schedule.localMinute).padStart(2, "0")}${schedule.weekday === undefined ? "" : `, ISO weekday ${schedule.weekday}`}${schedule.dayOfMonth === undefined ? "" : `, day ${schedule.dayOfMonth}`}`,
    )
    .join("\n");
  return `FIRST-RUN SCHEDULE BOOTSTRAP
On the first conversation run, before completing the user's request:
1. Call list_research_schedules to inspect this bot's existing active and paused schedules.
2. Match each schedule below by stable key, name, purpose, and recurrence. Do not create an equivalent schedule twice.
3. Create only missing schedules with create_research_schedule. Use timezone ${timezone} and compute the next future occurrence from the runtime date.
4. Put the stable schedule key in semanticReason and report only tool-confirmed outcomes.

${definitions}`;
}

export function compileTemplateMemory(
  value: TemplateSpecification,
  timezone = "the deployment timezone",
): string {
  const specification = normalizeTemplateSpecification(value);
  const criteria = specification.evaluationCriteria
    .map(
      (criterion) =>
        `- ${criterion.name} [${criterion.importance}; weight ${criterion.weight}${criterion.priceRelevant ? "; price-relevant" : ""}]: ${criterion.description}`,
    )
    .join("\n");
  return [
    `TEMPLATE FRAMEWORK VERSION\n${TEMPLATE_FRAMEWORK_VERSION}`,
    `ROLE\n${specification.role}`,
    `INTENDED USER\n${specification.intendedUser}`,
    `MISSION\n${specification.mission}`,
    `USER INTAKE\n${bullets(specification.intakeQuestions)}`,
    `HARD CONSTRAINTS\n${bullets(specification.hardConstraints)}`,
    `EVALUATION CRITERIA\n${criteria}`,
    `PRICING METHOD\n${specification.pricingMethod}`,
    `RESEARCH WORKFLOW\n${specification.researchWorkflow
      .map((step, index) => `${index + 1}. ${step}`)
      .join("\n")}`,
    `SOURCE STANDARDS\n${bullets(specification.sourceStandards)}`,
    `RANKING METHOD\n${bullets(specification.rankingMethod)}`,
    `OUTPUT REQUIREMENTS\n${bullets(specification.outputRequirements)}`,
    `ACTION RULES\n${bullets(specification.actionRules)}`,
    `UNCERTAINTY RULES\n${bullets(specification.uncertaintyRules)}`,
    `SAFETY BOUNDARIES\n${bullets(specification.safetyBoundaries)}`,
    COMPREHENSIVE_TEMPLATE_FRAMEWORK,
    compileScheduleBootstrap(specification.schedules, timezone),
  ]
    .filter((section): section is string => section !== null)
    .join("\n\n");
}
