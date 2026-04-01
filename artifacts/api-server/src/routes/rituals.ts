import { getFrontendUrl } from "../lib/urls";
import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, ritualsTable, meetupsTable, ritualMessagesTable, schedulingResponsesTable, inviteTokensTable, usersTable, momentUserTokensTable } from "@workspace/db";
import { createCalendarEvent, updateCalendarEvent, getFreeBusy, getCalendarEvent, deleteCalendarEvent, getCalendarEventAttendees, addAttendeesToCalendarEvent } from "../lib/calendar";
import { deriveStartDate } from "../lib/scheduleDate";
import {
  CreateRitualBody,
  ListRitualsResponse,
  GetRitualParams,
  GetRitualResponse,
  UpdateRitualParams,
  UpdateRitualBody,
  UpdateRitualResponse,
  DeleteRitualParams,
  ListMeetupsParams,
  ListMeetupsResponse,
  LogMeetupParams,
  LogMeetupBody,
  ListMessagesParams,
  ListMessagesResponse,
  SendMessageParams,
  SendMessageBody,
  SendMessageResponse,
} from "@workspace/api-zod";
import { computeStreak } from "../lib/streak";
import { getWelcomeMessage, getCoordinatorResponse, suggestMeetingTimes } from "../lib/agent";
import { z } from "zod/v4";

const router: IRouter = Router();

async function enrichRitual(ritual: typeof ritualsTable.$inferSelect, meetups: typeof meetupsTable.$inferSelect[]) {
  const { streak, lastMeetupDate, nextMeetupDate, status } = computeStreak(meetups, ritual.frequency);
  return {
    ...ritual,
    participants: (ritual.participants as Array<{ name: string; email: string }>) ?? [],
    streak,
    lastMeetupDate,
    nextMeetupDate,
    status,
  };
}

router.get("/rituals", async (req, res): Promise<void> => {
  const rawOwnerId = req.query.ownerId;
  const ownerId = rawOwnerId !== undefined ? parseInt(String(rawOwnerId), 10) : null;
  
  const rituals = await db
    .select()
    .from(ritualsTable)
    .where(ownerId !== null && !isNaN(ownerId) ? eq(ritualsTable.ownerId, ownerId) : undefined)
    .orderBy(desc(ritualsTable.createdAt));
    
  const enriched = await Promise.all(
    rituals.map(async (r) => {
      const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, r.id));
      return enrichRitual(r, meetups);
    })
  );
  res.json(ListRitualsResponse.parse(enriched));
});

router.post("/rituals", async (req, res): Promise<void> => {
  const parsed = CreateRitualBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const schedulingToken = randomUUID();
  const location = parsed.data.location?.trim() || null;

  const [ritual] = await db
    .insert(ritualsTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      frequency: parsed.data.frequency,
      dayPreference: parsed.data.dayPreference ?? null,
      participants: parsed.data.participants ?? [],
      intention: parsed.data.intention ?? null,
      location,
      ownerId: parsed.data.ownerId,
      scheduleToken: schedulingToken,
    })
    .returning();

  const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritual.id));
  const enriched = await enrichRitual(ritual, meetups);

  const ctx = {
    ritual: enriched,
    streak: enriched.streak,
    lastMeetupDate: enriched.lastMeetupDate,
    nextMeetupDate: enriched.nextMeetupDate,
  };

  // Fire-and-forget: generate welcome message (non-blocking)
  getWelcomeMessage(ctx)
    .then(async (welcome) => {
      await db.insert(ritualMessagesTable).values({
        ritualId: ritual.id,
        role: "assistant",
        content: welcome,
      });
    })
    .catch((err: unknown) => req.log.warn({ err }, "Failed to generate welcome message"));

  // Fire-and-forget: create a recurring Google Calendar event with all participants as attendees.
  // Always use the authenticated session user's ID for calendar access — never trust client-supplied ownerId.
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (sessionUserId && sessionUserId === ritual.ownerId) {
    const participantEmails = (parsed.data.participants ?? [])
      .map(p => p.email)
      .filter(Boolean);

    // Build RRULE from structured fields
    const structured = {
      dayOfWeek: parsed.data.dayOfWeek,
      monthlyType: parsed.data.monthlyType,
      monthlyDayOfMonth: parsed.data.monthlyDayOfMonth,
      monthlyWeekOrdinal: parsed.data.monthlyWeekOrdinal,
      monthlyWeekDay: parsed.data.monthlyWeekDay,
    };

    let rrule: string;
    if (parsed.data.frequency === "weekly") {
      rrule = parsed.data.dayOfWeek
        ? `RRULE:FREQ=WEEKLY;BYDAY=${parsed.data.dayOfWeek}`
        : "RRULE:FREQ=WEEKLY";
    } else if (parsed.data.frequency === "biweekly") {
      rrule = parsed.data.dayOfWeek
        ? `RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=${parsed.data.dayOfWeek}`
        : "RRULE:FREQ=WEEKLY;INTERVAL=2";
    } else {
      // Monthly
      if (parsed.data.monthlyType === "day_of_month" && parsed.data.monthlyDayOfMonth) {
        rrule = `RRULE:FREQ=MONTHLY;BYMONTHDAY=${parsed.data.monthlyDayOfMonth}`;
      } else if (
        parsed.data.monthlyType === "day_of_week_in_month" &&
        parsed.data.monthlyWeekOrdinal &&
        parsed.data.monthlyWeekDay
      ) {
        rrule = `RRULE:FREQ=MONTHLY;BYDAY=${parsed.data.monthlyWeekOrdinal}${parsed.data.monthlyWeekDay}`;
      } else {
        rrule = "RRULE:FREQ=MONTHLY";
      }
    }
    const recurrenceRule = [rrule];

    // Derive start date from structured fields
    const startDate = deriveStartDate(parsed.data.dayPreference ?? "", parsed.data.frequency, structured);

    createCalendarEvent(sessionUserId, {
      summary: ritual.name,
      description: ritual.intention ?? `Recurring ritual: ${ritual.name}`,
      location: ritual.location ?? undefined,
      startDate,
      attendees: participantEmails,
      recurrence: recurrenceRule,
    }).catch(err => req.log.warn({ err }, "Failed to create ritual calendar event"));

    // Fire-and-forget: populate proposedTimes via AI + calendar free/busy
    const ritualForSuggestion = {
      ...ritual,
      participants: (ritual.participants as Array<{ name: string; email: string }>) ?? [],
    };
    suggestMeetingTimes(sessionUserId, ritualForSuggestion)
      .then(async (times) => {
        if (times.length > 0) {
          await db.update(ritualsTable).set({ proposedTimes: times }).where(eq(ritualsTable.id, ritual.id));
        }
      })
      .catch(err => req.log.warn({ err }, "Failed to suggest meeting times on create"));
  }

  res.status(201).json(ListRitualsResponse.element.parse(enriched));
});

