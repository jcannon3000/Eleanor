import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  correspondencesTable,
  correspondenceMembersTable,
  lettersTable,
  letterDraftsTable,
  letterRemindersTable,
  usersTable,
} from "@workspace/db";
import {
  getPeriodStart,
  getPeriodEnd,
  getPeriodNumber,
  getNextPeriodStart,
  formatPeriodLabel,
  formatNextPeriodStart,
  formatHumanDate,
  formatPeriodStartDateString,
  isInLastThreeDays,
  getWhoseTurn,
  getCurrentPeriodInfo,
} from "../lib/letterPeriods";
import {
  sendInvitationEmail,
  sendNewLetterEmail,
  sendReminderEmail,
} from "../lib/letterEmails";
import { sendLetterCalendarEvent } from "../lib/letterCalendar";
import { getFrontendUrl } from "../lib/urls";

const router: IRouter = Router();

// ─── Auth ────────────────────────────────────────────────────────────────────

interface LetterAuth {
  userId: number | null;
  email: string;
  name: string;
}

async function resolveLetterAuth(req: Request): Promise<LetterAuth | null> {
  if (req.user) {
    const u = req.user as { id: number; email: string; name: string };
    return { userId: u.id, email: u.email, name: u.name };
  }
  const token = req.query.token as string | undefined;
  if (token) {
    const [member] = await db
      .select()
      .from(correspondenceMembersTable)
      .where(eq(correspondenceMembersTable.inviteToken, token))
      .limit(1);
    if (member && member.joinedAt) {
      return { userId: member.userId, email: member.email, name: member.name || "Anonymous" };
    }
  }
  return null;
}

function requireAuth(handler: (req: Request, res: Response, auth: LetterAuth) => Promise<void>) {
  return async (req: Request, res: Response): Promise<void> => {
    const auth = await resolveLetterAuth(req);
    if (!auth) { res.status(401).json({ error: "Not authenticated" }); return; }
    await handler(req, res, auth);
  };
}

function requireSessionAuth(handler: (req: Request, res: Response, auth: LetterAuth) => Promise<void>) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
    const u = req.user as { id: number; email: string; name: string };
    await handler(req, res, { userId: u.id, email: u.email, name: u.name });
  };
}

// ─── Membership helper ────────────────────────────────────────────────────────

async function getMembership(correspondenceId: number, auth: LetterAuth) {
  const members = await db
    .select()
    .from(correspondenceMembersTable)
    .where(eq(correspondenceMembersTable.correspondenceId, correspondenceId));
  const member = members.find(
    (m) => (auth.userId && m.userId === auth.userId) || m.email === auth.email,
  );
  return { member, members };
}

// ─── Turn logic ───────────────────────────────────────────────────────────────

/**
 * For one_to_one: returns true if it is this user's turn.
 * Creator = the user whose userId === correspondence.createdByUserId.
 * Odd periods = creator's turn. Even = other member's turn.
 */
function isUsersTurn(
  correspondence: { createdByUserId: number | null; startedAt: Date },
  auth: LetterAuth,
  members: Array<{ userId: number | null; email: string }>,
  now: Date,
): boolean {
  const whoseTurn = getWhoseTurn(correspondence.startedAt, now);
  const isCreator =
    (auth.userId && auth.userId === correspondence.createdByUserId) ||
    (!auth.userId && members[0]?.email === auth.email);
  if (whoseTurn === "creator") return !!isCreator;
  return !isCreator;
}

// ─── POST /api/phoebe/correspondences ────────────────────────────────────────

