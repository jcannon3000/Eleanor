import { getFrontendUrl } from "../lib/urls";
import { Router, type IRouter } from "express";
import { eq, desc, or, sql, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, ritualsTable, meetupsTable, ritualMessagesTable, scheduleResponsesTable, inviteTokensTable, usersTable, momentUserTokensTable, ritualTimeSuggestionsTable } from "@workspace/db";
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent, addAttendeesToCalendarEvent, removeAttendeesFromCalendarEvent, getCalendarEvent } from "../lib/calendar";
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
import { getWelcomeMessage, getCoordinatorResponse } from "../lib/agent";
import { z } from "zod/v4";

const router: IRouter = Router();

async function enrichRitual(ritual: typeof ritualsTable.$inferSelect, meetups: typeof meetupsTable.$inferSelect[]) {
  const { streak, lastMeetupDate, nextMeetupDate: computedNext, status } = computeStreak(meetups, ritual.frequency);

  // If no history yet, fall back to the earliest future planned meetup date
  let nextMeetupDate = computedNext;
  if (!nextMeetupDate) {
    const now = new Date();
    const planned = meetups
      .filter((m) => m.status === "planned" && new Date(m.scheduledDate) > now)
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
    if (planned.length > 0) {
      nextMeetupDate = new Date(planned[0].scheduledDate).toISOString();
    }
  }

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

  // Also fetch rituals where the user appears as a participant (by email)
  let userEmail: string | null = null;
  if (ownerId !== null && !isNaN(ownerId)) {
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, ownerId));
    userEmail = u?.email ?? null;
  }

  const whereClause = ownerId !== null && !isNaN(ownerId)
    ? userEmail
      ? or(
          eq(ritualsTable.ownerId, ownerId),
          sql`${ritualsTable.participants} @> ${JSON.stringify([{ email: userEmail }])}::jsonb`
        )
      : eq(ritualsTable.ownerId, ownerId)
    : undefined;

  const rituals = await db
    .select()
    .from(ritualsTable)
    .where(whereClause)
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

  // Verify ownership
  const [ritual] = await db.select({ ownerId: ritualsTable.ownerId }).from(ritualsTable).where(eq(ritualsTable.id, params.data.id));
  if (!ritual) { res.status(404).json({ error: "Tradition not found" }); return; }
  if (!sessionUserId || ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Only the owner can delete this tradition" }); return; }

  // Delete Google Calendar events from meetups before removing DB records
  try {
    const meetupsToClean = await db.select({ id: meetupsTable.id, googleCalendarEventId: meetupsTable.googleCalendarEventId })
      .from(meetupsTable).where(eq(meetupsTable.ritualId, params.data.id));
    for (const m of meetupsToClean) {
      if (m.googleCalendarEventId) {
        try {
          await deleteCalendarEvent(sessionUserId, m.googleCalendarEventId);
          console.info(`Deleted tradition GCal event ${m.googleCalendarEventId}`);
        } catch { /* best effort */ }
      }
    }
  } catch { /* non-fatal */ }

  // Delete all dependent records (tables without ON DELETE CASCADE in the actual DB)
  await db.delete(meetupsTable).where(eq(meetupsTable.ritualId, params.data.id));
  await db.delete(ritualMessagesTable).where(eq(ritualMessagesTable.ritualId, params.data.id));
  await db.delete(scheduleResponsesTable).where(eq(scheduleResponsesTable.ritualId, params.data.id));
  await db.delete(inviteTokensTable).where(eq(inviteTokensTable.ritualId, params.data.id));

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

  // Create invite tokens for each participant
  const participants = (ritual.participants as Array<{ name: string; email: string }>) ?? [];
  const appBase = getFrontendUrl();
  const existingInvites = await db
    .select()
    .from(inviteTokensTable)
    .where(eq(inviteTokensTable.ritualId, id));
  for (const p of participants) {
    const existingForEmail = existingInvites.find((t) => t.email === p.email);
    if (!existingForEmail) {
      await db.insert(inviteTokensTable).values({ ritualId: id, email: p.email, name: p.name, token: randomUUID() });
    }
  }

  // Create a planned meetup row so dashboard shows the proposed date
  let meetupId: number | null = null;
  if (parsed.data.proposedTimes && parsed.data.proposedTimes.length > 0) {
    const placeholderTime = new Date(parsed.data.proposedTimes[0]);
    const existingMeetups = await db
      .select()
      .from(meetupsTable)
      .where(eq(meetupsTable.ritualId, id));
    const existingPlanned = existingMeetups.find((m) => m.status === "planned");

    if (existingPlanned) {
      await db.update(meetupsTable).set({ scheduledDate: placeholderTime }).where(eq(meetupsTable.id, existingPlanned.id));
      meetupId = existingPlanned.id;
    } else {
      const [inserted] = await db.insert(meetupsTable).values({
        ritualId: id,
        scheduledDate: placeholderTime,
        status: "planned",
      }).returning();
      meetupId = inserted.id;
    }
  }

  // ─── Create Google Calendar event for the tradition ─────────────────────────
  try {
    const [organizer] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
    if (organizer && parsed.data.proposedTimes.length > 0) {
      const appBase = getFrontendUrl();
      const organizerFirstName = (organizer.name ?? organizer.email ?? "Someone").split(" ")[0];

      // Warm one-liner based on tradition name
      const nameLower = (ritual.name ?? "").toLowerCase();
      const WARM_LINES: Record<string, string> = {
        coffee: "A recurring time to share a cup together.",
        meal: "A standing meal, week after week.",
        walk: "A regular walk, together.",
        run: "Keeping the pace, keeping the commitment.",
      };
      const warmLine = WARM_LINES[nameLower] ?? "A recurring tradition worth tending.";

      // Frequency label
      const FREQ_LABELS: Record<string, string> = {
        weekly: "Every week",
        biweekly: "Every 2 weeks",
        monthly: "Once a month",
      };
      const freqLabel = FREQ_LABELS[ritual.frequency] ?? ritual.frequency;

      // Format proposed times for the description
      function formatProposedTime(isoStr: string): string {
        const d = new Date(isoStr);
        const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        const day = dayNames[d.getDay()];
        const month = monthNames[d.getMonth()];
        const date = d.getDate();
        const h = d.getHours();
        const m = d.getMinutes();
        const period = h < 12 ? "AM" : "PM";
        const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const minStr = m === 0 ? "" : `:${String(m).padStart(2, "0")}`;
        return `${day}, ${month} ${date} · ${hour12}${minStr} ${period}`;
      }

      // Create ONE group calendar event with all participants as attendees.
      // Each person gets their individual invite link via the Eleanor invite page, not the calendar.
      const proposedTimes = parsed.data.proposedTimes;
      const attendeeEmails = participants.map(p => p.email); // All members get invites from scheduler

      // Fetch organizer's invite token for the link
      const allTokens = await db.select().from(inviteTokensTable)
        .where(eq(inviteTokensTable.ritualId, id));
      const organizerInviteToken = allTokens.find(t => t.email === organizer.email);
      const scheduleUrl = ritual.scheduleToken
        ? `${appBase}/schedule/${ritual.scheduleToken}`
        : (organizerInviteToken ? `${appBase}/invite/${organizerInviteToken.token}` : appBase);

      // Build description
      const lines: string[] = [];
      lines.push(`${organizerFirstName} is gathering people for ${ritual.name} 🌿`);
      lines.push(warmLine);
      lines.push("");
      lines.push("──────────────────────");
      lines.push("");

      if (proposedTimes.length > 0) {
        lines.push("Proposed times:");
        lines.push("");
        for (let i = 0; i < proposedTimes.length; i++) {
          const label = i === 0 ? "✓ First choice" : "· Alternate";
          lines.push(`  ${label}: ${formatProposedTime(proposedTimes[i])}`);
        }
        lines.push("");
        lines.push("──────────────────────");
        lines.push("");
      }

      lines.push(`${ritual.name} · ${freqLabel}`);
      lines.push(`Tended with Eleanor 🌿`);
      lines.push("");
      lines.push("View this tradition →");
      lines.push(scheduleUrl);
      lines.push("");
      lines.push("──────────────────────");
      lines.push("");
      lines.push("Eleanor helps recurring gatherings actually happen.");
      lines.push("Check your email for your personal invite link to respond.");

      const description = lines.join("\n");
      const eventStart = new Date(proposedTimes[0]);
      const eventEnd = new Date(eventStart.getTime() + 60 * 60_000);

      const eventId = await createCalendarEvent(sessionUserId, {
        summary: ritual.name,
        description,
        startDate: eventStart,
        endDate: eventEnd,
        attendees: attendeeEmails,
        colorId: "5",
        status: "tentative",
        reminders: [
          { method: "email", minutes: 1440 },
          { method: "popup", minutes: 120 },
        ],
      });

      if (eventId && meetupId) {
        await db.update(meetupsTable)
          .set({ googleCalendarEventId: eventId })
          .where(eq(meetupsTable.id, meetupId));
      }
    }
  } catch (calErr) {
    console.error("Tradition calendar event creation failed (non-fatal):", calErr);
  }

  res.json({ proposedTimes: updated.proposedTimes, confirmedTime: updated.confirmedTime });
});