router.get("/rituals/:id", async (req, res): Promise<void> => {
  const params = GetRitualParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, params.data.id));
  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  const [meetups, messages] = await Promise.all([
    db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritual.id)).orderBy(desc(meetupsTable.scheduledDate)),
    db.select().from(ritualMessagesTable).where(eq(ritualMessagesTable.ritualId, ritual.id)).orderBy(ritualMessagesTable.createdAt),
  ]);

  const enriched = await enrichRitual(ritual, meetups);

  res.json(
    GetRitualResponse.parse({
      ...enriched,
      meetups,
      messages,
    })
  );
});

router.put("/rituals/:id", async (req, res): Promise<void> => {
  const params = UpdateRitualParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateRitualBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof ritualsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.frequency !== undefined) updateData.frequency = parsed.data.frequency;
  if (parsed.data.dayPreference !== undefined) updateData.dayPreference = parsed.data.dayPreference;
  if (parsed.data.participants !== undefined) updateData.participants = parsed.data.participants;
  if (parsed.data.intention !== undefined) updateData.intention = parsed.data.intention;

  const [ritual] = await db
    .update(ritualsTable)
    .set(updateData)
    .where(eq(ritualsTable.id, params.data.id))
    .returning();

  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritual.id));
  const enriched = await enrichRitual(ritual, meetups);
  res.json(UpdateRitualResponse.parse(enriched));
});

router.delete("/rituals/:id", async (req, res): Promise<void> => {
  const params = DeleteRitualParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;

  // Delete any Google Calendar events attached to this ritual's meetups
  if (sessionUserId) {
    const meetups = await db
      .select({ googleCalendarEventId: meetupsTable.googleCalendarEventId })
      .from(meetupsTable)
      .where(eq(meetupsTable.ritualId, params.data.id));

    await Promise.allSettled(
      meetups
        .filter((m) => m.googleCalendarEventId)
        .map((m) => deleteCalendarEvent(sessionUserId, m.googleCalendarEventId!))
    );
  }

  await db.delete(ritualsTable).where(eq(ritualsTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/rituals/:id/meetups", async (req, res): Promise<void> => {
  const params = ListMeetupsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const meetups = await db
    .select()
    .from(meetupsTable)
    .where(eq(meetupsTable.ritualId, params.data.id))
    .orderBy(desc(meetupsTable.scheduledDate));

  res.json(ListMeetupsResponse.parse(meetups));
});

router.post("/rituals/:id/meetups", async (req, res): Promise<void> => {
  const params = LogMeetupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = LogMeetupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, params.data.id));
  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  const [meetup] = await db
    .insert(meetupsTable)
    .values({
      ritualId: params.data.id,
      scheduledDate: new Date(parsed.data.scheduledDate),
      status: parsed.data.status,
      notes: parsed.data.notes ?? null,
    })
    .returning();

  if (parsed.data.status === "completed" && ritual.ownerId) {
    const scheduledDate = new Date(parsed.data.scheduledDate);
    const calEventId = await createCalendarEvent(ritual.ownerId, {
      summary: `${ritual.name} ✓`,
      description: parsed.data.notes ?? `Completed meetup for ${ritual.name}`,
      startDate: scheduledDate,
    });
    if (calEventId) {
      await db
        .update(meetupsTable)
        .set({ googleCalendarEventId: calEventId })
        .where(eq(meetupsTable.id, meetup.id));
    }
  }

  res.status(201).json(meetup);
});