router.post(
  "/phoebe/correspondences",
  requireSessionAuth(async (req, res, auth) => {
    const { type, name, members } = req.body as {
      type: "one_to_one" | "group";
      name: string;
      members: Array<{ email: string; name?: string }>;
    };

    if (!name || name.length > 60) {
      res.status(400).json({ error: "Name is required (max 60 chars)" }); return;
    }
    if (!["one_to_one", "group"].includes(type)) {
      res.status(400).json({ error: "Invalid type" }); return;
    }
    if (type === "one_to_one" && members.length !== 1) {
      res.status(400).json({ error: "one_to_one requires exactly 1 member" }); return;
    }
    if (type === "group" && (members.length < 2 || members.length > 14)) {
      res.status(400).json({ error: "group requires 2–14 members (plus creator)" }); return;
    }

    const emailSet = new Set(members.map((m) => m.email.toLowerCase()));
    if (emailSet.size !== members.length) {
      res.status(400).json({ error: "Duplicate emails" }); return;
    }

    const [correspondence] = await db
      .insert(correspondencesTable)
      .values({ name, createdByUserId: auth.userId, groupType: type })
      .returning();

    const creatorToken = randomUUID();
    await db.insert(correspondenceMembersTable).values({
      correspondenceId: correspondence.id,
      userId: auth.userId,
      email: auth.email,
      name: auth.name,
      inviteToken: creatorToken,
      joinedAt: new Date(),
    });

    const frontendUrl = getFrontendUrl();
    for (const m of members) {
      const inviteToken = randomUUID();
      await db.insert(correspondenceMembersTable).values({
        correspondenceId: correspondence.id,
        userId: null,
        email: m.email.toLowerCase(),
        name: m.name || null,
        inviteToken,
      });
      sendInvitationEmail({
        to: m.email,
        creatorName: auth.name,
        correspondenceName: name,
        inviteUrl: `${frontendUrl}/letters/invite/${inviteToken}`,
        type,
      }).catch((err) => console.error("Invitation email failed:", err));
    }

    const allMembers = await db
      .select()
      .from(correspondenceMembersTable)
      .where(eq(correspondenceMembersTable.correspondenceId, correspondence.id));

    res.json({ ...correspondence, members: allMembers });
  }),
);

// ─── GET /api/phoebe/correspondences ─────────────────────────────────────────

router.get(
  "/phoebe/correspondences",
  requireSessionAuth(async (req, res, auth) => {
    const memberRows = await db
      .select()
      .from(correspondenceMembersTable)
      .where(
        and(
          auth.userId
            ? eq(correspondenceMembersTable.userId, auth.userId)
            : eq(correspondenceMembersTable.email, auth.email),
          sql`archived_at IS NULL`,
        ),
      );

    const results = [];
    const now = new Date();

    for (const mRow of memberRows) {
      const [correspondence] = await db
        .select()
        .from(correspondencesTable)
        .where(and(eq(correspondencesTable.id, mRow.correspondenceId), eq(correspondencesTable.isActive, true)));
      if (!correspondence) continue;

      const members = await db
        .select()
        .from(correspondenceMembersTable)
        .where(eq(correspondenceMembersTable.correspondenceId, correspondence.id));

      const letters = await db
        .select()
        .from(lettersTable)
        .where(eq(lettersTable.correspondenceId, correspondence.id));

      const type = (correspondence.groupType === "one_to_one" ? "one_to_one" : "group") as "one_to_one" | "group";
      const periodInfo = getCurrentPeriodInfo(correspondence.startedAt, now, type);

      const identifier = auth.userId ?? auth.email;
      const unreadCount = letters.filter((l) => {
        const readers = (l.readBy as Array<string | number>) || [];
        return !readers.includes(identifier as string | number) && l.authorEmail !== auth.email;
      }).length;

      const hasWrittenThisPeriod = letters.some(
        (l) => l.periodStartDate === periodInfo.periodStartStr && l.authorEmail === auth.email,
      );

      const membersWritten = members.map((m) => ({
        name: m.name || m.email,
        email: m.email,
        hasWritten: letters.some((l) => l.periodStartDate === periodInfo.periodStartStr && l.authorEmail === m.email),
      }));

      const myTurn = type === "one_to_one"
        ? isUsersTurn(correspondence, auth, members, now) && !hasWrittenThisPeriod
        : !hasWrittenThisPeriod;

      const recentLetters = [...letters]
        .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
        .slice(0, 3);

      results.push({
        ...correspondence,
        members: members.map((m) => ({
          name: m.name,
          email: m.email,
          joinedAt: m.joinedAt,
          lastLetterAt: m.lastLetterAt,
          homeCity: m.homeCity,
        })),
        letterCount: letters.length,
        unreadCount,
        myTurn,
        recentPostmarks: recentLetters
          .filter((l) => l.postmarkCity)
          .map((l) => ({ authorName: l.authorName, city: l.postmarkCity, sentAt: l.sentAt })),
        currentPeriod: {
          ...periodInfo,
          periodStart: periodInfo.periodStart.toISOString(),
          periodEnd: periodInfo.periodEnd.toISOString(),
          hasWrittenThisPeriod,
          membersWritten,
        },
      });
    }

    // Sort: my turn first
    results.sort((a, b) => (b.myTurn ? 1 : 0) - (a.myTurn ? 1 : 0));
    res.json(results);
  }),
);

