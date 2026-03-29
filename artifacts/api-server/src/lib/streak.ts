import type { Meetup } from "@workspace/db";

export interface StreakResult {
  streak: number;
  lastMeetupDate: string | null;
  status: "on_track" | "overdue" | "needs_scheduling";
  nextMeetupDate: string | null;
}

export function computeStreak(meetups: Meetup[], frequency: string): StreakResult {
  const completed = meetups
    .filter((m) => m.status === "completed" || m.status === "skipped")
    .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());

  let streak = 0;
  let consecutiveSkips = 0;

  for (const meetup of completed) {
    if (meetup.status === "completed") {
      if (consecutiveSkips <= 1) {
        streak++;
        consecutiveSkips = 0;
      } else {
        break;
      }
    } else if (meetup.status === "skipped") {
      consecutiveSkips++;
      if (consecutiveSkips > 1) {
        break;
      }
    }
  }

  const lastCompleted = completed.find((m) => m.status === "completed");
  const lastMeetupDate = lastCompleted ? lastCompleted.scheduledDate.toISOString() : null;

  const now = new Date();
  const frequencyDays = frequency === "weekly" ? 7 : frequency === "biweekly" ? 14 : 30;

  let nextMeetupDate: string | null = null;
  let status: "on_track" | "overdue" | "needs_scheduling" = "needs_scheduling";

  if (lastMeetupDate) {
    const lastDate = new Date(lastMeetupDate);
    const nextDate = new Date(lastDate.getTime() + frequencyDays * 24 * 60 * 60 * 1000);
    nextMeetupDate = nextDate.toISOString();

    const daysOverdue = (now.getTime() - nextDate.getTime()) / (24 * 60 * 60 * 1000);
    if (daysOverdue > frequencyDays) {
      status = "overdue";
    } else {
      status = "on_track";
    }
  } else {
    status = "needs_scheduling";
  }

  return { streak, lastMeetupDate, status, nextMeetupDate };
}
