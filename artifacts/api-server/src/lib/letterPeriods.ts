/**
 * Period calculation helpers for Phoebe Letters.
 *
 * A "period" is a 7-day window (Monday–Sunday) anchored to the
 * correspondence's startedAt date. Period 1 begins on the first
 * Monday on or after startedAt.
 *
 * ONE-TO-ONE ALTERNATING RULE:
 *   Odd periods  → creator's turn
 *   Even periods → member's turn
 */

const PERIOD_DAYS = 7;

function getFirstMonday(startedAt: Date): Date {
  const d = new Date(startedAt);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun … 6=Sat
  if (day === 1) return d; // already Monday
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  return d;
}

export function getPeriodStart(
  correspondenceStartedAt: Date,
  referenceDate: Date,
): Date {
  const firstMonday = getFirstMonday(correspondenceStartedAt);
  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);

  const diffMs = ref.getTime() - firstMonday.getTime();
  if (diffMs < 0) return firstMonday; // reference is before period 1

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const periodsElapsed = Math.floor(diffDays / PERIOD_DAYS);
  const start = new Date(firstMonday);
  start.setDate(start.getDate() + periodsElapsed * PERIOD_DAYS);
  return start;
}

export function getPeriodEnd(periodStart: Date): Date {
  const end = new Date(periodStart);
  end.setDate(end.getDate() + PERIOD_DAYS - 1);
  return end;
}

export function getPeriodNumber(
  correspondenceStartedAt: Date,
  referenceDate: Date,
): number {
  const firstMonday = getFirstMonday(correspondenceStartedAt);
  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);

  const diffMs = ref.getTime() - firstMonday.getTime();
  if (diffMs < 0) return 1;

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / PERIOD_DAYS) + 1;
}

export function getNextPeriodStart(
  correspondenceStartedAt: Date,
  referenceDate: Date,
): Date {
  const currentStart = getPeriodStart(correspondenceStartedAt, referenceDate);
  const next = new Date(currentStart);
  next.setDate(next.getDate() + PERIOD_DAYS);
  return next;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

export function formatPeriodLabel(
  periodStart: Date,
  periodEnd: Date,
): string {
  const sameMonth = periodStart.getMonth() === periodEnd.getMonth();
  if (sameMonth) {
    return `${MONTH_LONG[periodStart.getMonth()]} ${periodStart.getDate()} \u2013 ${periodEnd.getDate()}`;
  }
  return `${MONTH_SHORT[periodStart.getMonth()]} ${periodStart.getDate()} \u2013 ${MONTH_SHORT[periodEnd.getMonth()]} ${periodEnd.getDate()}`;
}

export function isInLastThreeDays(
  periodStart: Date,
  referenceDate: Date,
): boolean {
  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);

  // Last 2 days of a 7-day period (Saturday–Sunday)
  const lastTwoDays = new Date(periodStart);
  lastTwoDays.setDate(lastTwoDays.getDate() + PERIOD_DAYS - 2);

  const end = getPeriodEnd(periodStart);

  return ref >= lastTwoDays && ref <= end;
}

export function formatNextPeriodStart(
  correspondenceStartedAt: Date,
): string {
  const next = getNextPeriodStart(correspondenceStartedAt, new Date());
  return `${DAY_NAMES[next.getDay()]}, ${MONTH_LONG[next.getMonth()]} ${next.getDate()}`;
}

export function formatHumanDate(date: Date): string {
  return `${DAY_NAMES[date.getDay()]}, ${MONTH_LONG[date.getMonth()]} ${date.getDate()}`;
}

export function formatPeriodStartDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns whose turn it is in a one-to-one correspondence.
 * Odd period → creator; even period → member.
 */
export function getWhoseTurn(
  correspondenceStartedAt: Date,
  referenceDate: Date,
): "creator" | "member" {
  const n = getPeriodNumber(correspondenceStartedAt, referenceDate);
  return n % 2 === 1 ? "creator" : "member";
}

/**
 * Returns full period info for a correspondence.
 */
export function getCurrentPeriodInfo(
  correspondenceStartedAt: Date,
  referenceDate: Date,
  type: "one_to_one" | "group",
) {
  const periodStart = getPeriodStart(correspondenceStartedAt, referenceDate);
  const periodEnd = getPeriodEnd(periodStart);
  const periodNumber = getPeriodNumber(correspondenceStartedAt, referenceDate);

  return {
    periodNumber,
    periodStart,
    periodEnd,
    periodLabel: formatPeriodLabel(periodStart, periodEnd),
    periodStartStr: formatPeriodStartDateString(periodStart),
    whoseTurn: type === "one_to_one" ? getWhoseTurn(correspondenceStartedAt, referenceDate) : ("everyone" as const),
    isLastThreeDays: isInLastThreeDays(periodStart, referenceDate),
  };
}