// GET /api/rituals/:id/timeline — returns upcoming (planned) meetup + past meetups
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

  // Check if the creator's calendar event for the upcoming meetup was deleted
  let calendarEventMissing = false;
  if (upcoming?.googleCalendarEventId) {
    const calEvent = await getCalendarEvent(sessionUserId, upcoming.googleCalendarEventId);
    if (!calEvent) calendarEventMissing = true;
  }

  res.json({
    upcoming: upcoming
      ? { ...upcoming, scheduledDate: upcoming.scheduledDate.toISOString() }
      : null,
    past: past.map((m) => ({ ...m, scheduledDate: m.scheduledDate.toISOString() })),
    location: ritual.location,
    confirmedTime: ritual.confirmedTime,
    calendarEventMissing,
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
    .from(scheduleResponsesTable)
    .where(eq(scheduleResponsesTable.ritualId, id))
    .orderBy(scheduleResponsesTable.createdAt);

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

  const confirmedTime = parsed.data.confirmedTime;

  await db
    .update(ritualsTable)
    .set({ confirmedTime })
    .where(eq(ritualsTable.id, id));

  // Create a planned meetup for the confirmed time
  const existingMeetups = await db
    .select()
    .from(meetupsTable)
    .where(eq(meetupsTable.ritualId, id));
  const existingPlanned = existingMeetups.find((m) => m.status === "planned");

  if (existingPlanned) {
    await db.update(meetupsTable).set({ scheduledDate: confirmedTime }).where(eq(meetupsTable.id, existingPlanned.id));
  } else {
    await db.insert(meetupsTable).values({
      ritualId: id,
      scheduledDate: confirmedTime,
      status: "planned",
    });
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
// Adds new participants to the tradition
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

    // Add new members to existing calendar event
    try {
      const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritualId));
      const plannedMeetup = meetups.find(m => m.status === "planned" && m.googleCalendarEventId);
      if (plannedMeetup?.googleCalendarEventId) {
        const newEmails = newParts.map(p => p.email);
        await addAttendeesToCalendarEvent(sessionUserId, plannedMeetup.googleCalendarEventId, newEmails);
      }
    } catch { /* non-fatal */ }

    res.json({ participants: merged, added: newParts });
  } catch (err) {
    console.error("POST /api/rituals/:id/invite error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /api/rituals/:id/participants/:email — owner removes a member ─────
router.delete("/rituals/:id/participants/:email", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const emailToRemove = decodeURIComponent(req.params.email).toLowerCase();

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }

  if (ritual.ownerId !== sessionUserId) {
    res.status(403).json({ error: "Only the owner can remove members" });
    return;
  }

  // Can't remove yourself
  const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (owner && owner.email.toLowerCase() === emailToRemove) {
    res.status(400).json({ error: "Cannot remove yourself. Delete the tradition instead." });
    return;
  }

  const participants = (ritual.participants as Array<{ name: string; email: string }>) ?? [];
  const updated = participants.filter(p => p.email.toLowerCase() !== emailToRemove);
  if (updated.length === participants.length) {
    res.status(404).json({ error: "Member not found in this tradition" });
    return;
  }

  // Update participants array
  await db.update(ritualsTable).set({ participants: updated }).where(eq(ritualsTable.id, ritualId));

  // Remove invite token
  const tokens = await db.select().from(inviteTokensTable).where(eq(inviteTokensTable.ritualId, ritualId));
  const tokenToRemove = tokens.find(t => t.email.toLowerCase() === emailToRemove);
  if (tokenToRemove) {
    await db.delete(inviteTokensTable).where(eq(inviteTokensTable.id, tokenToRemove.id));
  }

  // Remove from calendar event
  try {
    const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritualId));
    const plannedMeetup = meetups.find(m => m.status === "planned" && m.googleCalendarEventId);
    if (plannedMeetup?.googleCalendarEventId) {
      await removeAttendeesFromCalendarEvent(sessionUserId, plannedMeetup.googleCalendarEventId, [emailToRemove]);
    }
  } catch { /* non-fatal */ }

  res.json({ success: true, participants: updated, removed: emailToRemove });
});