// ─── GET /api/phoebe/correspondences/:id ─────────────────────────────────────

router.get(
  "/phoebe/correspondences/:id",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(req.params.id, 10);
    const [correspondence] = await db
      .select()
      .from(correspondencesTable)
      .where(eq(correspondencesTable.id, correspondenceId));
    if (!correspondence) { res.status(404).json({ error: "Not found" }); return; }

    const { member, members } = await getMembership(correspondenceId, auth);
    if (!member) { res.status(403).json({ error: "Not a member" }); return; }

    const letters = await db
      .select()
      .from(lettersTable)
      .where(eq(lettersTable.correspondenceId, correspondenceId))
      .orderBy(desc(lettersTable.sentAt));

    const now = new Date();
    const type = (correspondence.groupType === "one_to_one" ? "one_to_one" : "group") as "one_to_one" | "group";
    const periodInfo = getCurrentPeriodInfo(correspondence.startedAt, now, type);

    const hasWrittenThisPeriod = letters.some(
      (l) => l.periodStartDate === periodInfo.periodStartStr && l.authorEmail === auth.email,
    );

    const membersWritten = members.map((m) => ({
      name: m.name || m.email,
      email: m.email,
      hasWritten: letters.some((l) => l.periodStartDate === periodInfo.periodStartStr && l.authorEmail === m.email),
    }));

    const myTurn = type === "one_to_one"
      ? isUsersTurn(correspondence, auth, members, now) && !hasWrittenThisPeriod
      : !hasWrittenThisPeriod;

    res.json({
      ...correspondence,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        joinedAt: m.joinedAt,
        lastLetterAt: m.lastLetterAt,
        homeCity: m.homeCity,
      })),
      letters,
      myTurn,
      currentPeriod: {
        ...periodInfo,
        periodStart: periodInfo.periodStart.toISOString(),
        periodEnd: periodInfo.periodEnd.toISOString(),
        hasWrittenThisPeriod,
        membersWritten,
      },
    });
  }),
);

// ─── GET /api/phoebe/correspondences/:id/letters ─────────────────────────────

router.get(
  "/phoebe/correspondences/:id/letters",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(req.params.id, 10);
    const { member } = await getMembership(correspondenceId, auth);
    if (!member) { res.status(403).json({ error: "Not a member" }); return; }

    const letters = await db
      .select()
      .from(lettersTable)
      .where(eq(lettersTable.correspondenceId, correspondenceId))
      .orderBy(desc(lettersTable.sentAt));

    const identifier = auth.userId ?? auth.email;
    for (const letter of letters) {
      const readers = (letter.readBy as Array<string | number>) || [];
      if (!readers.includes(identifier as string | number) && letter.authorEmail !== auth.email) {
        await db
          .update(lettersTable)
          .set({ readBy: [...readers, identifier] })
          .where(eq(lettersTable.id, letter.id));
      }
    }

    res.json(letters);
  }),
);

// ─── POST /api/phoebe/correspondences/:id/letters ────────────────────────────

