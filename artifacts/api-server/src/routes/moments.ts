import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db, ritualsTable, inviteTokensTable, usersTable,
  sharedMomentsTable, momentUserTokensTable, momentPostsTable, momentWindowsTable,
  momentCalendarEventsTable,
} from "@workspace/db";
import { createCalendarEvent, deleteCalendarEvent, createAllDayCalendarEvent } from "../lib/calendar";
import crypto from "crypto";

const router: IRouter = Router();

function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

// ─── Timezone-aware time helpers ─────────────────────────────────────────────

function getCurrentTimeInTz(timezone: string): { hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(new Date());
    const hour = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);
    return { hour: isNaN(hour) ? 0 : hour, minute: isNaN(minute) ? 0 : minute };
  } catch {
    const now = new Date();
    return { hour: now.getUTCHours(), minute: now.getUTCMinutes() };
  }
}

function todayDateInTz(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// ─── Current window date (YYYY-MM-DD) — falls back to UTC ───────────────────
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Is the posting window currently open? (timezone-aware) ─────────────────
function isWindowOpen(moment: { scheduledTime: string; windowMinutes: number; timezone?: string | null }): boolean {
  const tz = moment.timezone || "UTC";
  const { hour, minute } = getCurrentTimeInTz(tz);
  const currentMins = hour * 60 + minute;
  const [h, m] = moment.scheduledTime.split(":").map(Number);
  const startMins = h * 60 + m;
  const endMins = startMins + moment.windowMinutes;
  return currentMins >= startMins && currentMins < endMins;
}

// ─── Day-of-week check (timezone-aware) ──────────────────────────────────────
const RRULE_DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const DOW_LC: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

function getCurrentDayOfWeekInTz(tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).formatToParts(new Date());
    const name = (parts.find(p => p.type === "weekday")?.value ?? "").toLowerCase();
    return DOW_LC[name] ?? new Date().getDay();
  } catch { return new Date().getDay(); }
}

function isPracticeDayInTz(moment: { frequency: string; dayOfWeek?: string | null; practiceDays?: string | null; timezone?: string | null }): boolean {
  if (moment.frequency !== "weekly") return true;
  const todayDow = getCurrentDayOfWeekInTz(moment.timezone || "UTC");
  // Check practiceDays JSON array (RRULE codes like ["MO","WE"])
  if (moment.practiceDays) {
    try {
      const days: string[] = JSON.parse(moment.practiceDays);
      if (days.length > 0) {
        return days.some(d => {
          const up = d.toUpperCase(); if (RRULE_DOW[up] !== undefined) return RRULE_DOW[up] === todayDow;
          return DOW_LC[d.toLowerCase()] === todayDow;
        });
      }
    } catch { /* ignore */ }
  }
  // Fallback: single dayOfWeek
  if (moment.dayOfWeek) {
    const up = moment.dayOfWeek.toUpperCase();
    if (RRULE_DOW[up] !== undefined) return RRULE_DOW[up] === todayDow;
    return DOW_LC[moment.dayOfWeek.toLowerCase()] === todayDow;
  }
  return true;
}

// ─── Combined open check: must be both a practice day AND within window ───────
function computeWindowOpen(moment: { scheduledTime: string; windowMinutes: number; timezone?: string | null; frequency: string; dayOfWeek?: string | null; practiceDays?: string | null }): boolean {
  if (!isPracticeDayInTz(moment)) return false;
  return isWindowOpen(moment);
}

// ─── Minutes remaining in window (timezone-aware) ────────────────────────────
function minutesRemaining(moment: { scheduledTime: string; windowMinutes: number; timezone?: string | null }): number {
  const tz = moment.timezone || "UTC";
  const { hour, minute } = getCurrentTimeInTz(tz);
  const currentMins = hour * 60 + minute;
  const [h, m] = moment.scheduledTime.split(":").map(Number);
  const endMins = h * 60 + m + moment.windowMinutes;
  return Math.max(0, endMins - currentMins);
}