router.get("/rituals/:id/messages", async (req, res): Promise<void> => {
  const params = ListMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const messages = await db
    .select()
    .from(ritualMessagesTable)
    .where(eq(ritualMessagesTable.ritualId, params.data.id))
    .orderBy(ritualMessagesTable.createdAt);

  res.json(ListMessagesResponse.parse(messages));
});

router.post("/rituals/:id/chat", async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, params.data.id));
  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  await db.insert(ritualMessagesTable).values({
    ritualId: params.data.id,
    role: "user",
    content: parsed.data.content,
  });

  const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritual.id));
  const { streak, lastMeetupDate, nextMeetupDate } = computeStreak(meetups, ritual.frequency);

  const allMessages = await db
    .select()
    .from(ritualMessagesTable)
    .where(eq(ritualMessagesTable.ritualId, params.data.id))
    .orderBy(ritualMessagesTable.createdAt);

  const chatHistory = allMessages.slice(0, -1).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const enrichedRitual = {
    ...ritual,
    participants: (ritual.participants as Array<{ name: string; email: string }>) ?? [],
  };

  const aiResponse = await getCoordinatorResponse(
    { ritual: enrichedRitual, streak, lastMeetupDate, nextMeetupDate },
    chatHistory,
    parsed.data.content
  );

  const [savedMsg] = await db
    .insert(ritualMessagesTable)
    .values({
      ritualId: params.data.id,
      role: "assistant",
      content: aiResponse,
    })
    .returning();

  res.json(SendMessageResponse.parse(savedMsg));
});

function hasExplicitTime(text: string): boolean {
  return /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.test(text) ||
    /\b([01]?\d|2[0-3]):([0-5]\d)\b/.test(text);
}

function hasExplicitWeekday(text: string): boolean {
  return /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i.test(text);
}

function getContextualHour(text: string): number {
  const t = text.toLowerCase();
  if (/brunch/.test(t)) return 11;
  if (/breakfast/.test(t)) return 8;
  if (/lunch/.test(t)) return 12;
  if (/dinner|supper/.test(t)) return 19;
  if (/happy.?hour/.test(t)) return 18;
  if (/coffee|cafe/.test(t)) return 9;
  if (/morning\s+(run|walk|hike|yoga|swim|ride|workout)/.test(t)) return 7;
  if (/morning/.test(t)) return 8;
  if (/evening|night/.test(t)) return 19;
  if (/afternoon/.test(t)) return 14;
  return 18;
}

/**
 * Generate 5 candidate time slots all on the single nearest valid date.
 * The slots are centered on the contextual hour for the ritual, with offsets
 * of -1, 0, +1 (primary) and -2, +2 (fallback) hours on that same date.
 * This gives users varied time options for the same upcoming gathering day
 * rather than the same time repeated across multiple future dates.
 *
 * tzOffsetMinutes: value of new Date().getTimezoneOffset() on the client.
 * Positive = west of UTC (EDT=240, PDT=420). Used to convert the contextual
 * local hour to the correct UTC timestamp.
 *
 * Note: slots near midnight may cross a UTC date boundary; the "same day"
 * guarantee is in local time but UTC dates may differ for midnight-adjacent inputs.
 */
