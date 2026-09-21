export type TemplateAudience = "everyday" | "software" | "ai" | "hardware";

export type TemplateSchedule = {
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

export type BotTemplate = {
  id: string;
  name: string;
  shortDescription: string;
  mission: string;
  memory: string;
  audiences: TemplateAudience[];
  outcome: string;
  exampleRequest: string;
  schedules: TemplateSchedule[];
  featured?: boolean;
};

export type EditableTemplate = Pick<BotTemplate, "name" | "mission" | "memory" | "schedules">;