// ─── Build local datetime strings for calendar events ────────────────────────
function buildLocalEventTimes(hh: number, mm: number, timezone: string): { startLocalStr: string; endLocalStr: string } {
  const { hour: curH, minute: curM } = getCurrentTimeInTz(timezone);
  const hasPassed = (curH * 60 + curM) >= (hh * 60 + mm);

  const localToday = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  let startDay = localToday;

  if (hasPassed) {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    startDay = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(tomorrow);
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const endTotalMins = hh * 60 + mm + 60;
  const endH = Math.floor(endTotalMins / 60) % 24;
  const endM = endTotalMins % 60;

  return {
    startLocalStr: `${startDay}T${pad(hh)}:${pad(mm)}:00`,
    endLocalStr: `${startDay}T${pad(endH)}:${pad(endM)}:00`,
  };
}

// ─── Evaluate window and update streak ──────────────────────────────────────
async function evaluateWindow(momentId: number, windowDate: string) {
  const posts = await db.select().from(momentPostsTable)
    .where(and(eq(momentPostsTable.momentId, momentId), eq(momentPostsTable.windowDate, windowDate)));

  const postCount = posts.length;
  const status = postCount >= 2 ? "bloom" : postCount === 1 ? "solo" : "wither";

  // Upsert window record
  const existing = await db.select().from(momentWindowsTable)
    .where(and(eq(momentWindowsTable.momentId, momentId), eq(momentWindowsTable.windowDate, windowDate)));

  if (existing.length === 0) {
    await db.insert(momentWindowsTable).values({
      momentId, windowDate, status, postCount, closedAt: new Date(),
    });
  } else {
    await db.update(momentWindowsTable)
      .set({ status, postCount, closedAt: new Date() })
      .where(eq(momentWindowsTable.id, existing[0].id));
  }

  // Update streak on the moment
  if (status === "bloom") {
    const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
    if (moment) {
      const newStreak = moment.currentStreak + 1;
      const newLongest = Math.max(newStreak, moment.longestStreak);
      const newState = (moment.state === "needs_water" || moment.state === "dormant") ? "active" : moment.state;
      await db.update(sharedMomentsTable)
        .set({ currentStreak: newStreak, longestStreak: newLongest, totalBlooms: moment.totalBlooms + 1, state: newState })
        .where(eq(sharedMomentsTable.id, momentId));
    }
  } else if (status === "wither") {
    const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
    if (moment) {
      // Check for consecutive withers
      const recentWindows = await db.select().from(momentWindowsTable)
        .where(eq(momentWindowsTable.momentId, momentId));
      const sortedWindows = recentWindows
        .sort((a, b) => b.windowDate.localeCompare(a.windowDate))
        .slice(0, 3);

      const consecutiveWithers = sortedWindows.filter(w => w.status === "wither").length;

      if (consecutiveWithers >= 2) {
        await db.update(sharedMomentsTable)
          .set({ currentStreak: 0, state: "dormant" })
          .where(eq(sharedMomentsTable.id, momentId));
      } else if (consecutiveWithers === 1) {
        await db.update(sharedMomentsTable)
          .set({ state: "needs_water" })
          .where(eq(sharedMomentsTable.id, momentId));
      }
    }
  }
}

// ─── POST /api/rituals/:id/moments — plant a shared moment ──────────────────
const PlantSchema = z.object({
  name: z.string().min(1).max(100),
  intention: z.string().min(1).max(140),
  loggingType: z.enum(["photo", "reflection", "both", "checkin"]),
  reflectionPrompt: z.string().max(100).optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  goalDays: z.number().int().min(1).max(365).default(30),
});

router.post("/rituals/:id/moments", async (req, res): Promise<void> => {
  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = PlantSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }
  if (ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { name, intention, loggingType, reflectionPrompt, frequency, scheduledTime, goalDays } = parsed.data;

  const momentToken = generateToken();

  const [moment] = await db.insert(sharedMomentsTable).values({
    ritualId,
    name,
    intention,
    loggingType,
    reflectionPrompt: reflectionPrompt ?? null,
    frequency,
    scheduledTime,
    goalDays,
    momentToken,
    windowMinutes: 60,
  }).returning();

  // Get the organizer's info
  const [organizer] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));

  // Get all circle members (invite_tokens) + organizer
  const inviteTokens = await db.select().from(inviteTokensTable).where(eq(inviteTokensTable.ritualId, ritualId));

  // Build member list: organizer + all invitees
  const members: Array<{ email: string; name: string }> = [
    { email: organizer.email, name: organizer.name ?? organizer.email },
    ...inviteTokens.map(t => ({ email: t.email, name: t.name ?? t.email })),
  ];

  // Deduplicate by email
  const seen = new Set<string>();
  const uniqueMembers = members.filter(m => {
    if (seen.has(m.email)) return false;
    seen.add(m.email);
    return true;
  });

  // Create moment_user_tokens for each member
  const baseUrl = process.env["REPLIT_DEV_DOMAIN"]
    ? `https://${process.env["REPLIT_DEV_DOMAIN"]}/moment`
    : `http://localhost:${process.env["PORT"] ?? 3001}/moment`;

  const memberTokenRows = uniqueMembers.map(m => ({
    momentId: moment.id,
    email: m.email,
    name: m.name,
    userToken: generateToken(),
  }));

  const insertedTokens = await db.insert(momentUserTokensTable).values(memberTokenRows).returning();

  // Build calendar description — short, link-first
  const linkLines = insertedTokens.map(t => `  ${t.name ?? t.email}: ${baseUrl}/${momentToken}/${t.userToken}`);

  const calDescription = [
    name,
    ...(intention ? [`"${intention}"`] : []),
    "",
    "Tap your personal link to log:",
    ...linkLines,
  ].join("\n");

  // Create recurring calendar event on the organizer's calendar
  const recurrenceRule = frequency === "daily"
    ? ["RRULE:FREQ=DAILY"]
    : frequency === "weekly"
    ? ["RRULE:FREQ=WEEKLY"]
    : ["RRULE:FREQ=MONTHLY"];

  const [hh, mm] = scheduledTime.split(":").map(Number);
  const startDate = new Date();
  startDate.setHours(hh, mm, 0, 0);
  // If that time has already passed today, start from tomorrow
  if (startDate < new Date()) {
    startDate.setDate(startDate.getDate() + 1);
  }
  const endDate = new Date(startDate.getTime() + 60 * 60_000);

  const attendeeEmails = uniqueMembers.map(m => m.email);

  const gcalEventId = await createCalendarEvent(sessionUserId, {
    summary: `🌿 ${name}`,
    description: calDescription,
    startDate,
    endDate,
    attendees: attendeeEmails,
    recurrence: recurrenceRule,
  }).catch(() => null);

  // Store the gcal event ID on the organizer's token row
  if (gcalEventId) {
    const organizerTokenRow = insertedTokens.find(t => t.email === organizer.email);
    if (organizerTokenRow) {
      await db.update(momentUserTokensTable)
        .set({ googleCalendarEventId: gcalEventId })
        .where(eq(momentUserTokensTable.id, organizerTokenRow.id));
    }
  }

  res.status(201).json({
    moment: { ...moment },
    memberCount: uniqueMembers.length,
    gcalCreated: !!gcalEventId,
  });
});

// ─── POST /api/moments — plant a standalone shared moment ───────────────────
const SPIRITUAL_TEMPLATE_IDS = new Set(["morning-prayer", "evening-prayer", "intercession", "contemplative", "fasting", "custom"]);
const BCP_TEMPLATE_IDS = new Set(["morning-prayer", "evening-prayer"]);

const StandalonePlantSchema = z.object({
  name: z.string().min(1).max(100),
  intention: z.string().min(1).max(500),
  loggingType: z.enum(["photo", "reflection", "both", "checkin"]),
  reflectionPrompt: z.string().max(300).optional(),
  templateType: z.string().optional(),
  intercessionTopic: z.string().max(300).optional(),
  intercessionSource: z.enum(["bcp", "custom"]).optional(),
  intercessionFullText: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  dayOfWeek: z.enum(["MO","TU","WE","TH","FR","SA","SU"]).optional(),
  goalDays: z.number().int().min(0).max(365).default(7),
  timezone: z.string().default("UTC"),
  timeOfDay: z.enum(["early-morning", "morning", "midday", "afternoon", "late-afternoon", "evening", "night"]).optional(),
  participants: z.array(z.object({ name: z.string(), email: z.string().min(3) })).max(20).default([]),
  // BCP-specific fields
  frequencyType: z.string().optional(),
  frequencyDaysPerWeek: z.number().int().min(1).max(7).optional(),
  practiceDays: z.string().optional(),
  // Optional link to a tradition/circle
  ritualId: z.number().int().positive().optional(),
  // Contemplative Prayer duration
  contemplativeDurationMinutes: z.number().int().min(1).max(60).optional(),
  // Fasting-specific fields
  fastingFrom: z.string().max(140).optional(),
  fastingIntention: z.string().max(200).optional(),
  fastingFrequency: z.enum(["specific", "weekly", "monthly"]).optional(),
  fastingDate: z.string().optional(),
  fastingDay: z.string().optional(),
  fastingDayOfMonth: z.number().int().min(1).max(31).optional(),
});

