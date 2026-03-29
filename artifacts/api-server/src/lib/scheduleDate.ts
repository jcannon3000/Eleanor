// Ordered from longest to shortest to avoid prefix mis-matches
const DAY_PATTERNS: Array<{ pattern: RegExp; dow: number }> = [
  { pattern: /\bsundays?\b/i, dow: 0 },
  { pattern: /\bmondays?\b/i, dow: 1 },
  { pattern: /\btuesdays?\b|\btues\b|\btue\b/i, dow: 2 },
  { pattern: /\bwednesdays?\b|\bweds?\b/i, dow: 3 },
  { pattern: /\bthursdays?\b|\bthurs\b|\bthur\b|\bthu\b/i, dow: 4 },
  { pattern: /\bfridays?\b|\bfri\b/i, dow: 5 },
  { pattern: /\bsaturdays?\b|\bsat\b/i, dow: 6 },
  // Short abbreviations last (only match if no longer form already matched)
  { pattern: /\bsun\b/i, dow: 0 },
  { pattern: /\bmon\b/i, dow: 1 },
];

function parseHourMinute(text: string): { hour: number; minute: number } | null {
  // Only match if explicit am/pm or HH:MM 24-hour — bare numbers are too ambiguous
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
 * Given a dayPreference string (e.g. "Thursday evenings", "Last Sunday of the month at 6pm",
 * "Tuesdays at 7:30pm") and a frequency, returns the next reasonable start Date.
 *
 * Falls back to: tomorrow at 18:00 UTC when parsing fails.
 */
export function deriveStartDate(dayPreference: string, _frequency: string): Date {
  const now = new Date();
  const defaultHour = 18;
  const defaultMinute = 0;

  const targetDow = parseDayOfWeek(dayPreference);
  const timeResult = parseHourMinute(dayPreference);
  const hour = timeResult?.hour ?? defaultHour;
  const minute = timeResult?.minute ?? defaultMinute;

  if (targetDow !== null) {
    // Find the next occurrence of targetDow that is >= tomorrow
    const result = new Date(now);
    result.setDate(now.getDate() + 1); // start from tomorrow
    result.setHours(hour, minute, 0, 0);

    // Advance until we land on the right weekday
    for (let i = 0; i < 7; i++) {
      if (result.getDay() === targetDow) break;
      result.setDate(result.getDate() + 1);
    }

    return result;
  }

  // No weekday found — use tomorrow + parsed time (or default)
  const fallback = new Date(now);
  fallback.setDate(now.getDate() + 1);
  fallback.setHours(hour, minute, 0, 0);
  return fallback;
}