router.post(
  "/phoebe/correspondences/:id/letters",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(req.params.id, 10);

    const [correspondence] = await db
      .select()
      .from(correspondencesTable)
      .where(eq(correspondencesTable.id, correspondenceId));
    if (!correspondence) { res.status(404).json({ error: "Not found" }); return; }

    const { member, members } = await getMembership(correspondenceId, auth);
    if (!member || !member.joinedAt) { res.status(403).json({ error: "Not a joined member" }); return; }

    const { content, postmarkCity } = req.body as { content: string; postmarkCity?: string };
    const type = (correspondence.groupType === "one_to_one" ? "one_to_one" : "group") as "one_to_one" | "group";
    const wordCount = content?.trim().split(/\s+/).length ?? 0;
    const minWords = type === "one_to_one" ? 100 : 50;
    const maxWords = type === "one_to_one" ? 5000 : 1000;

    if (!content?.trim()) {
      res.status(400).json({ error: "Content is required" }); return;
    }
    if (wordCount < minWords) {
      res.status(400).json({ error: `Minimum ${minWords} words`, wordCount }); return;
    }
    if (wordCount > maxWords) {
      res.status(400).json({ error: `Maximum ${maxWords} words`, wordCount }); return;
    }
    if (type === "one_to_one" && (!postmarkCity || !postmarkCity.trim())) {
      res.status(400).json({ error: "Postmark city is required — where are you writing from?" }); return;
    }

    const now = new Date();
    const periodInfo = getCurrentPeriodInfo(correspondence.startedAt, now, type);

    // Alternating turn check for one_to_one
    if (type === "one_to_one") {
      const myTurn = isUsersTurn(correspondence, auth, members, now);
      if (!myTurn) {
        const other = members.find((m) => m.email !== auth.email);
        res.status(403).json({
          error: "not_your_turn",
          message: `It's ${other?.name || "your correspondent"}'s turn to write this week.`,
          nextPeriodStart: formatNextPeriodStart(correspondence.startedAt),
        });
        return;
      }
    }

    // One letter per period check
    const existing = await db
      .select()
      .from(lettersTable)
      .where(
        and(
          eq(lettersTable.correspondenceId, correspondenceId),
          eq(lettersTable.authorEmail, auth.email),
          eq(lettersTable.periodStartDate, periodInfo.periodStartStr),
        ),
      );

    if (existing.length > 0) {
      res.status(429).json({
        error: "already_written",
        message: "You've already written this period.",
        nextPeriodStart: formatNextPeriodStart(correspondence.startedAt),
      });
      return;
    }

    const authorLetters = await db
      .select()
      .from(lettersTable)
      .where(and(eq(lettersTable.correspondenceId, correspondenceId), eq(lettersTable.authorEmail, auth.email)));

    const letterNumber = authorLetters.length + 1;
    const city = postmarkCity?.trim().slice(0, 100) || null;

    const [letter] = await db
      .insert(lettersTable)
      .values({
        correspondenceId,
        authorUserId: auth.userId,
        authorEmail: auth.email,
        authorName: auth.name,
        content: content.trim(),
        letterNumber,
        periodNumber: periodInfo.periodNumber,
        periodStartDate: periodInfo.periodStartStr,
        postmarkCity: city,
      })
      .returning();

    await db
      .update(correspondenceMembersTable)
      .set({ lastLetterAt: now, ...(city ? { homeCity: city } : {}) })
      .where(eq(correspondenceMembersTable.id, member.id));

    await db
      .delete(letterDraftsTable)
      .where(
        and(
          eq(letterDraftsTable.correspondenceId, correspondenceId),
          eq(letterDraftsTable.authorEmail, auth.email),
          eq(letterDraftsTable.periodStartDate, periodInfo.periodStartStr),
        ),
      );

    // Notify recipients (fire-and-forget)
    const frontendUrl = getFrontendUrl();
    for (const m of members) {
      if (m.email === auth.email || !m.joinedAt) continue;

      const letterUrl = m.userId
        ? `${frontendUrl}/letters/${correspondenceId}`
        : `${frontendUrl}/letters/${correspondenceId}?token=${m.inviteToken}`;

      if (type === "one_to_one" && city) {
        sendLetterCalendarEvent({
          recipientEmail: m.email,
          recipientName: m.name || m.email.split("@")[0],
          authorName: auth.name,
          correspondenceName: correspondence.name,
          postmarkCity: city,
          letterDate: now,
          letterUrl,
          correspondenceId,
        }).catch((err) => console.error("Letter calendar event failed:", err));
      }

      sendNewLetterEmail({
        to: m.email,
        authorName: auth.name,
        correspondenceName: correspondence.name,
        correspondenceUrl: letterUrl,
        postmarkCity: city || undefined,
        letterDate: now,
        type,
      }).catch((err) => console.error("Letter email failed:", err));
    }

    res.json(letter);
  }),
);