router.post("/moments", async (req, res): Promise<void> => {
  try {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = StandalonePlantSchema.safeParse(req.body);
  if (!parsed.success) {
    console.error("POST /api/moments validation error:", parsed.error.flatten());
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() }); return;
  }

  const { name, intention, loggingType, reflectionPrompt, templateType, intercessionTopic, intercessionSource, intercessionFullText, frequency, scheduledTime, dayOfWeek, goalDays, timezone, timeOfDay, participants, frequencyType, frequencyDaysPerWeek, practiceDays, ritualId: providedRitualId, contemplativeDurationMinutes, fastingFrom, fastingIntention, fastingFrequency, fastingDate, fastingDay, fastingDayOfMonth } = parsed.data;
  const isFasting = templateType === "fasting";

  const isSpiritual = SPIRITUAL_TEMPLATE_IDS.has(templateType ?? "");
  const isBcp = BCP_TEMPLATE_IDS.has(templateType ?? "");
  const momentToken = generateToken();

  const [moment] = await db.insert(sharedMomentsTable).values({
    ritualId: providedRitualId ?? null,
    name,
    intention,
    loggingType,
    reflectionPrompt: reflectionPrompt ?? null,
    templateType: templateType ?? null,
    intercessionTopic: intercessionTopic ?? null,
    intercessionSource: intercessionSource ?? null,
    intercessionFullText: intercessionFullText ?? null,
    frequency,
    scheduledTime,
    dayOfWeek: dayOfWeek ?? null,
    goalDays,
    timezone,
    timeOfDay: isSpiritual ? (timeOfDay ?? null) : null,
    momentToken,
    windowMinutes: isBcp ? 1440 : (isSpiritual ? 1440 : 60),
    ...(frequencyType !== undefined ? { frequencyType } : {}),
    ...(frequencyDaysPerWeek !== undefined ? { frequencyDaysPerWeek } : {}),
    ...(practiceDays !== undefined ? { practiceDays } : {}),
    ...(contemplativeDurationMinutes !== undefined ? { contemplativeDurationMinutes } : {}),
    ...(fastingFrom !== undefined ? { fastingFrom } : {}),
    ...(fastingIntention !== undefined ? { fastingIntention } : {}),
    ...(fastingFrequency !== undefined ? { fastingFrequency } : {}),
    ...(fastingDate !== undefined ? { fastingDate } : {}),
    ...(fastingDay !== undefined ? { fastingDay } : {}),
    ...(fastingDayOfMonth !== undefined ? { fastingDayOfMonth } : {}),
  }).returning();

  const [organizer] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));

  // Merge organizer into participants, deduplicate by email
  const allMembers: Array<{ email: string; name: string }> = [
    { email: organizer.email, name: organizer.name ?? organizer.email },
    ...participants.map(p => ({ email: p.email, name: p.name || p.email })),
  ];
  const seen = new Set<string>();
  const uniqueMembers = allMembers.filter(m => {
    if (seen.has(m.email)) return false;
    seen.add(m.email);
    return true;
  });

  const baseUrl = process.env["REPLIT_DEV_DOMAIN"]
    ? `https://${process.env["REPLIT_DEV_DOMAIN"]}/moment`
    : `http://localhost:${process.env["PORT"] ?? 3001}/moment`;

  const memberTokenRows = uniqueMembers.map(m => ({
    momentId: moment.id,
    email: m.email,
    name: m.name,
    userToken: generateToken(),
  }));

  const insertedTokens = await db.insert(momentUserTokensTable).values(memberTokenRows).returning();

  // ─── Friendly schedule label (time-of-day language, never clock times) ──────
  const TOD_LABELS: Record<string, string> = {
    "early-morning": "early morning", "morning": "morning", "midday": "midday",
    "afternoon": "afternoon", "late-afternoon": "late afternoon", "evening": "evening", "night": "night",
  };
  const DAY_NAMES_SHORT: Record<string, string> = {
    MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday", FR: "Friday", SA: "Saturday", SU: "Sunday",
  };
  function clockToTod(time: string): string {
    const [h] = time.split(":").map(Number);
    if (h < 6) return "early morning";
    if (h < 12) return "morning";
    if (h < 14) return "midday";
    if (h < 17) return "afternoon";
    if (h < 20) return "evening";
    return "night";
  }
  function buildFrequencyLabel(): string {
    const tod = timeOfDay ? (TOD_LABELS[timeOfDay] ?? timeOfDay) : clockToTod(scheduledTime);
    if (frequency === "daily") return `Every ${tod}`;
    if (frequency === "weekly") {
      let days: string[] = [];
      if (practiceDays) {
        try { days = JSON.parse(practiceDays); } catch { days = []; }
      } else if (dayOfWeek) {
        days = [dayOfWeek];
      }
      const dayStr = days.map((d: string) => DAY_NAMES_SHORT[d.toUpperCase()] ?? d).join(", ");
      return dayStr ? `${dayStr} · ${tod}` : `Every week · ${tod}`;
    }
    return `Monthly · ${tod}`;
  }
  const scheduleLabel = buildFrequencyLabel();

  const recurrenceRule = frequency === "daily"
    ? ["RRULE:FREQ=DAILY"]
    : frequency === "weekly"
    ? [`RRULE:FREQ=WEEKLY${dayOfWeek ? `;BYDAY=${dayOfWeek}` : ""}`]
    : ["RRULE:FREQ=MONTHLY"];

  const tz = timezone || "UTC";
  const [hh, mm] = scheduledTime.split(":").map(Number);
  const { startLocalStr, endLocalStr } = buildLocalEventTimes(hh, mm, tz);
  const startDate = new Date(); // fallback

  // ─── Build a personalised calendar description for each member ────────────
  function buildDescription(memberToken: string, _memberName: string): string {
    const personalLink = `${baseUrl}/${momentToken}/${memberToken}`;

    if (templateType === "morning-prayer") {
      return [
        "Morning Prayer Rite II · Page 75",
        scheduleLabel,
        "",
        "Tap when you have prayed:",
        personalLink,
        "",
        "Eleanor — a shared practice companion",
      ].join("\n");
    }

    if (templateType === "evening-prayer") {
      return [
        "Evening Prayer Rite II · Page 115",
        scheduleLabel,
        "",
        "Tap when you have prayed:",
        personalLink,
        "",
        "Eleanor — a shared practice companion",
      ].join("\n");
    }

    if (templateType === "intercession") {
      const topic = intercessionTopic ?? intention;
      return [
        name,
        `Praying for: ${topic}`,
        scheduleLabel,
        "",
        "Tap to pray:",
        personalLink,
        "",
        "Eleanor — a shared practice companion",
      ].join("\n");
    }

    // All other practices
    return [
      name,
      scheduleLabel,
      "",
      "Tap to log:",
      personalLink,
      "",
      "Eleanor — a shared practice companion",
    ].join("\n");
  }

  // ─── Helpers for fasting all-day event date ─────────────────────────────────
  function getFastingStartDateStr(): string {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    if (fastingFrequency === "specific" && fastingDate) return fastingDate;
    if (fastingFrequency === "weekly" && fastingDay) {
      const DAY_MAP: Record<string, number> = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };
      const target = DAY_MAP[fastingDay.toLowerCase()] ?? 5;
      const d = new Date(today);
      const diff = (target - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
      return d.toISOString().split("T")[0];
    }
    if (fastingFrequency === "monthly" && fastingDayOfMonth) {
      const d = new Date(today.getFullYear(), today.getMonth(), fastingDayOfMonth);
      if (d <= today) d.setMonth(d.getMonth() + 1);
      return d.toISOString().split("T")[0];
    }
    return todayStr;
  }

  function getFastingRecurrence(): string[] {
    if (fastingFrequency === "specific") return [];
    if (fastingFrequency === "weekly" && fastingDay) {
      const DAY_RRULE: Record<string, string> = { sunday:"SU", monday:"MO", tuesday:"TU", wednesday:"WE", thursday:"TH", friday:"FR", saturday:"SA" };
      const byday = DAY_RRULE[fastingDay.toLowerCase()] ?? "FR";
      return [`RRULE:FREQ=WEEKLY;BYDAY=${byday}`];
    }
    if (fastingFrequency === "monthly" && fastingDayOfMonth) {
      return [`RRULE:FREQ=MONTHLY;BYMONTHDAY=${fastingDayOfMonth}`];
    }
    return [];
  }

  function buildFastingDescription(memberToken: string): string {
    const baseUrl2 = process.env["REPLIT_DEV_DOMAIN"]
      ? `https://${process.env["REPLIT_DEV_DOMAIN"]}/moment`
      : `http://localhost:${process.env["PORT"] ?? 3001}/moment`;
    const personalLink = `${baseUrl2}/${momentToken}/${memberToken}`;
    return [
      `🌿 Fasting — ${fastingFrom ?? name}`,
      "",
      fastingIntention ? `Why we fast: ${fastingIntention}` : "",
      "",
      "Your personal link:",
      personalLink,
      "",
      "Eleanor — a shared practice companion",
    ].filter(l => l !== undefined).join("\n");
  }

  // ─── Create one personalised calendar event per member ─────────────────────
  // (Like Calendly: each invitee gets their own event with only their link)
  let gcalEventId: string | null = null;
  if (isFasting) {
    const fastingDateStr = getFastingStartDateStr();
    const fastingRec = getFastingRecurrence();
    const orgToken = insertedTokens.find(t => t.email === organizer.email)?.userToken ?? "";
    gcalEventId = await createAllDayCalendarEvent(sessionUserId, {
      summary: `🌿 Fasting — ${fastingFrom ?? name}`,
      description: buildFastingDescription(orgToken),
      dateStr: fastingDateStr,
      attendees: uniqueMembers.map(m => m.email),
      recurrence: fastingRec,
    }).catch(() => null);

    const guestTokensFasting = insertedTokens.filter(t => t.email !== organizer.email);
    await Promise.allSettled(
      guestTokensFasting.map(t =>
        createAllDayCalendarEvent(sessionUserId, {
          summary: `🌿 Fasting — ${fastingFrom ?? name}`,
          description: buildFastingDescription(t.userToken),
          dateStr: fastingDateStr,
          attendees: [t.email],
          recurrence: fastingRec,
        })
      )
    );
  } else {
    gcalEventId = await createCalendarEvent(sessionUserId, {
      summary: `🌿 ${name}`,
      description: buildDescription(
        insertedTokens.find(t => t.email === organizer.email)?.userToken ?? "",
        organizer.name ?? organizer.email
      ),
      startDate,
      startLocalStr,
      endLocalStr,
      timeZone: tz,
      attendees: uniqueMembers.map(m => m.email),
      recurrence: recurrenceRule,
    }).catch(() => null);

    // Create individual personalised events for non-organizer members
    const guestTokens = insertedTokens.filter(t => t.email !== organizer.email);
    await Promise.allSettled(
      guestTokens.map(t =>
        createCalendarEvent(sessionUserId, {
          summary: `🌿 ${name}`,
          description: buildDescription(t.userToken, t.name ?? t.email),
          startDate,
          startLocalStr,
          endLocalStr,
          timeZone: tz,
          attendees: [t.email],
          recurrence: recurrenceRule,
        })
      )
    );
  }

  if (gcalEventId) {
    const organizerTokenRow = insertedTokens.find(t => t.email === organizer.email);
    if (organizerTokenRow) {
      await db.update(momentUserTokensTable)
        .set({ googleCalendarEventId: gcalEventId })
        .where(eq(momentUserTokensTable.id, organizerTokenRow.id));
    }
  }

  res.status(201).json({
    moment: { ...moment },
    memberCount: uniqueMembers.length,
    gcalCreated: !!gcalEventId,
  });
  } catch (err) {
    console.error("POST /api/moments error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/moments — list all standalone moments the user participates in ─
router.get("/moments", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Find all moment_user_tokens for this user's email
  const userTokenRows = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.email, user.email));

  const momentIds = [...new Set(userTokenRows.map(t => t.momentId))];
  if (momentIds.length === 0) { res.json({ moments: [] }); return; }

  const flatMoments = (await db.select().from(sharedMomentsTable)
    .where(inArray(sharedMomentsTable.id, momentIds)))
    .filter(m => m.ritualId === null && m.state !== "archived");

  const enriched = await Promise.all(flatMoments.map(async (m) => {
    const allMembers = await db.select().from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.momentId, m.id));

    const todayPosts = await db.select().from(momentPostsTable)
      .where(and(eq(momentPostsTable.momentId, m.id), eq(momentPostsTable.windowDate, todayDateInTz(m.timezone || "UTC"))));

    const windows = await db.select().from(momentWindowsTable)
      .where(eq(momentWindowsTable.momentId, m.id));
    const latestWindow = windows.sort((a, b) => b.windowDate.localeCompare(a.windowDate))[0] ?? null;

    const myToken = userTokenRows.find(t => t.momentId === m.id);

    return {
      ...m,
      memberCount: allMembers.length,
      members: allMembers.map(t => ({ name: t.name, email: t.email })),
      todayPostCount: todayPosts.length,
      windowOpen: computeWindowOpen(m),
      minutesLeft: minutesRemaining(m),
      latestWindow,
      myUserToken: myToken?.userToken ?? null,
    };
  }));

  res.json({ moments: enriched });
});

