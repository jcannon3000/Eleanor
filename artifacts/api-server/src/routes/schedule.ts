import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, ritualsTable, schedulingResponsesTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

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
    .where(eq(ritualsTable.schedulingToken, token));

  if (!ritual) {
    res.status(404).json({ error: "Scheduling link not found" });
    return;
  }

  const [owner] = await db
    .select({ firstName: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, ritual.ownerId));

  const organizerFirstName = owner?.firstName?.split(" ")[0] ?? "Your organizer";

  res.json({
    ritualName: ritual.name,
    organizerFirstName,
    cadence: ritual.frequency,
    proposedTimes: (ritual.proposedTimes as string[]) ?? [],
  });
});

// POST /api/schedule/:token/respond — no auth required
const ISOTimestamp = z.string().refine((s) => !isNaN(Date.parse(s)), { message: "Must be a valid ISO timestamp" });
const RespondBody = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    choice: z.enum(["accepted", "alternate", "unavailable"]),
    chosenTime: ISOTimestamp.optional(),
  })
  .refine(
    (data) => data.choice !== "alternate" || (data.chosenTime !== undefined && data.chosenTime !== ""),
    { message: "chosenTime is required when choice is 'alternate'" }
  );

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
    .where(eq(ritualsTable.schedulingToken, token));

  if (!ritual) {
    res.status(404).json({ error: "Scheduling link not found" });
    return;
  }

  const chosenTime =
    parsed.data.choice === "alternate" && parsed.data.chosenTime
      ? new Date(parsed.data.chosenTime)
      : null;

  await db.insert(schedulingResponsesTable).values({
    ritualId: ritual.id,
    name: parsed.data.name,
    email: parsed.data.email,
    choice: parsed.data.choice,
    chosenTime,
  });

  res.status(201).json({ success: true });
});

export default router;
