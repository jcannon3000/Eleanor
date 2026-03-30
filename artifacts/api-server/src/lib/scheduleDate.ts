// Ordered from longest to shortest to avoid prefix mis-matches
const DAY_PATTERNS: Array<{ pattern: RegExp; dow: number }> = [
  { pattern: /\bsundays?\b/i, dow: 0 },
  { pattern: /\bmondays?\b/i, dow: 1 },
  { pattern: /\btuesdays?\b|\btues\b|\btue\b/i, dow: 2 },
  { pattern: /\bwednesdays?\b|\bweds?\b/i, dow: 3 },
  { pattern: /\bthursdays?\b|\bthurs\b|\bthur\b|\bthu\b/i, dow: 4 },
  { pattern: /\bfridays?\b|\bfri\b/i, dow: 5 },
  { pattern: /\bsaturdays?\b|\bsat\b/i, dow: 6 },
  { pattern: /\bsun\b/i, dow: 0 },
  { pattern: /\bmon\b/i, dow: 1 },
];

const RRULE_DOW_TO_JS: Record<string, number> = {
  MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0,
};

function parseHourMinute(text: string): { hour: number; minute: number } | null {
  const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
    ?? text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);

  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = (match[3] ?? "").toLowerCase();

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function parseDayOfWeek(text: string): number | null {
  for (const { pattern, dow } of DAY_PATTERNS) {
    if (pattern.test(text)) return dow;
  }
  return null;
}

/**
 * Find the next date that falls on the given day-of-week (0=Sun..6=Sat),
 * starting from tomorrow.
 */
function nextWeekday(targetDow: number, hour: number, minute: number): Date {
  const now = new Date();
  const result = new Date(now);
  result.setDate(now.getDate() + 1);
  result.setHours(hour, minute, 0, 0);
  for (let i = 0; i < 7; i++) {
    if (result.getDay() === targetDow) break;
    result.setDate(result.getDate() + 1);
  }
  return result;
}

/**
 * Find the next date in the current or next month that matches an ordinal weekday pattern.
 * e.g. ordinal=1 means "first", ordinal=-1 means "last".
 */
function nextOrdinalWeekday(targetDow: number, ordinal: number, hour: number, minute: number): Date {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  // Try current month and next two months until we find a date >= tomorrow
  for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
    const year = now.getFullYear();
    const month = now.getMonth() + monthOffset;
    const actualMonth = month % 12;
    const actualYear = year + Math.floor(month / 12);

    let candidate: Date | null = null;

    if (ordinal === -1) {
      // Last occurrence: start from last day of month and go backwards
      const lastDay = new Date(actualYear, actualMonth + 1, 0);
      const d = new Date(lastDay);
      d.setHours(hour, minute, 0, 0);
      while (d.getDay() !== targetDow) {
        d.setDate(d.getDate() - 1);
      }
      candidate = d;
    } else {
      // Nth occurrence: start from first day of month and find Nth match
      const firstDay = new Date(actualYear, actualMonth, 1);
      let count = 0;
      const d = new Date(firstDay);
      d.setHours(hour, minute, 0, 0);
      while (d.getMonth() === actualMonth) {
        if (d.getDay() === targetDow) {
          count++;
          if (count === ordinal) {
            candidate = new Date(d);
            break;
          }
        }
        d.setDate(d.getDate() + 1);
      }
    }

    if (candidate && candidate >= tomorrow) {
      return candidate;
    }
  }

  // Absolute fallback: 30 days from now
  const fallback = new Date(now);
  fallback.setDate(now.getDate() + 30);
  fallback.setHours(hour, minute, 0, 0);
  return fallback;
}

/**
 * Find the next date in upcoming months that matches a specific day-of-month.
 * Only considers months that actually contain that day (e.g., skips months
 * with fewer days than the requested dayOfMonth).
 */
function nextDayOfMonth(dayOfMonth: number, hour: number, minute: number): Date {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  // Search up to 13 months forward to find a month that contains dayOfMonth
  for (let monthOffset = 0; monthOffset <= 12; monthOffset++) {
    const year = now.getFullYear();
    const month = now.getMonth() + monthOffset;
    const actualMonth = month % 12;
    const actualYear = year + Math.floor(month / 12);

    // Only use months that actually contain this day-of-month
    const lastDay = new Date(actualYear, actualMonth + 1, 0).getDate();
    if (dayOfMonth > lastDay) continue;

    const candidate = new Date(actualYear, actualMonth, dayOfMonth, hour, minute, 0, 0);
    if (candidate >= tomorrow) {
      return candidate;
    }
  }

  // Fallback: 30 days from now
  const fallback = new Date(now);
  fallback.setDate(now.getDate() + 30);
  fallback.setHours(hour, minute, 0, 0);
  return fallback;
}

export interface StructuredSchedule {
  dayOfWeek?: string;
  monthlyType?: "day_of_month" | "day_of_week_in_month";
  monthlyDayOfMonth?: number;
  monthlyWeekOrdinal?: string;
  monthlyWeekDay?: string;
}

/**
 * Derive start date from structured schedule fields, falling back to free-text parsing.
 */
export function deriveStartDate(
  dayPreference: string,
  frequency: string,
  structured?: StructuredSchedule
): Date {
  const now = new Date();
  const defaultHour = 18;
  const defaultMinute = 0;

  const timeResult = parseHourMinute(dayPreference);
  const hour = timeResult?.hour ?? defaultHour;
  const minute = timeResult?.minute ?? defaultMinute;

  // Weekly / biweekly: use structured dayOfWeek if provided
  if ((frequency === "weekly" || frequency === "biweekly") && structured?.dayOfWeek) {
    const targetDow = RRULE_DOW_TO_JS[structured.dayOfWeek];
    if (targetDow !== undefined) {
      return nextWeekday(targetDow, hour, minute);
    }
  }

  // Monthly: structured fields
  if (frequency === "monthly" && structured) {
    if (structured.monthlyType === "day_of_month" && structured.monthlyDayOfMonth) {
      return nextDayOfMonth(structured.monthlyDayOfMonth, hour, minute);
    }
    if (
      structured.monthlyType === "day_of_week_in_month" &&
      structured.monthlyWeekOrdinal &&
      structured.monthlyWeekDay
    ) {
      const targetDow = RRULE_DOW_TO_JS[structured.monthlyWeekDay];
      const ordinal = parseInt(structured.monthlyWeekOrdinal, 10);
      if (targetDow !== undefined && !isNaN(ordinal)) {
        return nextOrdinalWeekday(targetDow, ordinal, hour, minute);
      }
    }
  }

  // Fall back to free-text parsing
  const targetDow = parseDayOfWeek(dayPreference);
  if (targetDow !== null) {
    return nextWeekday(targetDow, hour, minute);
  }

  // Default: tomorrow at defaultHour
  const fallback = new Date(now);
  fallback.setDate(now.getDate() + 1);
  fallback.setHours(hour, minute, 0, 0);
  return fallback;
}