// ─── GET /api/moments/:id — full detail for one moment ──────────────────────
router.get("/moments/:id", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  // Auth: must be a participant
  const myTokenRow = await db.select().from(momentUserTokensTable)
    .where(and(eq(momentUserTokensTable.momentId, momentId), eq(momentUserTokensTable.email, user.email)));
  if (myTokenRow.length === 0) { res.status(403).json({ error: "Forbidden" }); return; }

  const allMembers = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, momentId));

  // All windows sorted newest first
  const windows = await db.select().from(momentWindowsTable)
    .where(eq(momentWindowsTable.momentId, momentId));
  const sortedWindows = windows.sort((a, b) => b.windowDate.localeCompare(a.windowDate));

  // All posts ever
  const allPosts = await db.select().from(momentPostsTable)
    .where(eq(momentPostsTable.momentId, momentId));

  // Group posts by windowDate, separate out seed posts
  const postsByDate: Record<string, typeof allPosts> = {};
  const seedPosts: typeof allPosts = [];
  for (const post of allPosts) {
    if (post.windowDate === "seed") {
      seedPosts.push(post);
    } else {
      if (!postsByDate[post.windowDate]) postsByDate[post.windowDate] = [];
      postsByDate[post.windowDate].push(post);
    }
  }

  const windowsWithPosts = sortedWindows.map(w => ({
    ...w,
    posts: (postsByDate[w.windowDate] ?? []).map(p => ({
      guestName: p.guestName,
      photoUrl: p.photoUrl,
      reflectionText: p.reflectionText,
      isCheckin: p.isCheckin === 1,
      loggedAt: p.createdAt?.toISOString() ?? null,
    })),
  }));

  // Today's open window (may not have a record yet if no posts)
  const tz = moment.timezone || "UTC";
  const windowDate = todayDateInTz(tz);
  const todayPosts = postsByDate[windowDate] ?? [];
  const windowOpen = computeWindowOpen(moment);
  const minsLeft = minutesRemaining(moment);

  // Per-member today log status — match by guestName
  const todayLogs = allMembers.map(member => {
    const memberName = (member.name ?? member.email).toLowerCase();
    const post = todayPosts.find(p => (p.guestName ?? "").toLowerCase() === memberName);
    return {
      name: member.name ?? member.email,
      email: member.email,
      loggedAt: post?.createdAt?.toISOString() ?? null,
      reflectionText: post?.reflectionText ?? null,
      isCheckin: post ? post.isCheckin === 1 : false,
    };
  });

  // Determine creator — member with the smallest token id
  const creatorToken = allMembers.length > 0
    ? allMembers.reduce((min, m) => m.id < min.id ? m : min, allMembers[0])
    : null;
  const isCreator = myTokenRow[0]?.email.toLowerCase() === creatorToken?.email.toLowerCase();

  res.json({
    moment,
    members: allMembers.map(t => ({ name: t.name, email: t.email })),
    memberCount: allMembers.length,
    myUserToken: myTokenRow[0]?.userToken ?? null,
    windows: windowsWithPosts,
    seedPosts: seedPosts.map(p => ({
      guestName: p.guestName,
      photoUrl: p.photoUrl,
      reflectionText: p.reflectionText,
      isCheckin: p.isCheckin === 1,
    })),
    todayPostCount: todayPosts.length,
    windowOpen,
    minutesLeft: minsLeft,
    todayLogs,
    isCreator,
  });
});