function generateCandidateSlots(dayPreference: string, frequency: string, name: string, tzOffsetMinutes = 0, _count = 8): Date[] {
  const base = deriveStartDate(dayPreference || "", frequency);

  // Determine the desired local hour
  let localHour: number;
  if (hasExplicitTime(dayPreference)) {
    // deriveStartDate already set base's hours in server-UTC to the parsed value.
    // Treat that UTC hour as the "intended local hour" and convert to real UTC.
    localHour = base.getUTCHours();
  } else {
    localHour = getContextualHour(name + " " + dayPreference);
  }

  // Convert local hour → UTC: UTC = local + tzOffset/60
  const utcHour = localHour + Math.round(tzOffsetMinutes / 60);
  const utcHourNorm = ((utcHour % 24) + 24) % 24;
  const dayDelta = utcHour >= 24 ? 1 : utcHour < 0 ? -1 : 0;
  base.setUTCHours(utcHourNorm, 0, 0, 0);
  if (dayDelta !== 0) base.setUTCDate(base.getUTCDate() + dayDelta);

  // Return 3 time options on the same nearest date: contextual hour -1, same, +1
  // Fallback offsets: -2 and +2 if -1/+1 are busy (handled in generateCalendarAwareTimes)
  const offsets = [-1, 0, 1, -2, 2];
  const candidates: Date[] = offsets.map((offset) => {
    const d = new Date(base);
    const adjustedUtcHour = utcHourNorm + offset;
    const normHour = ((adjustedUtcHour % 24) + 24) % 24;
    const extraDay = adjustedUtcHour >= 24 ? 1 : adjustedUtcHour < 0 ? -1 : 0;
    d.setUTCHours(normHour, 0, 0, 0);
    if (extraDay !== 0) d.setUTCDate(d.getUTCDate() + extraDay);
    return d;
  });
  return candidates;
}

function slotIsBusy(slot: Date, busy: Array<{ start: string; end: string }>): boolean {
  const slotEnd = new Date(slot.getTime() + 60 * 60 * 1000);
  return busy.some((b) => {
    const bs = new Date(b.start);
    const be = new Date(b.end);
    return slot < be && slotEnd > bs;
  });
}

function generateFallbackTimes(dayPreference: string, frequency: string, name = ""): string[] {
  return generateCandidateSlots(dayPreference, frequency, name, 0)
    .slice(0, 3)
    .map((d) => d.toISOString());
}

/**
 * Calendar-aware time generation — no Anthropic needed.
 * Gets the organizer's free/busy slots and prefers available windows,
 * falling back to unfiltered candidates if not enough free slots are found.
 */
async function generateCalendarAwareTimes(
  userId: number,
  dayPreference: string,
  frequency: string,
  name: string,
  tzOffsetMinutes = 0
): Promise<string[]> {
  // candidates[0]=-1hr, [1]=0hr, [2]=+1hr, [3]=-2hr, [4]=+2hr — all on same nearest date
  const candidates = generateCandidateSlots(dayPreference, frequency, name, tzOffsetMinutes);
  const lastCandidate = candidates.reduce((a, b) => (a > b ? a : b));

  let busy: Array<{ start: string; end: string }> = [];
  try {
    busy = await getFreeBusy(userId, new Date(), lastCandidate);
  } catch {
    // Calendar unavailable — proceed without filtering
  }

  // Prefer the primary three (-1, 0, +1) that are free; fall back to (-2, +2) if needed
  const primary = candidates.slice(0, 3);
  const fallback = candidates.slice(3);

  const result: Date[] = primary.filter((c) => !slotIsBusy(c, busy));

  // Pad with fallback slots if needed
  for (const c of fallback) {
    if (result.length >= 3) break;
    if (!slotIsBusy(c, busy)) result.push(c);
  }

  // Final pad from primary (busy) if still not enough
  for (const c of primary) {
    if (result.length >= 3) break;
    if (!result.some((r) => r.getTime() === c.getTime())) result.push(c);
  }

  // Sort by time so they appear in chronological order
  result.sort((a, b) => a.getTime() - b.getTime());

  return result.slice(0, 3).map((d) => d.toISOString());
}

// GET /api/rituals/:id/suggested-times — auth-required
// Always generates fresh suggestions based on day preference + calendar free/busy.
// Does NOT use proposedTimes cache — that is only set via PATCH when the user confirms.
router.get("/rituals/:id/suggested-times", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ritual id" });
    return;
  }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  if (ritual.ownerId !== sessionUserId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Parse optional timezone offset sent by the client (new Date().getTimezoneOffset())
  const tzOffset = parseInt(String(req.query.tzOffset ?? "0"), 10);
  const tzOffsetMinutes = isNaN(tzOffset) ? 0 : tzOffset;

  // Generate calendar-aware suggestions: all on the right weekday, calendar-checked, no Anthropic needed
  const times = await generateCalendarAwareTimes(
    sessionUserId,
    ritual.dayPreference ?? "",
    ritual.frequency,
    ritual.name,
    tzOffsetMinutes
  );

  res.json({ proposedTimes: times });
});

// PATCH /api/rituals/:id/proposed-times — auth-required
const ISOTimestamp = z.string().refine((s) => !isNaN(Date.parse(s)), { message: "Must be a valid ISO timestamp" });
const ProposedTimesBody = z.object({
  proposedTimes: z.array(ISOTimestamp).min(1).max(3),
  confirmedTime: ISOTimestamp.optional(),
  location: z.string().optional(),
});

