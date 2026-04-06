/**
 * Gathering rhythm helpers for Phoebe.
 *
 * A gathering has a committed rhythm: weekly | fortnightly | monthly.
 * The rhythm is the covenant. Phoebe surfaces the next window
 * so the group can find a time within it.
 */

export type GatheringRhythm = "weekly" | "fortnightly" | "monthly";

export interface GatheringWindow {
  suggestedDates: Date[];
  windowStart: Date;
  windowEnd: Date;
  label: string;
  missed: boolean;
  missedLabel?: string;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function mondayOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(m.getDate() + diff);
  return startOfDay(m);
}

function sundayOfWeek(d: Date): Date {
  const mon = mondayOfWeek(d);
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  return sun;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

function endOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatWindowLabel(start: Date, end: Date): string {
  if (start.getMonth() === end.getMonth()) {
    return `${MONTH_LONG[start.getMonth()]} ${start.getDate()}–${end.getDate()}`;
  }
  return `${MONTH_LONG[start.getMonth()]} ${start.getDate()} – ${MONTH_LONG[end.getMonth()]} ${end.getDate()}`;
}

/**
 * Given a gathering's rhythm and the date of its last confirmed meetup
 * (or startedAt), return the next gathering window.
 */
export function getNextGatheringWindow(
  rhythm: GatheringRhythm,
  lastMeetupDate: Date | null,
  now: Date = new Date(),
): GatheringWindow {
  const today = startOfDay(now);

  if (rhythm === "weekly") {
    const windowStart = mondayOfWeek(today);
    const windowEnd = sundayOfWeek(today);

    // Check if missed: last meetup was before this week's window
    const missed = lastMeetupDate
      ? startOfDay(lastMeetupDate) < addDays(windowStart, -7)
      : false;

    const suggestedDates = [
      addDays(windowStart, 1), // Tuesday
      addDays(windowStart, 3), // Thursday
      addDays(windowStart, 5), // Saturday
    ];

    return {
      suggestedDates,
      windowStart,
      windowEnd,
      label: `This week · ${formatWindowLabel(windowStart, windowEnd)}`,
      missed,
      missedLabel: missed ? `You missed last week — here's your next window. 🌿` : undefined,
    };
  }

  if (rhythm === "fortnightly") {
    // Find the 14-day window that contains today, anchored from lastMeetupDate or 2 weeks ago
    const anchor = lastMeetupDate ? startOfDay(lastMeetupDate) : addDays(today, -14);
    const daysSinceAnchor = Math.floor((today.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
    const periodsElapsed = Math.floor(daysSinceAnchor / 14);
    const windowStart = addDays(anchor, periodsElapsed * 14);
    const windowEnd = addDays(windowStart, 13);

    const missed = lastMeetupDate
      ? startOfDay(lastMeetupDate) < addDays(windowStart, -14)
      : false;

    const mid = addDays(windowStart, 7);
    const suggestedDates = [
      addDays(windowStart, 3),
      addDays(mid, 0),
      addDays(windowEnd, -2),
    ];

    return {
      suggestedDates,
      windowStart,
      windowEnd,
      label: `Next window · ${formatWindowLabel(windowStart, windowEnd)}`,
      missed,
      missedLabel: missed
        ? `You missed ${MONTH_LONG[addDays(windowStart, -14).getMonth()]} — here's your next window. 🌿`
        : undefined,
    };
  }

  // monthly
  const windowStart = startOfMonth(today);
  const windowEnd = endOfMonth(today);

  const missed = lastMeetupDate
    ? startOfDay(lastMeetupDate) < startOfMonth(addDays(today, -32))
    : false;

  const mid = Math.floor((windowEnd.getDate() - windowStart.getDate()) / 2);
  const suggestedDates = [
    addDays(windowStart, 6),
    addDays(windowStart, mid),
    addDays(windowEnd, -6),
  ];

  return {
    suggestedDates,
    windowStart,
    windowEnd,
    label: `${MONTH_LONG[today.getMonth()]} ${today.getFullYear()}`,
    missed,
    missedLabel: missed
      ? `You missed ${MONTH_LONG[addDays(today, -32).getMonth()]} — here's your next window. 🌿`
      : undefined,
  };
}
