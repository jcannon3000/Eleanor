import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  correspondencesTable,
  correspondenceMembersTable,
  lettersTable,
  letterDraftsTable,
  letterRemindersTable,
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
} from "../lib/letterPeriods";
import { sendInvitationEmail, sendNewLetterEmail, sendReminderEmail } from "../lib/letterEmails";
import { getFrontendUrl } from "../lib/urls";

const router: IRouter = Router();

// ─── Auth middleware ────────────────────────────────────────────────────────

interface LetterAuth {
  userId: number | null;
  email: string;
  name: string;
}

async function resolveLetterAuth(req: Request): Promise<LetterAuth | null> {
  // Session auth first
  if (req.user) {
    const u = req.user as { id: number; email: string; name: string };
    return { userId: u.id, email: u.email, name: u.name };
  }

  // Token-based auth
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
    if (!auth) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    await handler(req, res, auth);
  };
}

function requireSessionAuth(handler: (req: Request, res: Response, auth: LetterAuth) => Promise<void>) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const u = req.user as { id: number; email: string; name: string };
    await handler(req, res, { userId: u.id, email: u.email, name: u.name });
  };
}

// ─── Helper: check membership ───────────────────────────────────────────────

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

// ─── CORRESPONDENCES ────────────────────────────────────────────────────────

router.post(
  "/letters/correspondences",
  requireSessionAuth(async (req, res, auth) => {
    const { name, groupType, members } = req.body as {
      name: string;
      groupType: "one_to_one" | "small_group";
      members: Array<{ email: string; name?: string }>;
    };

    // Validation
    if (!name || name.length > 60) {
      res.status(400).json({ error: "Name is required (max 60 chars)" });
      return;
    }
    if (!["one_to_one", "small_group"].includes(groupType)) {
      res.status(400).json({ error: "Invalid group type" });
      return;
    }
    if (groupType === "one_to_one" && members.length !== 1) {
      res.status(400).json({ error: "One-to-one requires exactly 1 member" });
      return;
    }
    if (groupType === "small_group" && (members.length < 2 || members.length > 4)) {
      res.status(400).json({ error: "Small group requires 2-4 members" });
      return;
    }

    const emailSet = new Set(members.map((m) => m.email.toLowerCase()));
    if (emailSet.size !== members.length) {
      res.status(400).json({ error: "Duplicate emails" });
      return;
    }

    // Check for existing active correspondences between these users
    for (const m of members) {
      const memberEmail = m.email.toLowerCase();
      // Find all active correspondences where the creator is a member
      const creatorMemberships = await db
        .select()
        .from(correspondenceMembersTable)
        .where(eq(correspondenceMembersTable.email, auth.email));

      for (const cm of creatorMemberships) {
        const [corr] = await db
          .select()
          .from(correspondencesTable)
          .where(
            and(
              eq(correspondencesTable.id, cm.correspondenceId),
              eq(correspondencesTable.isActive, true),
            ),
          );
        if (!corr) continue;

        // Check if the invited member is also in this correspondence
        const [existingMember] = await db
          .select()
          .from(correspondenceMembersTable)
          .where(
            and(
              eq(correspondenceMembersTable.correspondenceId, corr.id),
              eq(correspondenceMembersTable.email, memberEmail),
            ),
          );

        if (existingMember) {
          res.status(409).json({
            error: "duplicate_correspondence",
            message: `You already have an active correspondence with ${m.name || memberEmail}.`,
          });
          return;
        }
      }
    }

    // Create correspondence
    const [correspondence] = await db
      .insert(correspondencesTable)
      .values({
        name,
        createdByUserId: auth.userId,
        groupType,
      })
      .returning();

    // Add creator as first member
    const creatorToken = randomUUID();
    await db.insert(correspondenceMembersTable).values({
      correspondenceId: correspondence.id,
      userId: auth.userId,
      email: auth.email,
      name: auth.name,
      inviteToken: creatorToken,
      joinedAt: new Date(),
    });

    // Add invited members
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

      // Send invitation email (fire-and-forget)
      sendInvitationEmail({
        to: m.email,
        creatorName: auth.name,
        correspondenceName: name,
        inviteUrl: `${frontendUrl}/letters/invite/${inviteToken}`,
      }).catch((err) => console.error("Failed to send invitation:", err));
    }

    const allMembers = await db
      .select()
      .from(correspondenceMembersTable)
      .where(eq(correspondenceMembersTable.correspondenceId, correspondence.id));

    res.json({ ...correspondence, members: allMembers });
  }),
);