router.patch("/rituals/:id/proposed-times", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ritual id" });
    return;
  }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = ProposedTimesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  if (ritual.ownerId !== sessionUserId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const updatePayload: Partial<typeof ritualsTable.$inferInsert> = {
    proposedTimes: parsed.data.proposedTimes,
  };
  if (parsed.data.confirmedTime !== undefined) {
    updatePayload.confirmedTime = parsed.data.confirmedTime;
  }
  if (parsed.data.location !== undefined) {
    updatePayload.location = parsed.data.location || null;
  }

  const [updated] = await db
    .update(ritualsTable)
    .set(updatePayload)
    .where(eq(ritualsTable.id, id))
    .returning();

  // Check if there's already a planned meetup with a calendar event ID
  const existingMeetups = await db
    .select()
    .from(meetupsTable)
    .where(eq(meetupsTable.ritualId, id))
    .orderBy(desc(meetupsTable.createdAt));
  const existingPlanned = existingMeetups.find((m) => m.status === "planned" && m.googleCalendarEventId);

  const participants = (ritual.participants as Array<{ name: string; email: string }>) ?? [];
  const appBase = getFrontendUrl();

  // Upsert invite tokens for each participant (idempotent — keeps existing tokens)
  const inviteLinks: Array<{ email: string; name: string; token: string; url: string }> = [];
  for (const p of participants) {
    const existing = await db
      .select()
      .from(inviteTokensTable)
      .where(eq(inviteTokensTable.ritualId, id));
    const existingForEmail = existing.find((t) => t.email === p.email);
    const token = existingForEmail?.token ?? randomUUID();
    if (!existingForEmail) {
      await db.insert(inviteTokensTable).values({ ritualId: id, email: p.email, name: p.name, token });
    }
    inviteLinks.push({ email: p.email, name: p.name, token, url: `${appBase}/invite/${token}` });
  }

  // Build calendar description — short, link-first
  function buildCalendarDescription(opts: {
    ritual: typeof ritualsTable.$inferSelect;
    proposedTimes: string[];
    confirmedTime?: string;
    inviteLinks: typeof inviteLinks;
    participantEmail?: string;
  }): string {
    const { ritual: r, confirmedTime, proposedTimes, inviteLinks: links, participantEmail } = opts;
    const link = links.find((l) => l.email === participantEmail);
    const personalUrl = link?.url ?? (links[0] ? links[0].url : null);

    const lines: string[] = [r.name];
    if (r.intention) lines.push(`"${r.intention}"`);
    lines.push("");

    if (confirmedTime) {
      const d = new Date(confirmedTime);
      lines.push(`📅 ${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`);
      lines.push("");
    } else if (proposedTimes.length > 0) {
      const d = new Date(proposedTimes[0]);
      lines.push(`📅 Proposed: ${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`);
      lines.push("");
    }

    if (personalUrl) {
      lines.push("Your personal link:");
      lines.push(personalUrl);
      lines.push("");
    }

    lines.push("Eleanor — a shared practice companion");
    return lines.join("\n");
  }

  // When confirmedTime is included, create/update the Google Calendar event and send invites
  if (parsed.data.confirmedTime !== undefined) {
    const confirmedTime = new Date(parsed.data.confirmedTime);
    const participantEmails = participants.map((p) => p.email);
    const description = buildCalendarDescription({
      ritual,
      proposedTimes: parsed.data.proposedTimes ?? [],
      confirmedTime: parsed.data.confirmedTime,
      inviteLinks,
    });

    if (existingPlanned?.googleCalendarEventId) {
      // Already have a meetup row — update the GCal event async
      updateCalendarEvent(sessionUserId, existingPlanned.googleCalendarEventId, {
        summary: ritual.name,
        description,
        startDate: confirmedTime,
        attendees: participantEmails,
      }).catch(() => {});
    } else if (existingPlanned) {
      // Have a meetup row but no GCal ID — create the GCal event async and link it
      createCalendarEvent(sessionUserId, {
        summary: ritual.name,
        description,
        location: parsed.data.location || ritual.location || undefined,
        startDate: confirmedTime,
        attendees: participantEmails,
      })
        .then(async (eventId) => {
          if (eventId) {
            await db.update(meetupsTable).set({ googleCalendarEventId: eventId }).where(eq(meetupsTable.id, existingPlanned.id));
          }
        })
        .catch(() => {});
    } else {
      // No meetup row yet — insert it NOW so the timeline is immediately visible, then link GCal async
      const [newMeetup] = await db.insert(meetupsTable).values({
        ritualId: id,
        scheduledDate: confirmedTime,
        status: "planned",
      }).returning();

      createCalendarEvent(sessionUserId, {
        summary: ritual.name,
        description,
        location: parsed.data.location || ritual.location || undefined,
        startDate: confirmedTime,
        attendees: participantEmails,
      })
        .then(async (eventId) => {
          if (eventId && newMeetup) {
            await db.update(meetupsTable).set({ googleCalendarEventId: eventId }).where(eq(meetupsTable.id, newMeetup.id));
          }
        })
        .catch(() => {});
    }
  } else if (parsed.data.proposedTimes && parsed.data.proposedTimes.length > 0) {
    // Flexible save: proposed times without a confirmed time.
    const placeholderTime = new Date(parsed.data.proposedTimes[0]);
    const description = buildCalendarDescription({
      ritual,
      proposedTimes: parsed.data.proposedTimes,
      inviteLinks,
    });

    if (existingPlanned) {
      // Already have a meetup row — update its date if changed, and update GCal event async
      if (existingPlanned.scheduledDate.getTime() !== placeholderTime.getTime()) {
        await db.update(meetupsTable).set({ scheduledDate: placeholderTime }).where(eq(meetupsTable.id, existingPlanned.id));
      }
      if (existingPlanned.googleCalendarEventId) {
        updateCalendarEvent(sessionUserId, existingPlanned.googleCalendarEventId, {
          summary: `${ritual.name} — time TBD`,
          description,
          startDate: placeholderTime,
          attendees: participants.map((p) => p.email),
        }).catch(() => {});
      }
    } else {
      // No meetup row yet — insert it NOW so the timeline shows immediately, then create GCal async
      const [newMeetup] = await db.insert(meetupsTable).values({
        ritualId: id,
        scheduledDate: placeholderTime,
        status: "planned",
      }).returning();

      createCalendarEvent(sessionUserId, {
        summary: `${ritual.name} — time TBD`,
        description,
        location: parsed.data.location || ritual.location || undefined,
        startDate: placeholderTime,
        attendees: participants.map((p) => p.email),
      })
        .then(async (eventId) => {
          if (eventId && newMeetup) {
            await db.update(meetupsTable).set({ googleCalendarEventId: eventId }).where(eq(meetupsTable.id, newMeetup.id));
          }
        })
        .catch(() => {});
    }
  }

  res.json({ proposedTimes: updated.proposedTimes, confirmedTime: updated.confirmedTime });
});

