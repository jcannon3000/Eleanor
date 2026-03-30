import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db, ritualsTable, inviteTokensTable, scheduleResponsesTable, meetupsTable, usersTable,
} from "@workspace/db";
import { updateCalendarEvent } from "../lib/calendar";

const router: IRouter = Router();

// GET /api/invite/:token — no auth required
router.get("/invite/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  if (!token) { res.status(400).json({ error: "Token required" }); return; }

  const [invite] = await db.select().from(inviteTokensTable).where(eq(inviteTokensTable.token, token));
  if (!invite) { res.status(404).json({ error: "Invite not found" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, invite.ritualId));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }

  const [organizer] = await db
    .select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, ritual.ownerId));

  const allResponses = await db.select().from(scheduleResponsesTable)
    .where(eq(scheduleResponsesTable.ritualId, ritual.id));
  const myResponse = allResponses.find((r) => r.guestEmail === invite.email) ?? null;

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
      ? { chosenTime: myResponse.chosenTime, unavailable: myResponse.unavailable === 1 }
      : null,
  });
});

// POST /api/invite/:token/respond — no auth required
const RespondBody = z.object({
  chosenTime: z.string().optional(),
  unavailable: z.boolean().optional(),
  comment: z.string().optional(),
  isUpdate: z.boolean().optional(),
});

router.post("/invite/:token/respond", async (req, res): Promise<void> => {
  const { token } = req.params;
  if (!token) { res.status(400).json({ error: "Token required" }); return; }

  const parsed = RespondBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  try {
    const [invite] = await db.select().from(inviteTokensTable).where(eq(inviteTokensTable.token, token));
    if (!invite) { res.status(404).json({ error: "Invite not found" }); return; }

    const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, invite.ritualId));
    if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }

    const chosenTime = parsed.data.chosenTime ?? null;
    const isUnavailable = parsed.data.unavailable ? 1 : 0;
    const isUpdate = parsed.data.isUpdate ?? false;

    // Upsert: update existing row if present, otherwise insert
    const existing = await db.select().from(scheduleResponsesTable)
      .where(eq(scheduleResponsesTable.ritualId, ritual.id));
    const myExisting = existing.find((r) => r.guestEmail != null && r.guestEmail === invite.email);

    if (myExisting) {
      await db.update(scheduleResponsesTable)
        .set({ chosenTime, unavailable: isUnavailable })
        .where(eq(scheduleResponsesTable.id, myExisting.id));
    } else {
      await db.insert(scheduleResponsesTable).values({
        ritualId: ritual.id,
        guestName: invite.name ?? invite.email,
        guestEmail: invite.email,
        chosenTime,
        unavailable: isUnavailable,
      });
    }

    await db.update(inviteTokensTable)
      .set({ respondedAt: new Date() })
      .where(eq(inviteTokensTable.token, token));

    // Update organizer's Google Calendar event — async, non-blocking
    updateCalendarEventWithResponses({
      ritual,
      organizerUserId: ritual.ownerId,
      newResponse: {
        name: invite.name ?? invite.email,
        email: invite.email,
        chosenTime,
        unavailable: isUnavailable === 1,
        isUpdate,
      },
    }).catch((err) => console.warn("GCal update failed (non-fatal):", err?.message ?? err));

    res.status(201).json({ success: true });
  } catch (err) {
    console.error("POST /invite/:token/respond error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Helper: rebuild GCal event description with all responses ───────────
async function updateCalendarEventWithResponses(opts: {
  ritual: typeof ritualsTable.$inferSelect;
  organizerUserId: number;
  newResponse: {
    name: string;
    email: string;
    chosenTime: string | null;
    unavailable: boolean;
    isUpdate: boolean;
  };
}) {
  const { ritual, organizerUserId, newResponse } = opts;

  // Find the planned meetup with a GCal event ID
  const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritual.id));
  const planned = meetups.find((m) => m.status === "planned" && m.googleCalendarEventId);
  if (!planned?.googleCalendarEventId) return;

  // Fetch all responses (already updated in DB)
  const allResponses = await db.select().from(scheduleResponsesTable)
    .where(eq(scheduleResponsesTable.ritualId, ritual.id));

  const proposedTimes = (ritual.proposedTimes as string[]) ?? [];

  function fmtTime(iso: string) {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) +
      " at " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    );
  }

  const lines: string[] = [];
  if (ritual.name) lines.push(`📍 ${ritual.name}`);
  if (ritual.intention) lines.push(ritual.intention);
  lines.push("");

  if (proposedTimes.length > 0) {
    lines.push("📅 Proposed times:");
    proposedTimes.forEach((t, i) => {
      const label = i === 0 ? "First pick" : i === 1 ? "Alternative" : "Backup";
      lines.push(`  ${label}: ${fmtTime(t)}`);
    });
    lines.push("");
  }

  lines.push("✅ Availability responses:");
  if (allResponses.length === 0) {
    lines.push("  No responses yet.");
  } else {
    for (const r of allResponses) {
      if (r.unavailable) {
        lines.push(`  ${r.guestName}: Unavailable`);
      } else if (r.chosenTime) {
        lines.push(`  ${r.guestName}: ${fmtTime(r.chosenTime)}`);
      }
    }
  }
  lines.push("");

  // Highlight the change
  if (newResponse.unavailable) {
    lines.push(
      newResponse.isUpdate
        ? `🔄 Update: ${newResponse.name} changed to unavailable`
        : `📌 New: ${newResponse.name} marked unavailable`
    );
  } else if (newResponse.chosenTime) {
    lines.push(
      newResponse.isUpdate
        ? `🔄 Update: ${newResponse.name} changed their preference → ${fmtTime(newResponse.chosenTime)}`
        : `📌 New: ${newResponse.name} picked ${fmtTime(newResponse.chosenTime)}`
    );
  }
  lines.push("", "Coordinated by Eleanor · eleanor.app");

  const description = lines.join("\n");

  // Update the event title to reflect the latest selected time if available
  const latestTime = newResponse.chosenTime && !newResponse.unavailable
    ? new Date(newResponse.chosenTime)
    : planned.scheduledDate;

  const summary = newResponse.chosenTime && !newResponse.unavailable
    ? `${ritual.name} — ${new Date(newResponse.chosenTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : ritual.name;

  await updateCalendarEvent(organizerUserId, planned.googleCalendarEventId, {
    summary,
    description,
    startDate: latestTime,
  });
}

export default router;
