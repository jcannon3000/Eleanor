import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, ritualsTable, meetupsTable, ritualMessagesTable, schedulingResponsesTable } from "@workspace/db";
import { createCalendarEvent, updateCalendarEvent } from "../lib/calendar";
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
import { deriveStartDate } from "../lib/scheduleDate";
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

  const [ritual] = await db
    .insert(ritualsTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      frequency: parsed.data.frequency,
      dayPreference: parsed.data.dayPreference ?? null,
      participants: parsed.data.participants ?? [],
      intention: parsed.data.intention ?? null,
      ownerId: parsed.data.ownerId,
      schedulingToken,
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

  try {
    const welcome = await getWelcomeMessage(ctx);
    await db.insert(ritualMessagesTable).values({
      ritualId: ritual.id,
      role: "assistant",
      content: welcome,
    });
  } catch (err) {
    req.log.warn({ err }, "Failed to generate welcome message");
  }

  // Fire-and-forget: create a recurring Google Calendar event with all participants as attendees.
  // Always use the authenticated session user's ID for calendar access — never trust client-supplied ownerId.
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (sessionUserId && sessionUserId === ritual.ownerId) {
    const participantEmails = (parsed.data.participants ?? [])
      .map(p => p.email)
      .filter(Boolean);

    const recurrenceRule = parsed.data.frequency === "weekly"
      ? ["RRULE:FREQ=WEEKLY"]
      : parsed.data.frequency === "biweekly"
      ? ["RRULE:FREQ=WEEKLY;INTERVAL=2"]
      : ["RRULE:FREQ=MONTHLY"];

    // Derive start date from dayPreference (e.g. "Thursday evenings", "Tuesdays at 7pm")
    const startDate = deriveStartDate(parsed.data.dayPreference ?? "", parsed.data.frequency);

    createCalendarEvent(sessionUserId, {
      summary: ritual.name,
      description: ritual.intention ?? `Recurring ritual: ${ritual.name}`,
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

// GET /api/rituals/:id/suggested-times — auth-required
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

  const enrichedRitual = {
    ...ritual,
    participants: (ritual.participants as Array<{ name: string; email: string }>) ?? [],
  };

  try {
    const times = await suggestMeetingTimes(sessionUserId, enrichedRitual);
    if (times.length > 0) {
      await db.update(ritualsTable).set({ proposedTimes: times }).where(eq(ritualsTable.id, id));
    }
    res.json({ proposedTimes: times });
  } catch (err) {
    req.log.error({ err }, "Failed to suggest meeting times");
    res.status(500).json({ error: "Failed to generate time suggestions" });
  }
});

// PATCH /api/rituals/:id/proposed-times — auth-required
const ISOTimestamp = z.string().refine((s) => !isNaN(Date.parse(s)), { message: "Must be a valid ISO timestamp" });
const ProposedTimesBody = z.object({
  proposedTimes: z.array(ISOTimestamp).length(3),
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

  const [updated] = await db
    .update(ritualsTable)
    .set({ proposedTimes: parsed.data.proposedTimes })
    .where(eq(ritualsTable.id, id))
    .returning();

  res.json({ proposedTimes: updated.proposedTimes });
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

export default router;