// GET /api/rituals/:id/timeline — returns upcoming (planned) meetup synced with Google Calendar + past meetups
router.get("/rituals/:id/timeline", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }
  if (ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const allMeetups = await db
    .select()
    .from(meetupsTable)
    .where(eq(meetupsTable.ritualId, id))
    .orderBy(desc(meetupsTable.scheduledDate));

  // The upcoming meetup is the most recent "planned" one
  let upcoming = allMeetups.find((m) => m.status === "planned") ?? null;

  // Sync with Google Calendar: if the event was rescheduled or deleted in Google, update our record
  if (upcoming?.googleCalendarEventId) {
    try {
      const calEvent = await getCalendarEvent(sessionUserId, upcoming.googleCalendarEventId);
      if (calEvent) {
        const storedTime = upcoming.scheduledDate.getTime();
        const calTime = calEvent.startDate.getTime();
        if (Math.abs(storedTime - calTime) > 60_000) {
          // More than 1 minute difference — Google Calendar was updated, sync the new time
          const [synced] = await db
            .update(meetupsTable)
            .set({ scheduledDate: calEvent.startDate })
            .where(eq(meetupsTable.id, upcoming.id))
            .returning();
          upcoming = synced;
        }
      } else {
        // Event was deleted from Google Calendar — clear the event ID from our record
        const [cleared] = await db
          .update(meetupsTable)
          .set({ googleCalendarEventId: null })
          .where(eq(meetupsTable.id, upcoming.id))
          .returning();
        upcoming = cleared;
      }
    } catch {
      // Calendar sync failure is non-fatal
    }
  }

  // Also check if ritual.confirmedTime has a matching planned meetup; if not, create one
  if (ritual.confirmedTime && !upcoming) {
    const confirmedTime = new Date(ritual.confirmedTime);
    if (confirmedTime > new Date()) {
      const [newMeetup] = await db
        .insert(meetupsTable)
        .values({ ritualId: id, scheduledDate: confirmedTime, status: "planned" })
        .returning();
      upcoming = newMeetup;
    }
  }

  const past = allMeetups.filter((m) => m.status !== "planned");

  res.json({
    upcoming: upcoming
      ? { ...upcoming, scheduledDate: upcoming.scheduledDate.toISOString() }
      : null,
    past: past.map((m) => ({ ...m, scheduledDate: m.scheduledDate.toISOString() })),
    location: ritual.location,
    confirmedTime: ritual.confirmedTime,
  });
});