// ─── POST /api/moments/:id/invite — add new participants ─────────────────────
const InviteMembersSchema = z.object({
  people: z.array(z.object({
    name: z.string().min(1),
    email: z.string().email(),
  })).min(1),
});

router.post("/moments/:id/invite", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = InviteMembersSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [myTokenRow] = await db.select().from(momentUserTokensTable)
    .where(and(eq(momentUserTokensTable.momentId, momentId), eq(momentUserTokensTable.email, user.email)));
  if (!myTokenRow) { res.status(403).json({ error: "Forbidden" }); return; }

  const existingMembers = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, momentId));
  const existingEmails = new Set(existingMembers.map(m => m.email.toLowerCase()));

  const newPeople = parsed.data.people.filter(p => !existingEmails.has(p.email.toLowerCase()));
  if (newPeople.length === 0) {
    res.json({ added: 0, message: "All people are already members" });
    return;
  }

  const newTokenRows = newPeople.map(p => ({
    momentId,
    email: p.email,
    name: p.name,
    userToken: generateToken(),
  }));

  await db.insert(momentUserTokensTable).values(newTokenRows);
  res.json({ added: newPeople.length, people: newPeople });
});

// ─── POST /api/moments/:id/seed-post — creator plants an example post ────────
const SeedPostSchema = z.object({
  photoUrl: z.string().url().optional(),
  reflectionText: z.string().max(500).optional(),
});