router.get(
  "/letters/correspondences",
  requireSessionAuth(async (req, res, auth) => {
    // Find all correspondences where user is a member
    const memberRows = await db
      .select()
      .from(correspondenceMembersTable)
      .where(
        auth.userId
          ? eq(correspondenceMembersTable.userId, auth.userId)
          : eq(correspondenceMembersTable.email, auth.email),
      );

    const correspondenceIds = memberRows.map((m) => m.correspondenceId);
    if (correspondenceIds.length === 0) {
      res.json([]);
      return;
    }

    const results = [];

    for (const cId of correspondenceIds) {
      const [correspondence] = await db
        .select()
        .from(correspondencesTable)
        .where(and(eq(correspondencesTable.id, cId), eq(correspondencesTable.isActive, true)));

      if (!correspondence) continue;

      const members = await db
        .select()
        .from(correspondenceMembersTable)
        .where(eq(correspondenceMembersTable.correspondenceId, cId));

      const letters = await db
        .select()
        .from(lettersTable)
        .where(eq(lettersTable.correspondenceId, cId));

      const now = new Date();
      const periodStart = getPeriodStart(correspondence.startedAt, now);
      const periodEnd = getPeriodEnd(periodStart);
      const periodNumber = getPeriodNumber(correspondence.startedAt, now);
      const periodStartStr = formatPeriodStartDateString(periodStart);

      // Unread count
      const identifier = auth.userId ? auth.userId : auth.email;
      const unreadCount = letters.filter((l) => {
        const readers = (l.readBy as Array<string | number>) || [];
        return !readers.includes(identifier) && l.authorEmail !== auth.email;
      }).length;

      // Current period status
      const hasWrittenThisPeriod = letters.some(
        (l) => l.periodStartDate === periodStartStr && l.authorEmail === auth.email,
      );

      const membersWritten = members.map((m) => ({
        name: m.name || m.email,
        hasWritten: letters.some(
          (l) => l.periodStartDate === periodStartStr && l.authorEmail === m.email,
        ),
      }));

      results.push({
        ...correspondence,
        members: members.map((m) => ({
          name: m.name,
          email: m.email,
          joinedAt: m.joinedAt,
          lastLetterAt: m.lastLetterAt,
        })),
        letterCount: letters.length,
        unreadCount,
        currentPeriod: {
          periodNumber,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          periodLabel: formatPeriodLabel(periodStart, periodEnd),
          hasWrittenThisPeriod,
          membersWritten,
          isLastThreeDays: isInLastThreeDays(periodStart, now),
        },
      });
    }

    res.json(results);
  }),
);

