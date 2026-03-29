import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, ritualsTable, meetupsTable, ritualMessagesTable } from "@workspace/db";
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
  const rituals = await db.select().from(ritualsTable).orderBy(desc(ritualsTable.createdAt));
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

export default router;