// PATCH /api/rituals/:id/meetups/:meetupId — log a planned meetup as completed or skipped
router.patch("/rituals/:id/meetups/:meetupId", async (req, res): Promise<void> => {
  const ritualId = parseInt(req.params.id, 10);
  const meetupId = parseInt(req.params.meetupId, 10);
  if (isNaN(ritualId) || isNaN(meetupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = z.object({ status: z.enum(["completed", "skipped"]) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "status must be completed or skipped" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }

  const [updated] = await db
    .update(meetupsTable)
    .set({ status: parsed.data.status })
    .where(eq(meetupsTable.id, meetupId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Meetup not found" }); return; }

  res.json({ ...updated, scheduledDate: updated.scheduledDate.toISOString() });
});

// GET /api/rituals/:id/scheduling-summary — auth-required
router.get("/rituals/:id/scheduling-summary", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ritual id" });
    return;
  }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  if (ritual.ownerId !== sessionUserId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const responses = await db
    .select()
    .from(schedulingResponsesTable)
    .where(eq(schedulingResponsesTable.ritualId, id))
    .orderBy(schedulingResponsesTable.createdAt);

  res.json({ responses });
});

// POST /api/rituals/:id/confirm-time — auth-required
const ConfirmTimeBody = z.object({
  confirmedTime: z.string().refine((s) => !isNaN(Date.parse(s)), { message: "confirmedTime must be a valid ISO timestamp" }),
});

router.post("/rituals/:id/confirm-time", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ritual id" });
    return;
  }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = ConfirmTimeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  if (ritual.ownerId !== sessionUserId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const confirmedTime = new Date(parsed.data.confirmedTime);

  await db
    .update(ritualsTable)
    .set({ confirmedTime })
    .where(eq(ritualsTable.id, id));

  // Gather all participant emails from scheduling responses + ritual participants
  const responses = await db
    .select()
    .from(schedulingResponsesTable)
    .where(eq(schedulingResponsesTable.ritualId, id));

  const responseEmails = responses.map((r) => r.email);
  const participantEmails = ((ritual.participants as Array<{ email: string }>) ?? []).map((p) => p.email);
  const allEmails = [...new Set([...responseEmails, ...participantEmails])].filter(Boolean);

  // Find existing calendar event on the most recent meetup for this ritual
  const meetups = await db
    .select()
    .from(meetupsTable)
    .where(eq(meetupsTable.ritualId, id))
    .orderBy(desc(meetupsTable.createdAt));

  const existingEventId = meetups.find((m) => m.googleCalendarEventId)?.googleCalendarEventId ?? null;

  if (existingEventId) {
    updateCalendarEvent(sessionUserId, existingEventId, {
      summary: ritual.name,
      description: ritual.intention ?? `Confirmed gathering: ${ritual.name}`,
      startDate: confirmedTime,
      attendees: allEmails,
    }).catch((err) => req.log.warn({ err }, "Failed to update calendar event"));
  } else {
    // Create a new event and persist its ID to a new meetup row for future updates
    createCalendarEvent(sessionUserId, {
      summary: ritual.name,
      description: ritual.intention ?? `Confirmed gathering: ${ritual.name}`,
      startDate: confirmedTime,
      attendees: allEmails,
    })
      .then(async (eventId) => {
        if (eventId) {
          await db.insert(meetupsTable).values({
            ritualId: id,
            scheduledDate: confirmedTime,
            status: "planned",
            googleCalendarEventId: eventId,
          });
        }
      })
      .catch((err) => req.log.warn({ err }, "Failed to create confirmation calendar event"));
  }

  res.json({ confirmedTime: confirmedTime.toISOString() });
});

// ─── GET /api/rituals/:id/connections ─────────────────────────────────────────
// Returns Eleanor users who share a moment or tradition with the current user
// but are NOT already a member of this tradition
router.get("/rituals/:id/connections", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!currentUser) { res.status(404).json({ error: "User not found" }); return; }

  const currentParticipants = (ritual.participants as Array<{ name: string; email: string }>) ?? [];
  const currentEmails = new Set(currentParticipants.map(p => p.email.toLowerCase()));

  // Collect emails from existing moment connections
  const myMomentTokens = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.email, currentUser.email));
  const momentIds = [...new Set(myMomentTokens.map(t => t.momentId))];
  const allConnections: Map<string, string> = new Map(); // email -> name

  if (momentIds.length > 0) {
    for (const mid of momentIds) {
      const allTokens = await db.select().from(momentUserTokensTable)
        .where(eq(momentUserTokensTable.momentId, mid));
      for (const t of allTokens) {
        if (t.email.toLowerCase() !== currentUser.email.toLowerCase()) {
          allConnections.set(t.email.toLowerCase(), t.name ?? t.email);
        }
      }
    }
  }

  // Collect emails from other rituals the user is in
  const allRituals = await db.select().from(ritualsTable);
  for (const r of allRituals) {
    const parts = (r.participants as Array<{ name: string; email: string }>) ?? [];
    const isMember = parts.some(p => p.email.toLowerCase() === currentUser.email.toLowerCase());
    if (isMember) {
      for (const p of parts) {
        if (p.email.toLowerCase() !== currentUser.email.toLowerCase()) {
          allConnections.set(p.email.toLowerCase(), p.name ?? p.email);
        }
      }
    }
  }

  // Filter out already-members of this tradition
  const connections = Array.from(allConnections.entries())
    .filter(([email]) => !currentEmails.has(email))
    .map(([email, name]) => ({ email, name }));

  res.json({ connections });
});