router.post("/moments/:id/seed-post", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = SeedPostSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Must be a participant
  const [myTokenRow] = await db.select().from(momentUserTokensTable)
    .where(and(eq(momentUserTokensTable.momentId, momentId), eq(momentUserTokensTable.email, user.email)));
  if (!myTokenRow) { res.status(403).json({ error: "Forbidden" }); return; }

  const { photoUrl, reflectionText } = parsed.data;

  // Upsert seed post (one per user)
  const existing = await db.select().from(momentPostsTable)
    .where(and(
      eq(momentPostsTable.momentId, momentId),
      eq(momentPostsTable.windowDate, "seed"),
      eq(momentPostsTable.userToken, myTokenRow.userToken),
    ));

  if (existing.length > 0) {
    await db.update(momentPostsTable)
      .set({ photoUrl: photoUrl ?? null, reflectionText: reflectionText ?? null })
      .where(eq(momentPostsTable.id, existing[0].id));
  } else {
    await db.insert(momentPostsTable).values({
      momentId,
      windowDate: "seed",
      userToken: myTokenRow.userToken,
      guestName: myTokenRow.name ?? user.email,
      photoUrl: photoUrl ?? null,
      reflectionText: reflectionText ?? null,
      isCheckin: 0,
    });
  }

  res.status(201).json({ success: true });
});

// ─── GET /api/rituals/:id/moments — list moments for a circle ───────────────
router.get("/rituals/:id/moments", async (req, res): Promise<void> => {
  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual || ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const moments = await db.select().from(sharedMomentsTable)
    .where(eq(sharedMomentsTable.ritualId, ritualId));

  // For each moment, get the latest window
  const enriched = await Promise.all(moments.map(async (m) => {
    const windows = await db.select().from(momentWindowsTable)
      .where(eq(momentWindowsTable.momentId, m.id));
    const sortedWindows = windows.sort((a, b) => b.windowDate.localeCompare(a.windowDate));
    const latestWindow = sortedWindows[0] ?? null;

    const todayPosts = await db.select().from(momentPostsTable)
      .where(and(eq(momentPostsTable.momentId, m.id), eq(momentPostsTable.windowDate, todayDateInTz(m.timezone || "UTC"))));

    return {
      ...m,
      latestWindow,
      todayPostCount: todayPosts.length,
      windowOpen: computeWindowOpen(m),
    };
  }));

  res.json({ moments: enriched });
});

// ─── GET /api/moment/:momentToken/:userToken — public posting page ───────────
router.get("/moment/:momentToken/:userToken", async (req, res): Promise<void> => {
  const { momentToken, userToken } = req.params;

  const [moment] = await db.select().from(sharedMomentsTable)
    .where(eq(sharedMomentsTable.momentToken, momentToken));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  const [userTokenRow] = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.userToken, userToken));
  if (!userTokenRow || userTokenRow.momentId !== moment.id) {
    res.status(404).json({ error: "Invalid token" });
    return;
  }

  const ritual = moment.ritualId
    ? (await db.select().from(ritualsTable).where(eq(ritualsTable.id, moment.ritualId)))[0] ?? null
    : null;
  const windowDate = todayDate();

  const allTodayPosts = await db.select().from(momentPostsTable)
    .where(and(eq(momentPostsTable.momentId, moment.id), eq(momentPostsTable.windowDate, windowDate)));

  const myPost = allTodayPosts.find(p => p.userToken === userToken) ?? null;

  const allMembers = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, moment.id));

  const windowOpen = computeWindowOpen(moment);
  const minsLeft = minutesRemaining(moment);

  // Build member presence: who has prayed today
  const prayedTokens = new Set(allTodayPosts.map(p => p.userToken));
  const memberPresence = allMembers.map(m => ({
    name: m.name ?? m.email.split("@")[0],
    userToken: m.userToken,
    prayed: prayedTokens.has(m.userToken),
  }));

  res.json({
    moment: {
      id: moment.id,
      name: moment.name,
      intention: moment.intention,
      loggingType: moment.loggingType,
      reflectionPrompt: moment.reflectionPrompt,
      templateType: moment.templateType,
      intercessionFullText: moment.intercessionFullText,
      intercessionTopic: moment.intercessionTopic,
      currentStreak: moment.currentStreak,
      longestStreak: moment.longestStreak,
      state: moment.state,
      frequency: moment.frequency,
      dayOfWeek: moment.dayOfWeek,
      timeOfDay: moment.timeOfDay,
    },
    ritualName: ritual?.name ?? "",
    windowDate,
    windowOpen,
    minutesRemaining: minsLeft,
    memberCount: allMembers.length,
    todayPostCount: allTodayPosts.length,
    members: memberPresence,
    myPost: myPost
      ? {
          photoUrl: myPost.photoUrl,
          reflectionText: myPost.reflectionText,
          isCheckin: myPost.isCheckin === 1,
        }
      : null,
    userName: userTokenRow.name ?? userTokenRow.email,
  });
});

// ─── POST /api/moment/:momentToken/:userToken/post — submit a post ───────────
const PostSchema = z.object({
  photoUrl: z.string().optional(),
  reflectionText: z.string().max(280).optional(),
  isCheckin: z.boolean().default(false),
});

