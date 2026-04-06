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

    res.status(201).json({ success: true });

    // Async work: update GCal description + check for consensus auto-confirm
    const allAfter = await db.select().from(scheduleResponsesTable)
      .where(eq(scheduleResponsesTable.ritualId, ritual.id));

    const newResponse = {
      name: invite.name ?? invite.email,
      email: invite.email,
      chosenTime,
      unavailable: isUnavailable === 1,
      isUpdate,
    };

    // Check for consensus (2+ people picked the same proposed time)
    checkAndAutoConfirm({ ritual, organizerUserId: ritual.ownerId, allResponses: allAfter })
      .catch((err) => console.warn("Auto-confirm check failed:", err?.message ?? err));

    // Update GCal description with all responses
    updateCalendarEventDescription({ ritual, organizerUserId: ritual.ownerId, newResponse, allResponses: allAfter })
      .catch((err) => console.warn("GCal description update failed:", err?.message ?? err));

  } catch (err) {
    console.error("POST /invite/:token/respond error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Auto-confirm when 2+ people agree on the same proposed time ────────────
async function checkAndAutoConfirm(opts: {
  ritual: typeof ritualsTable.$inferSelect;
  organizerUserId: number;
  allResponses: (typeof scheduleResponsesTable.$inferSelect)[];
}) {
  const { ritual, organizerUserId, allResponses } = opts;
  const proposedTimes = (ritual.proposedTimes as string[]) ?? [];
  if (proposedTimes.length === 0) return;

  // Already confirmed by organizer — don't override
  if (ritual.confirmedTime) return;

  // Tally votes per proposed time slot (fuzzy match within 2 minutes)
  const votes: Record<string, string[]> = {};
  for (const r of allResponses) {
    if (!r.chosenTime || r.unavailable) continue;
    const chosenMs = new Date(r.chosenTime).getTime();
    for (const pt of proposedTimes) {
      if (Math.abs(chosenMs - new Date(pt).getTime()) < 2 * 60_000) {
        votes[pt] = votes[pt] ?? [];
        votes[pt].push(r.guestName);
        break;
      }
    }
  }

  // Find the first proposed time with 2+ votes
  const consensus = proposedTimes.find((pt) => (votes[pt]?.length ?? 0) >= 2);
  if (!consensus) return;

  const confirmedDate = new Date(consensus);
  const voterNames = votes[consensus];

  console.log(`[auto-confirm] Ritual ${ritual.id} confirmed at ${consensus} by ${voterNames.join(", ")}`);

  // Update ritual.confirmedTime
  await db.update(ritualsTable)
    .set({ confirmedTime: consensus })
    .where(eq(ritualsTable.id, ritual.id));

  // Update the planned meetup's scheduledDate and GCal event
  const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritual.id));
  const planned = meetups.find((m) => m.status === "planned");
  if (!planned) return;

  await db.update(meetupsTable)
    .set({ scheduledDate: confirmedDate })
    .where(eq(meetupsTable.id, planned.id));

  if (!planned.googleCalendarEventId) return;

  const description = buildConfirmedDescription(ritual, consensus, voterNames);
  await updateCalendarEvent(organizerUserId, planned.googleCalendarEventId, {
    summary: `${ritual.name} — Confirmed`,
    description,
    startDate: confirmedDate,
  });
}

// ─── Update GCal description with all current responses ────────────────────
async function updateCalendarEventDescription(opts: {
  ritual: typeof ritualsTable.$inferSelect;
  organizerUserId: number;
  newResponse: { name: string; email: string; chosenTime: string | null; unavailable: boolean; isUpdate: boolean };
  allResponses: (typeof scheduleResponsesTable.$inferSelect)[];
}) {
  const { ritual, organizerUserId, newResponse, allResponses } = opts;

  const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritual.id));
  const planned = meetups.find((m) => m.status === "planned" && m.googleCalendarEventId);
  if (!planned?.googleCalendarEventId) return;

  // If already confirmed, don't overwrite with a "responses" description
  if (ritual.confirmedTime) return;

  const proposedTimes = (ritual.proposedTimes as string[]) ?? [];

  const lines: string[] = [];
  if (ritual.name) lines.push(`📍 ${ritual.name}`);
  if (ritual.intention) lines.push(ritual.intention);
  lines.push("");

  if (proposedTimes.length > 0) {
    lines.push("📅 Proposed times:");
    proposedTimes.forEach((t, i) => {
      const label = i === 0 ? "Option 1" : i === 1 ? "Option 2" : "Option 3";
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

  if (newResponse.unavailable) {
    lines.push(
      newResponse.isUpdate
        ? `🔄 Update: ${newResponse.name} changed to unavailable`
        : `📌 New: ${newResponse.name} marked unavailable`
    );
  } else if (newResponse.chosenTime) {
    lines.push(
      newResponse.isUpdate
        ? `🔄 Update: ${newResponse.name} changed preference → ${fmtTime(newResponse.chosenTime)}`
        : `📌 New: ${newResponse.name} is available ${fmtTime(newResponse.chosenTime)}`
    );
  }
  lines.push("", "Coordinated by Phoebe · phoebe.app");

  await updateCalendarEvent(organizerUserId, planned.googleCalendarEventId, {
    description: lines.join("\n"),
    startDate: planned.scheduledDate,
  });
}

// ─── Build confirmed event description ──────────────────────────────────────
function buildConfirmedDescription(
  ritual: typeof ritualsTable.$inferSelect,
  confirmedTime: string,
  voterNames: string[]
): string {
  const lines: string[] = [];
  if (ritual.name) lines.push(`📍 ${ritual.name}`);
  if (ritual.intention) lines.push(ritual.intention);
  lines.push("");
  lines.push(`✅ CONFIRMED: ${fmtTime(confirmedTime)}`);
  lines.push("");
  lines.push(`Agreed by: ${voterNames.join(", ")}`);
  lines.push("");
  if (ritual.location) lines.push(`📍 ${ritual.location}`);
  lines.push("", "Coordinated by Phoebe · phoebe.app");
  return lines.join("\n");
}

// ─── Format ISO time for display ────────────────────────────────────────────
function fmtTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) +
    " at " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

export default router;