// ─── POST /api/rituals/:id/invite ────────────────────────────────────────────
// Adds new participants to the tradition and invites them via calendar
router.post("/rituals/:id/invite", async (req, res): Promise<void> => {
  try {
    const sessionUserId = req.user ? (req.user as { id: number }).id : null;
    if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const ritualId = parseInt(req.params.id, 10);
    if (isNaN(ritualId)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

    const parsed = z.object({
      participants: z.array(z.object({ name: z.string(), email: z.string().email() })).min(1),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Validation failed" }); return; }

    const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
    if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }

    const current = (ritual.participants as Array<{ name: string; email: string }>) ?? [];
    const currentEmails = new Set(current.map(p => p.email.toLowerCase()));

    // Merge new participants (deduplicate by email)
    const newParts = parsed.data.participants.filter(p => !currentEmails.has(p.email.toLowerCase()));
    if (newParts.length === 0) {
      res.json({ participants: current, added: [] });
      return;
    }
    const merged = [...current, ...newParts];

    await db.update(ritualsTable).set({ participants: merged }).where(eq(ritualsTable.id, ritualId));

    // Add invite tokens for new participants
    const appBase = getFrontendUrl();
    for (const p of newParts) {
      const existingToken = await db.select().from(inviteTokensTable)
        .where(eq(inviteTokensTable.ritualId, ritualId));
      const alreadyHasToken = existingToken.find(t => t.email.toLowerCase() === p.email.toLowerCase());
      if (!alreadyHasToken) {
        const token = randomUUID();
        await db.insert(inviteTokensTable).values({ ritualId, email: p.email, name: p.name, token });
      }
    }

    // Add new participants to the Google Calendar event (if one exists)
    const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritualId));
    const eventMeetup = meetups.find(m => m.googleCalendarEventId);
    if (eventMeetup?.googleCalendarEventId) {
      await addAttendeesToCalendarEvent(
        sessionUserId,
        eventMeetup.googleCalendarEventId,
        newParts.map(p => p.email)
      ).catch(() => null);
    }

    res.json({ participants: merged, added: newParts });
  } catch (err) {
    console.error("POST /api/rituals/:id/invite error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/rituals/:id/calendar-sync ──────────────────────────────────────
// Syncs attendees from the Google Calendar event into tradition members
router.get("/rituals/:id/calendar-sync", async (req, res): Promise<void> => {
  try {
    const sessionUserId = req.user ? (req.user as { id: number }).id : null;
    if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const ritualId = parseInt(req.params.id, 10);
    if (isNaN(ritualId)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

    const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
    if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }

    const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritualId));
    const eventMeetup = meetups.find(m => m.googleCalendarEventId);
    if (!eventMeetup?.googleCalendarEventId) {
      res.json({ synced: [], declinedEmails: [] });
      return;
    }

    const attendees = await getCalendarEventAttendees(sessionUserId, eventMeetup.googleCalendarEventId);
    if (!attendees) {
      res.json({ synced: [], declinedEmails: [] });
      return;
    }

    const current = (ritual.participants as Array<{ name: string; email: string }>) ?? [];
    const currentEmails = new Set(current.map(p => p.email.toLowerCase()));

    // Find attendees not in tradition — add them
    const toAdd = attendees.filter(a => !currentEmails.has(a.email.toLowerCase()));
    const declinedEmails = attendees
      .filter(a => a.responseStatus === "declined" && currentEmails.has(a.email.toLowerCase()))
      .map(a => a.email.toLowerCase());

    if (toAdd.length > 0) {
      const newParts = toAdd.map(a => ({ email: a.email, name: a.displayName ?? a.email }));
      await db.update(ritualsTable)
        .set({ participants: [...current, ...newParts] })
        .where(eq(ritualsTable.id, ritualId));
    }

    res.json({ synced: toAdd.map(a => ({ email: a.email, name: a.displayName ?? a.email })), declinedEmails });
  } catch (err) {
    console.error("GET /api/rituals/:id/calendar-sync error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