// ─── DRAFTS ───────────────────────────────────────────────────────────────────

router.put(
  "/phoebe/correspondences/:id/draft",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(req.params.id, 10);
    const { member } = await getMembership(correspondenceId, auth);
    if (!member) { res.status(403).json({ error: "Not a member" }); return; }

    const [correspondence] = await db
      .select()
      .from(correspondencesTable)
      .where(eq(correspondencesTable.id, correspondenceId));
    if (!correspondence) { res.status(404).json({ error: "Not found" }); return; }

    const { content } = req.body as { content: string };
    const now = new Date();
    const type = (correspondence.groupType === "one_to_one" ? "one_to_one" : "group") as "one_to_one" | "group";
    const periodInfo = getCurrentPeriodInfo(correspondence.startedAt, now, type);

    await db
      .insert(letterDraftsTable)
      .values({
        correspondenceId,
        authorUserId: auth.userId,
        authorEmail: auth.email,
        content: content || "",
        periodStartDate: periodInfo.periodStartStr,
      })
      .onConflictDoUpdate({
        target: [letterDraftsTable.correspondenceId, letterDraftsTable.authorEmail, letterDraftsTable.periodStartDate],
        set: { content: content || "", lastSavedAt: now },
      });

    res.json({ saved: true, savedAt: now.toISOString() });
  }),
);

router.get(
  "/phoebe/correspondences/:id/draft",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(req.params.id, 10);
    const { member } = await getMembership(correspondenceId, auth);
    if (!member) { res.status(403).json({ error: "Not a member" }); return; }

    const [correspondence] = await db
      .select()
      .from(correspondencesTable)
      .where(eq(correspondencesTable.id, correspondenceId));
    if (!correspondence) { res.status(404).json({ error: "Not found" }); return; }

    const now = new Date();
    const type = (correspondence.groupType === "one_to_one" ? "one_to_one" : "group") as "one_to_one" | "group";
    const periodInfo = getCurrentPeriodInfo(correspondence.startedAt, now, type);

    const [draft] = await db
      .select()
      .from(letterDraftsTable)
      .where(
        and(
          eq(letterDraftsTable.correspondenceId, correspondenceId),
          eq(letterDraftsTable.authorEmail, auth.email),
          eq(letterDraftsTable.periodStartDate, periodInfo.periodStartStr),
        ),
      );

    res.json(draft || null);
  }),
);

// ─── ARCHIVE ──────────────────────────────────────────────────────────────────

router.post(
  "/phoebe/correspondences/:id/archive",
  requireSessionAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(req.params.id, 10);
    await db
      .update(correspondenceMembersTable)
      .set({ archivedAt: new Date() } as any)
      .where(
        and(
          eq(correspondenceMembersTable.correspondenceId, correspondenceId),
          auth.userId
            ? eq(correspondenceMembersTable.userId, auth.userId)
            : eq(correspondenceMembersTable.email, auth.email),
        ),
      );
    res.json({ ok: true });
  }),
);

// ─── INVITATIONS ──────────────────────────────────────────────────────────────

router.get("/phoebe/invite/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [member] = await db
    .select()
    .from(correspondenceMembersTable)
    .where(eq(correspondenceMembersTable.inviteToken, token));
  if (!member) { res.status(404).json({ error: "Invalid invitation" }); return; }

  const [correspondence] = await db
    .select()
    .from(correspondencesTable)
    .where(eq(correspondencesTable.id, member.correspondenceId));
  if (!correspondence) { res.status(404).json({ error: "Correspondence not found" }); return; }

  const members = await db
    .select()
    .from(correspondenceMembersTable)
    .where(eq(correspondenceMembersTable.correspondenceId, correspondence.id));

  const creator = members.find((m) => m.userId === correspondence.createdByUserId);
  const letterCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(lettersTable)
    .where(eq(lettersTable.correspondenceId, correspondence.id));

  res.json({
    correspondenceName: correspondence.name,
    creatorName: creator?.name || "Someone",
    type: correspondence.groupType,
    memberCount: members.length,
    letterCount: letterCount[0]?.count || 0,
    alreadyJoined: !!member.joinedAt,
    memberEmail: member.email,
  });
});