router.post("/moment/:momentToken/:userToken/post", async (req, res): Promise<void> => {
  const { momentToken, userToken } = req.params;

  const parsed = PostSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  try {
    const [moment] = await db.select().from(sharedMomentsTable)
      .where(eq(sharedMomentsTable.momentToken, momentToken));
    if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

    const [userTokenRow] = await db.select().from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.userToken, userToken));
    if (!userTokenRow || userTokenRow.momentId !== moment.id) {
      res.status(404).json({ error: "Invalid token" });
      return;
    }

    const windowDate = todayDate();

    // Check for existing post today from this user
    const existingPosts = await db.select().from(momentPostsTable)
      .where(and(eq(momentPostsTable.momentId, moment.id), eq(momentPostsTable.windowDate, windowDate)));
    const myExisting = existingPosts.find(p => p.userToken === userToken);

    const guestName = userTokenRow.name ?? userTokenRow.email;
    const { photoUrl, reflectionText, isCheckin } = parsed.data;

    if (myExisting) {
      await db.update(momentPostsTable)
        .set({
          photoUrl: photoUrl ?? null,
          reflectionText: reflectionText ?? null,
          isCheckin: isCheckin ? 1 : 0,
        })
        .where(eq(momentPostsTable.id, myExisting.id));
    } else {
      await db.insert(momentPostsTable).values({
        momentId: moment.id,
        windowDate,
        userToken,
        guestName,
        photoUrl: photoUrl ?? null,
        reflectionText: reflectionText ?? null,
        isCheckin: isCheckin ? 1 : 0,
      });
    }

    // Recount posts to get fresh total
    const allTodayPosts = await db.select().from(momentPostsTable)
      .where(and(eq(momentPostsTable.momentId, moment.id), eq(momentPostsTable.windowDate, windowDate)));

    res.status(201).json({
      success: true,
      todayPostCount: allTodayPosts.length,
      memberCount: (await db.select().from(momentUserTokensTable).where(eq(momentUserTokensTable.momentId, moment.id))).length,
    });

    // Async: close and evaluate window if it's past the window end time
    const windowIsStillOpen = isWindowOpen(moment);
    if (!windowIsStillOpen) {
      evaluateWindow(moment.id, windowDate).catch(err =>
        console.warn("Window evaluation failed:", err?.message ?? err)
      );
    }

  } catch (err) {
    console.error("POST /moment/:momentToken/:userToken/post error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/rituals/:id/moments/:momentId/journal — window history ─────────
router.get("/rituals/:id/moments/:momentId/journal", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.momentId, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Not found" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, moment.ritualId));
  if (!ritual || ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const windows = await db.select().from(momentWindowsTable)
    .where(eq(momentWindowsTable.momentId, momentId));

  const enriched = await Promise.all(
    windows.sort((a, b) => b.windowDate.localeCompare(a.windowDate)).map(async (w) => {
      const posts = await db.select().from(momentPostsTable)
        .where(and(eq(momentPostsTable.momentId, momentId), eq(momentPostsTable.windowDate, w.windowDate)));
      return { ...w, posts };
    })
  );

  res.json({ windows: enriched, moment });
});

// ─── Rolling calendar event helper ──────────────────────────────────────────

function nextOccurrences(personalTime: string, personalTimezone: string, frequency: string, dayOfWeek: string | null, count: number): Date[] {
  const [hh, mm] = personalTime.split(":").map(Number);
  const results: Date[] = [];
  const now = new Date();
  const dateWeekdayMap: Record<string, string> = { Su: "SU", Mo: "MO", Tu: "TU", We: "WE", Th: "TH", Fr: "FR", Sa: "SA" };

  let candidate = new Date();
  candidate.setUTCHours(0, 0, 0, 0);

  for (let day = 0; results.length < count && day < 730; day++) {
    const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: personalTimezone }).format(candidate);

    let included = false;
    if (frequency === "daily") {
      included = true;
    } else if (frequency === "weekly") {
      const wdCode = dateWeekdayMap[new Intl.DateTimeFormat("en-US", { timeZone: personalTimezone, weekday: "short" }).format(candidate).slice(0, 2)] ?? "";
      included = dayOfWeek ? wdCode === dayOfWeek : true;
    }

    if (included) {
      const tzOffsetMs = getTimezoneOffsetMs(personalTimezone, new Date(`${localDate}T00:00:00`));
      const eventUtc = new Date(`${localDate}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`);
      eventUtc.setTime(eventUtc.getTime() - tzOffsetMs);
      if (eventUtc > now) results.push(eventUtc);
    }

    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }

  return results;
}

function getTimezoneOffsetMs(timezone: string, date: Date): number {
  try {
    const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzDate = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
    return utcDate.getTime() - tzDate.getTime();
  } catch {
    return 0;
  }
}

// ─── POST /api/moments/:id/personal-time — set organizer personal time ────────
const PersonalTimeSchema = z.object({
  personalTime: z.string().regex(/^\d{2}:\d{2}$/),
  personalTimezone: z.string(),
});