// ─── POST /api/rituals/:id/restore-calendar — owner restores deleted calendar event ───
router.post("/rituals/:id/restore-calendar", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }
  if (ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [planned] = await db.select().from(meetupsTable)
    .where(and(eq(meetupsTable.ritualId, id), eq(meetupsTable.status, "planned")));
  if (!planned) { res.status(400).json({ error: "No upcoming gathering to restore" }); return; }

  const participants = (ritual.participants as Array<{ name: string; email: string }>) ?? [];
  const [organizer] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!organizer) { res.status(404).json({ error: "User not found" }); return; }

  const eventStart = new Date(planned.scheduledDate);
  const eventEnd = new Date(eventStart.getTime() + 60 * 60_000);
  const attendeeEmails = participants.map(p => p.email); // All members get invites from scheduler

  const eventId = await createCalendarEvent(sessionUserId, {
    summary: ritual.name,
    description: [
      `${ritual.name} — restored via Eleanor`,
      ritual.intention ? `"${ritual.intention}"` : "",
      "",
      `View this tradition → ${getFrontendUrl()}/ritual/${id}`,
    ].filter(Boolean).join("\n"),
    startDate: eventStart,
    endDate: eventEnd,
    attendees: attendeeEmails,
    colorId: "5",
    status: ritual.confirmedTime ? "confirmed" : "tentative",
    reminders: [
      { method: "popup", minutes: 30 },
    ],
  });

  if (!eventId) { res.status(500).json({ error: "Could not create calendar event" }); return; }

  await db.update(meetupsTable)
    .set({ googleCalendarEventId: eventId })
    .where(eq(meetupsTable.id, planned.id));

  res.json({ success: true });
});