router.get(
  "/letters/correspondences/:id",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(req.params.id, 10);
    const [correspondence] = await db
      .select()
      .from(correspondencesTable)
      .where(eq(correspondencesTable.id, correspondenceId));

    if (!correspondence) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { member, members } = await getMembership(correspondenceId, auth);
    if (!member) {
      res.status(403).json({ error: "Not a member" });
      return;
    }

    const letters = await db
      .select()
      .from(lettersTable)
      .where(eq(lettersTable.correspondenceId, correspondenceId))
      .orderBy(desc(lettersTable.sentAt));

    const now = new Date();
    const periodStart = getPeriodStart(correspondence.startedAt, now);
    const periodEnd = getPeriodEnd(periodStart);
    const periodNumber = getPeriodNumber(correspondence.startedAt, now);
    const periodStartStr = formatPeriodStartDateString(periodStart);

    const hasWrittenThisPeriod = letters.some(
      (l) => l.periodStartDate === periodStartStr && l.authorEmail === auth.email,
    );

    const membersWritten = members.map((m) => ({
      name: m.name || m.email,
      email: m.email,
      hasWritten: letters.some(
        (l) => l.periodStartDate === periodStartStr && l.authorEmail === m.email,
      ),
    }));

    res.json({
      ...correspondence,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        joinedAt: m.joinedAt,
        lastLetterAt: m.lastLetterAt,
      })),
      letters,
      currentPeriod: {
        periodNumber,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        periodLabel: formatPeriodLabel(periodStart, periodEnd),
        hasWrittenThisPeriod,
        membersWritten,
        isLastThreeDays: isInLastThreeDays(periodStart, now),
      },
    });
  }),
);

// ─── LETTERS ────────────────────────────────────────────────────────────────

router.get(
  "/letters/correspondences/:id/letters",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(req.params.id, 10);
    const { member } = await getMembership(correspondenceId, auth);
    if (!member) {
      res.status(403).json({ error: "Not a member" });
      return;
    }

    const letters = await db
      .select()
      .from(lettersTable)
      .where(eq(lettersTable.correspondenceId, correspondenceId))
      .orderBy(desc(lettersTable.sentAt));

    // Mark unread letters as read
    const identifier = auth.userId ? auth.userId : auth.email;
    for (const letter of letters) {
      const readers = (letter.readBy as Array<string | number>) || [];
      if (!readers.includes(identifier) && letter.authorEmail !== auth.email) {
        await db
          .update(lettersTable)
          .set({ readBy: [...readers, identifier] })
          .where(eq(lettersTable.id, letter.id));
      }
    }

    res.json(letters);
  }),
);

router.post(
  "/letters/correspondences/:id/letters",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(req.params.id, 10);

    const [correspondence] = await db
      .select()
      .from(correspondencesTable)
      .where(eq(correspondencesTable.id, correspondenceId));

    if (!correspondence) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { member, members } = await getMembership(correspondenceId, auth);
    if (!member || !member.joinedAt) {
      res.status(403).json({ error: "Not a joined member" });
      return;
    }

    const { content } = req.body as { content: string };
    if (!content || !content.trim()) {
      res.status(400).json({ error: "Letter content is required" });
      return;
    }
    const wordCount = content.trim().split(/\s+/).length;
    if (wordCount < 200) {
      res.status(400).json({ error: "Letter must be at least 200 words", wordCount });
      return;
    }
    if (wordCount > 1000) {
      res.status(400).json({ error: "Letter must be 1000 words or fewer", wordCount });
      return;
    }

    const now = new Date();
    const periodStart = getPeriodStart(correspondence.startedAt, now);
    const periodStartStr = formatPeriodStartDateString(periodStart);
    const periodNumber = getPeriodNumber(correspondence.startedAt, now);

    // One letter per period rule
    const existingLetters = await db
      .select()
      .from(lettersTable)
      .where(
        and(
          eq(lettersTable.correspondenceId, correspondenceId),
          eq(lettersTable.authorEmail, auth.email),
          eq(lettersTable.periodStartDate, periodStartStr),
        ),
      );

    if (existingLetters.length > 0) {
      res.status(429).json({
        error: "already_written_this_period",
        message: "Your letter for this period has already been sent.",
        nextPeriodStart: formatNextPeriodStart(correspondence.startedAt),
      });
      return;
    }

    // Calculate letter number for this author
    const authorLetters = await db
      .select()
      .from(lettersTable)
      .where(
        and(
          eq(lettersTable.correspondenceId, correspondenceId),
          eq(lettersTable.authorEmail, auth.email),
        ),
      );

    const letterNumber = authorLetters.length + 1;

    // Create letter
    const [letter] = await db
      .insert(lettersTable)
      .values({
        correspondenceId,
        authorUserId: auth.userId,
        authorEmail: auth.email,
        authorName: auth.name,
        content: content.trim(),
        letterNumber,
        periodNumber,
        periodStartDate: periodStartStr,
      })
      .returning();

    // Update member's lastLetterAt
    await db
      .update(correspondenceMembersTable)
      .set({ lastLetterAt: now })
      .where(eq(correspondenceMembersTable.id, member.id));

    // Delete draft for this period
    await db
      .delete(letterDraftsTable)
      .where(
        and(
          eq(letterDraftsTable.correspondenceId, correspondenceId),
          eq(letterDraftsTable.authorEmail, auth.email),
          eq(letterDraftsTable.periodStartDate, periodStartStr),
        ),
      );

    // Send notification emails to other members (fire-and-forget)
    const frontendUrl = getFrontendUrl();
    for (const m of members) {
      if (m.email === auth.email) continue;
      if (!m.joinedAt) continue;

      const correspondenceUrl = m.userId
        ? `${frontendUrl}/letters/${correspondenceId}`
        : `${frontendUrl}/letters/${correspondenceId}?token=${m.inviteToken}`;

      sendNewLetterEmail({
        to: m.email,
        authorName: auth.name,
        correspondenceName: correspondence.name,
        correspondenceUrl,
      }).catch((err) => console.error("Failed to send new letter email:", err));
    }

    res.json(letter);
  }),
);

