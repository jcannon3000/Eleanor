import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, ritualsTable, scheduleResponsesTable, schedulingResponsesTable } from "@workspace/db";
import { deriveStartDate } from "../lib/scheduleDate";
import crypto from "crypto";

const router: IRouter = Router();

function generateProposedTimes(dayPreference: string, frequency: string): string[] {
  const base = deriveStartDate(dayPreference, frequency);
  const times: string[] = [];

  times.push(base.toISOString());

  const alt1 = new Date(base);
  if (frequency === "monthly") {
    alt1.setDate(alt1.getDate() + 7);
  } else {
    alt1.setDate(alt1.getDate() + 1);
    if (alt1.getDay() === 0) alt1.setDate(alt1.getDate() + 1);
  }
  times.push(alt1.toISOString());

  const alt2 = new Date(base);
  if (frequency === "monthly") {
    alt2.setDate(alt2.getDate() + 14);
  } else {
    const hoursShift = base.getHours() < 17 ? 2 : -2;
    alt2.setHours(alt2.getHours() + hoursShift);
    alt2.setDate(alt2.getDate() + 7);
  }
  times.push(alt2.toISOString());

  return times;
}

router.get("/rituals/:id/suggested-times", async (req, res): Promise<void> => {
  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) {
    res.status(400).json({ error: "Invalid ritual id" });
    return;
  }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  const existingTimes = (ritual.proposedTimes as string[]) ?? [];
  if (existingTimes.length > 0) {
    res.json({ proposedTimes: existingTimes });
    return;
  }

  const proposedTimes = generateProposedTimes(ritual.dayPreference ?? "", ritual.frequency);

  const token = crypto.randomBytes(16).toString("hex");
  await db
    .update(ritualsTable)
    .set({ proposedTimes, scheduleToken: token })
    .where(eq(ritualsTable.id, ritualId));

  res.json({ proposedTimes, token });
});

router.post("/rituals/:id/confirm-time", async (req, res): Promise<void> => {
  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) {
    res.status(400).json({ error: "Invalid ritual id" });
    return;
  }

  const { confirmedTime } = req.body;
  if (!confirmedTime || typeof confirmedTime !== "string") {
    res.status(400).json({ error: "confirmedTime is required" });
    return;
  }

  const [ritual] = await db
    .update(ritualsTable)
    .set({ confirmedTime })
    .where(eq(ritualsTable.id, ritualId))
    .returning();

  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  res.json({ success: true, confirmedTime: ritual.confirmedTime });
});

// GET /api/schedule/:token — no auth required
router.get("/schedule/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  if (!token) {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  const [ritual] = await db
    .select()
    .from(ritualsTable)
    .where(eq(ritualsTable.scheduleToken, token));

  if (!ritual) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }

  const responses = await db
    .select()
    .from(scheduleResponsesTable)
    .where(eq(scheduleResponsesTable.ritualId, ritual.id));

  const participants = (ritual.participants as Array<{ name: string; email: string }>) ?? [];

  res.json({
    ritualId: ritual.id,
    ritualName: ritual.name,
    frequency: ritual.frequency,
    organizerName: participants[0]?.name ?? "your organizer",
    proposedTimes: (ritual.proposedTimes as string[]) ?? [],
    confirmedTime: ritual.confirmedTime,
    responses: responses.map((r) => ({
      guestName: r.guestName,
      chosenTime: r.chosenTime,
      unavailable: r.unavailable === 1,
    })),
  });
});

// POST /api/schedule/:token/respond — no auth required
const ISOTimestamp = z.string().refine((s) => !isNaN(Date.parse(s)), { message: "Must be a valid ISO timestamp" });
const RespondBody = z.object({
  guestName: z.string().min(1),
  guestEmail: z.string().optional(),
  chosenTime: ISOTimestamp.optional(),
  unavailable: z.boolean().optional(),
  suggestedTime: z.string().optional(),
});

router.post("/schedule/:token/respond", async (req, res): Promise<void> => {
  const { token } = req.params;
  if (!token) {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  const parsed = RespondBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [ritual] = await db
    .select()
    .from(ritualsTable)
    .where(eq(ritualsTable.scheduleToken, token));

  if (!ritual) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }

  // If unavailable but a suggestion was provided, store it in chosenTime prefixed
  const chosenTime = parsed.data.chosenTime
    ?? (parsed.data.unavailable && parsed.data.suggestedTime?.trim()
        ? `suggest: ${parsed.data.suggestedTime.trim()}`
        : null);

  await db.insert(scheduleResponsesTable).values({
    ritualId: ritual.id,
    guestName: parsed.data.guestName.trim(),
    guestEmail: parsed.data.guestEmail?.trim() ?? null,
    chosenTime,
    unavailable: parsed.data.unavailable ? 1 : 0,
  });

  res.status(201).json({ success: true });
});

router.get("/rituals/:id/schedule-responses", async (req, res): Promise<void> => {
  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) {
    res.status(400).json({ error: "Invalid ritual id" });
    return;
  }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  const responses = await db
    .select()
    .from(scheduleResponsesTable)
    .where(eq(scheduleResponsesTable.ritualId, ritualId));

  res.json({
    proposedTimes: (ritual.proposedTimes as string[]) ?? [],
    confirmedTime: ritual.confirmedTime,
    scheduleToken: ritual.scheduleToken,
    responses: responses.map((r) => ({
      id: r.id,
      guestName: r.guestName,
      guestEmail: r.guestEmail,
      chosenTime: r.chosenTime,
      unavailable: r.unavailable === 1,
      createdAt: r.createdAt,
    })),
  });
});

export default router;
