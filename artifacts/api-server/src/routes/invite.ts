import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, ritualsTable, inviteTokensTable, scheduleResponsesTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

// GET /api/invite/:token — no auth required
// Returns ritual info, proposed times, and invitee's pre-filled name/email
router.get("/invite/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  if (!token) { res.status(400).json({ error: "Token required" }); return; }

  const [invite] = await db.select().from(inviteTokensTable).where(eq(inviteTokensTable.token, token));
  if (!invite) { res.status(404).json({ error: "Invite not found" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, invite.ritualId));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }

  const [organizer] = await db.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, ritual.ownerId));

  const existingResponse = await db
    .select()
    .from(scheduleResponsesTable)
    .where(eq(scheduleResponsesTable.ritualId, ritual.id));
  const myResponse = existingResponse.find((r) => r.guestEmail === invite.email) ?? null;

  res.json({
    ritualId: ritual.id,
    ritualName: ritual.name,
    ritualIntention: ritual.intention,
    frequency: ritual.frequency,
    location: ritual.location,
    organizerName: organizer?.name ?? "your organizer",
    organizerEmail: organizer?.email,
    proposedTimes: (ritual.proposedTimes as string[]) ?? [],
    confirmedTime: ritual.confirmedTime,
    inviteeName: invite.name,
    inviteeEmail: invite.email,
    hasResponded: !!myResponse,
    previousResponse: myResponse
      ? {
          chosenTime: myResponse.chosenTime,
          unavailable: myResponse.unavailable === 1,
        }
      : null,
  });
});

// POST /api/invite/:token/respond — no auth required
const RespondBody = z.object({
  chosenTime: z.string().optional(),
  unavailable: z.boolean().optional(),
  comment: z.string().optional(),
});

router.post("/invite/:token/respond", async (req, res): Promise<void> => {
  const { token } = req.params;
  if (!token) { res.status(400).json({ error: "Token required" }); return; }

  const parsed = RespondBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [invite] = await db.select().from(inviteTokensTable).where(eq(inviteTokensTable.token, token));
  if (!invite) { res.status(404).json({ error: "Invite not found" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, invite.ritualId));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }

  await db.insert(scheduleResponsesTable).values({
    ritualId: ritual.id,
    guestName: invite.name ?? invite.email,
    guestEmail: invite.email,
    chosenTime: parsed.data.chosenTime ?? null,
    unavailable: parsed.data.unavailable ? 1 : 0,
  });

  await db
    .update(inviteTokensTable)
    .set({ respondedAt: new Date() })
    .where(eq(inviteTokensTable.token, token));

  res.status(201).json({ success: true });
});

export default router;