// ─── DRAFTS ─────────────────────────────────────────────────────────────────

router.put(
  "/letters/correspondences/:id/draft",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(req.params.id, 10);
    const { member } = await getMembership(correspondenceId, auth);
    if (!member) {
      res.status(403).json({ error: "Not a member" });
      return;
    }

    const [correspondence] = await db
      .select()
      .from(correspondencesTable)
      .where(eq(correspondencesTable.id, correspondenceId));

    if (!correspondence) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { content } = req.body as { content: string };
    const now = new Date();
    const periodStart = getPeriodStart(correspondence.startedAt, now);
    const periodStartStr = formatPeriodStartDateString(periodStart);

    await db
      .insert(letterDraftsTable)
      .values({
        correspondenceId,
        authorUserId: auth.userId,
        authorEmail: auth.email,
        content: content || "",
        periodStartDate: periodStartStr,
      })
      .onConflictDoUpdate({
        target: [letterDraftsTable.correspondenceId, letterDraftsTable.authorEmail, letterDraftsTable.periodStartDate],
        set: {
          content: content || "",
          lastSavedAt: now,
        },
      });

    res.json({ saved: true, savedAt: now.toISOString() });
  }),
);

router.get(
  "/letters/correspondences/:id/draft",
  requireAuth(async (req, res, auth) => {
    const correspondenceId = parseInt(req.params.id, 10);
    const { member } = await getMembership(correspondenceId, auth);
    if (!member) {
      res.status(403).json({ error: "Not a member" });
      return;
    }

    const [correspondence] = await db
      .select()
      .from(correspondencesTable)
      .where(eq(correspondencesTable.id, correspondenceId));

    if (!correspondence) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const now = new Date();
    const periodStart = getPeriodStart(correspondence.startedAt, now);
    const periodStartStr = formatPeriodStartDateString(periodStart);

    const [draft] = await db
      .select()
      .from(letterDraftsTable)
      .where(
        and(
          eq(letterDraftsTable.correspondenceId, correspondenceId),
          eq(letterDraftsTable.authorEmail, auth.email),
          eq(letterDraftsTable.periodStartDate, periodStartStr),
        ),
      );

    res.json(draft || null);
  }),
);