router.post("/phoebe/invite/:token/accept", async (req, res): Promise<void> => {
  const { token } = req.params;
  const { name, email } = req.body as { name: string; email: string };

  if (!name || !email) {
    res.status(400).json({ error: "Name and email are required" }); return;
  }

  const [member] = await db
    .select()
    .from(correspondenceMembersTable)
    .where(eq(correspondenceMembersTable.inviteToken, token));
  if (!member) { res.status(404).json({ error: "Invalid invitation" }); return; }

  if (member.joinedAt) {
    res.json({ correspondenceId: member.correspondenceId, token }); return;
  }

  const [existingUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));

  await db
    .update(correspondenceMembersTable)
    .set({
      joinedAt: new Date(),
      name,
      email: email.toLowerCase(),
      userId: existingUser?.id || null,
    })
    .where(eq(correspondenceMembersTable.id, member.id));

  res.json({ correspondenceId: member.correspondenceId, token });
});

// ─── REMINDER CRON (Thursday 9am) ────────────────────────────────────────────

router.post("/phoebe/send-reminders", async (req, res): Promise<void> => {
  const internalKey = req.headers["x-internal-key"];
  if (internalKey !== process.env["INTERNAL_API_KEY"]) {
    res.status(401).json({ error: "Unauthorized" }); return;
  }

  const correspondences = await db
    .select()
    .from(correspondencesTable)
    .where(eq(correspondencesTable.isActive, true));

  const now = new Date();
  const frontendUrl = getFrontendUrl();
  let remindersSent = 0;

  for (const c of correspondences) {
    const type = (c.groupType === "one_to_one" ? "one_to_one" : "group") as "one_to_one" | "group";
    const periodInfo = getCurrentPeriodInfo(c.startedAt, now, type);

    const members = await db
      .select()
      .from(correspondenceMembersTable)
      .where(eq(correspondenceMembersTable.correspondenceId, c.id));

    const letters = await db
      .select()
      .from(lettersTable)
      .where(and(eq(lettersTable.correspondenceId, c.id), eq(lettersTable.periodStartDate, periodInfo.periodStartStr)));

    const writtenEmails = new Set(letters.map((l) => l.authorEmail));

    for (const m of members) {
      if (!m.joinedAt) continue;
      if (writtenEmails.has(m.email)) continue;

      // For one_to_one: only remind if it's this member's turn
      if (type === "one_to_one") {
        const fakeAuth = { userId: m.userId, email: m.email, name: m.name || "" };
        const myTurn = isUsersTurn(c, fakeAuth, members, now);
        if (!myTurn) continue;
      }

      const [existing] = await db
        .select()
        .from(letterRemindersTable)
        .where(
          and(
            eq(letterRemindersTable.correspondenceId, c.id),
            eq(letterRemindersTable.memberEmail, m.email),
            eq(letterRemindersTable.periodStartDate, periodInfo.periodStartStr),
          ),
        );
      if (existing) continue;

      const writeUrl = m.userId
        ? `${frontendUrl}/letters/${c.id}/write`
        : `${frontendUrl}/letters/${c.id}/write?token=${m.inviteToken}`;

      // For one_to_one: find the other person's name
      const otherMember = type === "one_to_one"
        ? members.find((om) => om.email !== m.email)
        : undefined;

      await sendReminderEmail({
        to: m.email,
        correspondenceName: c.name,
        writeUrl,
        periodEnd: formatHumanDate(periodInfo.periodEnd),
        otherPersonName: otherMember?.name || undefined,
        type,
      });

      await db.insert(letterRemindersTable).values({
        correspondenceId: c.id,
        memberEmail: m.email,
        periodStartDate: periodInfo.periodStartStr,
      });

      remindersSent++;
    }
  }

  res.json({ remindersSent });
});

export default router;