router.post("/moments/:id/personal-time", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = PersonalTimeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
    if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

    const { personalTime, personalTimezone } = parsed.data;

    const [myTokenRow] = await db.select().from(momentUserTokensTable)
      .where(and(eq(momentUserTokensTable.momentId, momentId), eq(momentUserTokensTable.email, user.email)));
    if (!myTokenRow) { res.status(403).json({ error: "Not a member" }); return; }

    await db.update(momentUserTokensTable)
      .set({ personalTime, personalTimezone })
      .where(eq(momentUserTokensTable.id, myTokenRow.id));

    // Create 2 rolling calendar events
    const occurrences = nextOccurrences(personalTime, personalTimezone, moment.frequency, moment.dayOfWeek ?? null, 2);
    for (let i = 0; i < occurrences.length; i++) {
      await db.insert(momentCalendarEventsTable).values({
        sharedMomentId: momentId,
        momentMemberId: myTokenRow.id,
        scheduledFor: occurrences[i],
        isFirstEvent: i === 0,
      });
    }

    res.json({ ok: true, calendarEventsCreated: occurrences.length });
  } catch (err) {
    console.error("POST /moments/:id/personal-time error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/moments/:momentToken/info — public practice info ──────────────
router.get("/moments/:momentToken/info", async (req, res): Promise<void> => {
  const { momentToken } = req.params;

  try {
    const [moment] = await db.select().from(sharedMomentsTable)
      .where(eq(sharedMomentsTable.momentToken, momentToken));
    if (!moment) { res.status(404).json({ error: "Not found" }); return; }

    const members = await db.select().from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.momentId, moment.id));

    res.json({
      id: moment.id,
      name: moment.name,
      intention: moment.intention,
      templateType: moment.templateType,
      timeOfDay: moment.timeOfDay,
      frequency: moment.frequency,
      dayOfWeek: moment.dayOfWeek,
      practiceDays: moment.practiceDays,
      goalDays: moment.goalDays,
      loggingType: moment.loggingType,
      intercessionTopic: moment.intercessionTopic,
      memberCount: members.length,
    });
  } catch (err) {
    console.error("GET /moments/:momentToken/info error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/moments/:momentToken/join — join a practice ──────────────────
const JoinSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  personalTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  personalTimezone: z.string().optional(),
});

router.post("/moments/:momentToken/join", async (req, res): Promise<void> => {
  const { momentToken } = req.params;

  const parsed = JoinSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  try {
    const [moment] = await db.select().from(sharedMomentsTable)
      .where(eq(sharedMomentsTable.momentToken, momentToken));
    if (!moment) { res.status(404).json({ error: "Practice not found" }); return; }

    const { name, email, personalTime, personalTimezone } = parsed.data;

    const existing = await db.select().from(momentUserTokensTable)
      .where(and(eq(momentUserTokensTable.momentId, moment.id), eq(momentUserTokensTable.email, email)));

    let tokenRow;
    if (existing.length > 0) {
      tokenRow = existing[0];
      if (personalTime) {
        await db.update(momentUserTokensTable)
          .set({ personalTime, personalTimezone: personalTimezone ?? null, name })
          .where(eq(momentUserTokensTable.id, tokenRow.id));
        tokenRow = { ...tokenRow, personalTime, personalTimezone: personalTimezone ?? null };
      }
    } else {
      const userToken = generateToken();
      const [inserted] = await db.insert(momentUserTokensTable).values({
        momentId: moment.id,
        email,
        name,
        userToken,
        personalTime: personalTime ?? null,
        personalTimezone: personalTimezone ?? null,
      }).returning();
      tokenRow = inserted;
    }

    // Create 2 rolling calendar events if personalTime provided
    if (personalTime && personalTimezone) {
      const existingEvents = await db.select().from(momentCalendarEventsTable)
        .where(and(
          eq(momentCalendarEventsTable.sharedMomentId, moment.id),
          eq(momentCalendarEventsTable.momentMemberId, tokenRow.id),
        ));
      if (existingEvents.length === 0) {
        const occurrences = nextOccurrences(personalTime, personalTimezone, moment.frequency, moment.dayOfWeek ?? null, 2);
        for (let i = 0; i < occurrences.length; i++) {
          await db.insert(momentCalendarEventsTable).values({
            sharedMomentId: moment.id,
            momentMemberId: tokenRow.id,
            scheduledFor: occurrences[i],
            isFirstEvent: i === 0,
          });
        }
      }
    }

    const baseUrl = process.env["REPLIT_DEV_DOMAIN"]
      ? `https://${process.env["REPLIT_DEV_DOMAIN"]}/moment`
      : `http://localhost:${process.env["PORT"] ?? 3001}/moment`;

    res.status(201).json({
      userToken: tokenRow.userToken,
      personalLink: `${baseUrl}/${momentToken}/${tokenRow.userToken}`,
      momentName: moment.name,
    });
  } catch (err) {
    console.error("POST /moments/:momentToken/join error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /api/moments/:id/archive — soft-delete a practice ─────────────────
router.patch("/moments/:id/archive", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  // Must be a member
  const membership = await db.select().from(momentUserTokensTable)
    .where(and(eq(momentUserTokensTable.momentId, momentId), eq(momentUserTokensTable.email, user.email)));
  if (membership.length === 0) { res.status(403).json({ error: "Forbidden" }); return; }

  // Delete all Google Calendar events for this practice before archiving
  const calRows = await db
    .select({ googleCalendarEventId: momentUserTokensTable.googleCalendarEventId })
    .from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, momentId));

  await Promise.allSettled(
    calRows
      .filter((r) => r.googleCalendarEventId)
      .map((r) => deleteCalendarEvent(sessionUserId, r.googleCalendarEventId!))
  );

  await db.update(sharedMomentsTable)
    .set({ state: "archived" })
    .where(eq(sharedMomentsTable.id, momentId));

  res.json({ ok: true });
});

// ─── DELETE /api/moments/:id — permanently delete a practice ─────────────────
router.delete("/moments/:id", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  // Must be a member
  const membership = await db.select().from(momentUserTokensTable)
    .where(and(eq(momentUserTokensTable.momentId, momentId), eq(momentUserTokensTable.email, user.email)));
  if (membership.length === 0) { res.status(403).json({ error: "Forbidden" }); return; }

  // Delete all Google Calendar events for this practice before hard-deleting
  const calRows = await db
    .select({ googleCalendarEventId: momentUserTokensTable.googleCalendarEventId })
    .from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, momentId));

  await Promise.allSettled(
    calRows
      .filter((r) => r.googleCalendarEventId)
      .map((r) => deleteCalendarEvent(sessionUserId, r.googleCalendarEventId!))
  );

  // Hard delete — cascades remove windows, posts, tokens, calendar events, renewals
  await db.delete(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));

  res.json({ ok: true });
});

// ─── GET /api/connections — return all unique people in user's moments + traditions ────
router.get("/connections", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const seen = new Set<string>([user.email]);
    const connections: { name: string; email: string }[] = [];

    // Members from traditions (rituals owned by this user)
    const rituals = await db.select({ participants: ritualsTable.participants })
      .from(ritualsTable)
      .where(eq(ritualsTable.ownerId, sessionUserId));

    for (const r of rituals) {
      const parts = (r.participants as Array<{ name: string; email: string }>) ?? [];
      for (const p of parts) {
        if (p.email && !seen.has(p.email)) {
          seen.add(p.email);
          connections.push({ name: p.name ?? p.email, email: p.email });
        }
      }
    }

    // Members from practices (moments this user is part of)
    const userTokenRows = await db.select({ momentId: momentUserTokensTable.momentId })
      .from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.email, user.email));

    const momentIds = [...new Set(userTokenRows.map(r => r.momentId))];
    if (momentIds.length > 0) {
      const allMembers = await db.select({ name: momentUserTokensTable.name, email: momentUserTokensTable.email })
        .from(momentUserTokensTable)
        .where(inArray(momentUserTokensTable.momentId, momentIds));

      for (const m of allMembers) {
        if (m.email && !seen.has(m.email)) {
          seen.add(m.email);
          connections.push({ name: m.name ?? m.email, email: m.email });
        }
      }
    }

    res.json({ connections });
  } catch (err) {
    console.error("GET /api/connections error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