// ─── POST /api/rituals/:id/suggest-time — participant suggests an alternative time ───
router.post("/rituals/:id/suggest-time", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = z.object({
    suggestedTime: z.string().min(1),
    note: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "suggestedTime is required" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Verify user is a participant (owner or listed participant)
  const participants = (ritual.participants as Array<{ name: string; email: string }>) ?? [];
  const isMember = ritual.ownerId === sessionUserId
    || participants.some(p => p.email.toLowerCase() === user.email.toLowerCase());
  if (!isMember) { res.status(403).json({ error: "Not a member of this tradition" }); return; }

  const [suggestion] = await db.insert(ritualTimeSuggestionsTable).values({
    ritualId: id,
    suggestedByEmail: user.email,
    suggestedByName: user.name,
    suggestedTime: parsed.data.suggestedTime,
    note: parsed.data.note ?? null,
  }).returning();

  res.json(suggestion);
});

// ─── GET /api/rituals/:id/suggestions — owner views member time suggestions ───
router.get("/rituals/:id/suggestions", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }

  // Only the owner sees suggestions
  if (ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const suggestions = await db.select()
    .from(ritualTimeSuggestionsTable)
    .where(eq(ritualTimeSuggestionsTable.ritualId, id))
    .orderBy(desc(ritualTimeSuggestionsTable.createdAt));

  res.json({ suggestions });
});

// ─── DELETE /api/rituals/:id/suggestions/:suggestionId — owner dismisses a suggestion ───
router.delete("/rituals/:id/suggestions/:suggestionId", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const suggestionId = parseInt(req.params.suggestionId, 10);
  if (isNaN(id) || isNaN(suggestionId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }
  if (ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(ritualTimeSuggestionsTable)
    .where(and(eq(ritualTimeSuggestionsTable.id, suggestionId), eq(ritualTimeSuggestionsTable.ritualId, id)));

  res.json({ success: true });
});

export default router;
