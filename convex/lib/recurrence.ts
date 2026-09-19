import { DateTime, IANAZone } from "luxon";

export type RecurrenceFrequency = "hourly" | "daily" | "weekly" | "monthly";

export type NormalizedRecurrence = {
  frequency: RecurrenceFrequency;
  interval: number;
  hour?: number;
  minute?: number;
  weekday?: number;
  dayOfMonth?: number;
};

type RecurrenceInput = {
  frequency: RecurrenceFrequency | null;
  interval: number | null;
  hour: number | null;
  minute: number | null;
  weekday: number | null;
  dayOfMonth: number | null;
};

export function isValidTimeZone(timezone: string): boolean {
  return IANAZone.isValidZone(timezone);
}

function localDateTime(timestamp: number, timezone: string): DateTime {
  return DateTime.fromMillis(timestamp, { zone: timezone });
}

function boundedNumber(value: number | null, fallback: number, min: number, max: number): number {
  const candidate = value ?? fallback;
  if (!Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw new Error("INVALID_RECURRENCE");
  }
  return candidate;
}

function daysInMonth(year: number, month: number, timezone: string): number {
  return DateTime.fromObject({ year, month, day: 1 }, { zone: timezone }).daysInMonth ?? 0;
}

export function normalizeRecurrence(
  input: RecurrenceInput,
  timezone: string,
  firstRunAt: number,
): NormalizedRecurrence {
  if (!isValidTimeZone(timezone)) throw new Error("INVALID_TIMEZONE");
  if (input.frequency === null) throw new Error("INVALID_RECURRENCE");

  const firstLocal = localDateTime(firstRunAt, timezone);
  if (!firstLocal.isValid) throw new Error("INVALID_RECURRENCE");

  const interval = boundedNumber(input.interval, 1, 1, 365);
  const minute = boundedNumber(input.minute, firstLocal.minute, 0, 59);

  switch (input.frequency) {
    case "hourly":
      return { frequency: "hourly", interval, minute };
    case "daily":
      return {
        frequency: "daily",
        interval,
        hour: boundedNumber(input.hour, firstLocal.hour, 0, 23),
        minute,
      };
    case "weekly":
      return {
        frequency: "weekly",
        interval,
        hour: boundedNumber(input.hour, firstLocal.hour, 0, 23),
        minute,
        weekday: boundedNumber(input.weekday, firstLocal.weekday, 1, 7),
      };
    case "monthly": {
      const dayOfMonth = boundedNumber(
        input.dayOfMonth,
        firstLocal.day,
        1,
        31,
      );
      return {
        frequency: "monthly",
        interval,
        hour: boundedNumber(input.hour, firstLocal.hour, 0, 23),
        minute,
        dayOfMonth,
      };
    }
  }
}

function withLocalTime(
  value: DateTime,
  recurrence: NormalizedRecurrence,
): DateTime {
  return value.set({
    hour: recurrence.hour ?? value.hour,
    minute: recurrence.minute ?? value.minute,
    second: 0,
    millisecond: 0,
  });
}

function nextHourly(
  after: DateTime,
  recurrence: NormalizedRecurrence,
): DateTime {
  const interval = recurrence.interval;
  const candidate = after.plus({ hours: interval }).set({
    minute: recurrence.minute ?? after.minute,
    second: 0,
    millisecond: 0,
  });
  return candidate.toMillis() > after.toMillis()
    ? candidate
    : candidate.plus({ hours: interval });
}

function nextDaily(after: DateTime, recurrence: NormalizedRecurrence): DateTime {
  let candidate = withLocalTime(after.startOf("day"), recurrence);
  if (candidate.toMillis() <= after.toMillis()) {
    candidate = withLocalTime(
      candidate.plus({ days: recurrence.interval }),
      recurrence,
    );
  }
  return candidate;
}

function nextWeekly(after: DateTime, recurrence: NormalizedRecurrence): DateTime {
  const targetWeekday = recurrence.weekday ?? after.weekday;
  const currentWeekday = after.weekday;
  let daysAhead = targetWeekday - currentWeekday;
  if (daysAhead < 0) daysAhead += 7;

  let candidate = withLocalTime(after.startOf("day").plus({ days: daysAhead }), recurrence);
  if (candidate.toMillis() <= after.toMillis()) {
    candidate = withLocalTime(
      candidate.plus({ weeks: recurrence.interval }),
      recurrence,
    );
  }
  return candidate;
}

function nextMonthly(after: DateTime, recurrence: NormalizedRecurrence, timezone: string): DateTime {
  const targetDay = recurrence.dayOfMonth ?? after.day;
  let month = after.startOf("month");
  let candidateDay = Math.min(
    targetDay,
    daysInMonth(month.year, month.month, timezone),
  );
  let candidate = withLocalTime(month.set({ day: candidateDay }), recurrence);
  if (candidate.toMillis() <= after.toMillis()) {
    month = month.plus({ months: recurrence.interval });
    candidateDay = Math.min(
      targetDay,
      daysInMonth(month.year, month.month, timezone),
    );
    candidate = withLocalTime(month.set({ day: candidateDay }), recurrence);
  }
  return candidate;
}

export function nextOccurrence(
  recurrence: NormalizedRecurrence,
  timezone: string,
  afterTimestamp: number,
): number {
  if (!isValidTimeZone(timezone)) throw new Error("INVALID_TIMEZONE");
  if (!Number.isFinite(afterTimestamp)) throw new Error("INVALID_TIMESTAMP");

  const after = localDateTime(afterTimestamp, timezone);
  if (!after.isValid) throw new Error("INVALID_TIMESTAMP");

  const candidate =
    recurrence.frequency === "hourly"
      ? nextHourly(after, recurrence)
      : recurrence.frequency === "daily"
        ? nextDaily(after, recurrence)
        : recurrence.frequency === "weekly"
          ? nextWeekly(after, recurrence)
           : nextMonthly(after, recurrence, timezone);

  if (!candidate.isValid || candidate.toMillis() <= afterTimestamp) {
    throw new Error("INVALID_RECURRENCE");
  }
  return candidate.toMillis();
}