// ─── INVITATIONS ────────────────────────────────────────────────────────────

router.get("/letters/invite/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [member] = await db
    .select()
    .from(correspondenceMembersTable)
    .where(eq(correspondenceMembersTable.inviteToken, token));

  if (!member) {
    res.status(404).json({ error: "Invalid invitation" });
    return;
  }

  const [correspondence] = await db
    .select()
    .from(correspondencesTable)
    .where(eq(correspondencesTable.id, member.correspondenceId));

  if (!correspondence) {
    res.status(404).json({ error: "Correspondence not found" });
    return;
  }

  // Get creator info
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
    groupType: correspondence.groupType,
    memberCount: members.length,
    letterCount: letterCount[0]?.count || 0,
    alreadyJoined: !!member.joinedAt,
    memberEmail: member.email,
  });
});

router.post("/letters/invite/:token/accept", async (req, res): Promise<void> => {
  const { token } = req.params;
  const { name, email } = req.body as { name: string; email: string };

  if (!name || !email) {
    res.status(400).json({ error: "Name and email are required" });
    return;
  }

  const [member] = await db
    .select()
    .from(correspondenceMembersTable)
    .where(eq(correspondenceMembersTable.inviteToken, token));

  if (!member) {
    res.status(404).json({ error: "Invalid invitation" });
    return;
  }

  if (member.joinedAt) {
    res.json({ correspondenceId: member.correspondenceId, token });
    return;
  }

  // Check if Eleanor account exists with this email
  const { usersTable } = await import("@workspace/db");
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

// ─── REMINDER CRON ──────────────────────────────────────────────────────────

router.post("/letters/send-reminders", async (req, res): Promise<void> => {
  const internalKey = req.headers["x-internal-key"];
  if (internalKey !== process.env["INTERNAL_API_KEY"]) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const correspondences = await db
    .select()
    .from(correspondencesTable)
    .where(eq(correspondencesTable.isActive, true));

  const now = new Date();
  const frontendUrl = getFrontendUrl();
  let remindersSent = 0;

  for (const c of correspondences) {
    const periodStart = getPeriodStart(c.startedAt, now);

    if (!isInLastThreeDays(periodStart, now)) continue;

    const periodStartStr = formatPeriodStartDateString(periodStart);
    const periodEnd = getPeriodEnd(periodStart);
    const periodEndLabel = formatHumanDate(periodEnd);

    const members = await db
      .select()
      .from(correspondenceMembersTable)
      .where(eq(correspondenceMembersTable.correspondenceId, c.id));

    const letters = await db
      .select()
      .from(lettersTable)
      .where(
        and(
          eq(lettersTable.correspondenceId, c.id),
          eq(lettersTable.periodStartDate, periodStartStr),
        ),
      );

    const writtenEmails = new Set(letters.map((l) => l.authorEmail));

    for (const m of members) {
      if (!m.joinedAt) continue;
      if (writtenEmails.has(m.email)) continue;

      // Check if reminder already sent
      const [existing] = await db
        .select()
        .from(letterRemindersTable)
        .where(
          and(
            eq(letterRemindersTable.correspondenceId, c.id),
            eq(letterRemindersTable.memberEmail, m.email),
            eq(letterRemindersTable.periodStartDate, periodStartStr),
          ),
        );

      if (existing) continue;

      const writeUrl = m.userId
        ? `${frontendUrl}/letters/${c.id}/write`
        : `${frontendUrl}/letters/${c.id}/write?token=${m.inviteToken}`;

      await sendReminderEmail({
        to: m.email,
        correspondenceName: c.name,
        writeUrl,
        periodEnd: periodEndLabel,
      });

      await db.insert(letterRemindersTable).values({
        correspondenceId: c.id,
        memberEmail: m.email,
        periodStartDate: periodStartStr,
      });

      remindersSent++;
    }
  }

  res.json({ remindersSent });
});

export default router;
