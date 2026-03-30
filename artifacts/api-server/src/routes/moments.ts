import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db, ritualsTable, inviteTokensTable, usersTable,
  sharedMomentsTable, momentUserTokensTable, momentPostsTable, momentWindowsTable,
} from "@workspace/db";
import { createCalendarEvent } from "../lib/calendar";
import crypto from "crypto";

const router: IRouter = Router();

function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

// ─── Current window date (YYYY-MM-DD) ───────────────────────────────────────
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Is the posting window currently open? ──────────────────────────────────
function isWindowOpen(moment: { scheduledTime: string; windowMinutes: number }): boolean {
  const now = new Date();
  const [h, m] = moment.scheduledTime.split(":").map(Number);
  const windowStart = new Date();
  windowStart.setHours(h, m, 0, 0);
  const windowEnd = new Date(windowStart.getTime() + moment.windowMinutes * 60_000);
  return now >= windowStart && now <= windowEnd;
}

// ─── Minutes remaining in window ────────────────────────────────────────────
function minutesRemaining(moment: { scheduledTime: string; windowMinutes: number }): number {
  const now = new Date();
  const [h, m] = moment.scheduledTime.split(":").map(Number);
  const windowStart = new Date();
  windowStart.setHours(h, m, 0, 0);
  const windowEnd = new Date(windowStart.getTime() + moment.windowMinutes * 60_000);
  return Math.max(0, Math.round((windowEnd.getTime() - now.getTime()) / 60_000));
}

// ─── Evaluate window and update streak ──────────────────────────────────────
async function evaluateWindow(momentId: number, windowDate: string) {
  const posts = await db.select().from(momentPostsTable)
    .where(and(eq(momentPostsTable.momentId, momentId), eq(momentPostsTable.windowDate, windowDate)));

  const postCount = posts.length;
  const status = postCount >= 2 ? "bloom" : postCount === 1 ? "solo" : "wither";

  // Upsert window record
  const existing = await db.select().from(momentWindowsTable)
    .where(and(eq(momentWindowsTable.momentId, momentId), eq(momentWindowsTable.windowDate, windowDate)));

  if (existing.length === 0) {
    await db.insert(momentWindowsTable).values({
      momentId, windowDate, status, postCount, closedAt: new Date(),
    });
  } else {
    await db.update(momentWindowsTable)
      .set({ status, postCount, closedAt: new Date() })
      .where(eq(momentWindowsTable.id, existing[0].id));
  }

  // Update streak on the moment
  if (status === "bloom") {
    const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
    if (moment) {
      const newStreak = moment.currentStreak + 1;
      const newLongest = Math.max(newStreak, moment.longestStreak);
      const newState = (moment.state === "needs_water" || moment.state === "dormant") ? "active" : moment.state;
      await db.update(sharedMomentsTable)
        .set({ currentStreak: newStreak, longestStreak: newLongest, totalBlooms: moment.totalBlooms + 1, state: newState })
        .where(eq(sharedMomentsTable.id, momentId));
    }
  } else if (status === "wither") {
    const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
    if (moment) {
      // Check for consecutive withers
      const recentWindows = await db.select().from(momentWindowsTable)
        .where(eq(momentWindowsTable.momentId, momentId));
      const sortedWindows = recentWindows
        .sort((a, b) => b.windowDate.localeCompare(a.windowDate))
        .slice(0, 3);

      const consecutiveWithers = sortedWindows.filter(w => w.status === "wither").length;

      if (consecutiveWithers >= 2) {
        await db.update(sharedMomentsTable)
          .set({ currentStreak: 0, state: "dormant" })
          .where(eq(sharedMomentsTable.id, momentId));
      } else if (consecutiveWithers === 1) {
        await db.update(sharedMomentsTable)
          .set({ state: "needs_water" })
          .where(eq(sharedMomentsTable.id, momentId));
      }
    }
  }
}

// ─── POST /api/rituals/:id/moments — plant a shared moment ──────────────────
const PlantSchema = z.object({
  name: z.string().min(1).max(100),
  intention: z.string().min(1).max(140),
  loggingType: z.enum(["photo", "reflection", "both", "checkin"]),
  reflectionPrompt: z.string().max(100).optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  goalDays: z.number().int().min(1).max(365).default(30),
});

router.post("/rituals/:id/moments", async (req, res): Promise<void> => {
  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = PlantSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }
  if (ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { name, intention, loggingType, reflectionPrompt, frequency, scheduledTime, goalDays } = parsed.data;

  const momentToken = generateToken();

  const [moment] = await db.insert(sharedMomentsTable).values({
    ritualId,
    name,
    intention,
    loggingType,
    reflectionPrompt: reflectionPrompt ?? null,
    frequency,
    scheduledTime,
    goalDays,
    momentToken,
    windowMinutes: 60,
  }).returning();

  // Get the organizer's info
  const [organizer] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));

  // Get all circle members (invite_tokens) + organizer
  const inviteTokens = await db.select().from(inviteTokensTable).where(eq(inviteTokensTable.ritualId, ritualId));

  // Build member list: organizer + all invitees
  const members: Array<{ email: string; name: string }> = [
    { email: organizer.email, name: organizer.name ?? organizer.email },
    ...inviteTokens.map(t => ({ email: t.email, name: t.name ?? t.email })),
  ];

  // Deduplicate by email
  const seen = new Set<string>();
  const uniqueMembers = members.filter(m => {
    if (seen.has(m.email)) return false;
    seen.add(m.email);
    return true;
  });

  // Create moment_user_tokens for each member
  const baseUrl = process.env["REPLIT_DEV_DOMAIN"]
    ? `https://${process.env["REPLIT_DEV_DOMAIN"]}/moment`
    : `http://localhost:${process.env["PORT"] ?? 3001}/moment`;

  const memberTokenRows = uniqueMembers.map(m => ({
    momentId: moment.id,
    email: m.email,
    name: m.name,
    userToken: generateToken(),
  }));

  const insertedTokens = await db.insert(momentUserTokensTable).values(memberTokenRows).returning();

  // Build calendar description with all personal links
  const freqLabel = frequency === "daily" ? "Daily" : frequency === "weekly" ? "Weekly" : "Monthly";
  const [hh, mm] = scheduledTime.split(":").map(Number);
  const timeLabel = new Date(0, 0, 0, hh, mm).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const loggingLabel = { photo: "Share a photo", reflection: "Reflect on a prompt", both: "Photo and reflection", checkin: "Just show up" }[loggingType];

  const linkLines = insertedTokens.map(t => `  ${t.name ?? t.email}: ${baseUrl}/${momentToken}/${t.userToken}`);

  const calDescription = [
    intention,
    "",
    `${freqLabel} at ${timeLabel} · ${goalDays}-day goal`,
    loggingType === "reflection" || loggingType === "both"
      ? `Prompt: ${reflectionPrompt ?? "Show up and reflect."}`
      : `How: ${loggingLabel}`,
    "",
    "You have one hour. Tap your personal link:",
    ...linkLines,
    "",
    "No login needed. Just show up. 🌿",
    "",
    "Coordinated by Eleanor · eleanor.app",
  ].join("\n");

  // Create recurring calendar event on the organizer's calendar
  const recurrenceRule = frequency === "daily"
    ? ["RRULE:FREQ=DAILY"]
    : frequency === "weekly"
    ? ["RRULE:FREQ=WEEKLY"]
    : ["RRULE:FREQ=MONTHLY"];

  const startDate = new Date();
  startDate.setHours(hh, mm, 0, 0);
  // If that time has already passed today, start from tomorrow
  if (startDate < new Date()) {
    startDate.setDate(startDate.getDate() + 1);
  }
  const endDate = new Date(startDate.getTime() + 60 * 60_000);

  const attendeeEmails = uniqueMembers.map(m => m.email);

  const gcalEventId = await createCalendarEvent(sessionUserId, {
    summary: `🌿 ${name}`,
    description: calDescription,
    startDate,
    endDate,
    attendees: attendeeEmails,
    recurrence: recurrenceRule,
  }).catch(() => null);

  // Store the gcal event ID on the organizer's token row
  if (gcalEventId) {
    const organizerTokenRow = insertedTokens.find(t => t.email === organizer.email);
    if (organizerTokenRow) {
      await db.update(momentUserTokensTable)
        .set({ googleCalendarEventId: gcalEventId })
        .where(eq(momentUserTokensTable.id, organizerTokenRow.id));
    }
  }

  res.status(201).json({
    moment: { ...moment },
    memberCount: uniqueMembers.length,
    gcalCreated: !!gcalEventId,
  });
});

// ─── POST /api/moments — plant a standalone shared moment ───────────────────
const StandalonePlantSchema = z.object({
  name: z.string().min(1).max(100),
  intention: z.string().min(1).max(280),
  loggingType: z.enum(["photo", "reflection", "both", "checkin"]),
  reflectionPrompt: z.string().max(200).optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  dayOfWeek: z.enum(["MO","TU","WE","TH","FR","SA","SU"]).optional(),
  goalDays: z.number().int().min(1).max(365).default(30),
  participants: z.array(z.object({ name: z.string(), email: z.string().email() })).min(1).max(20),
});

router.post("/moments", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = StandalonePlantSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  const { name, intention, loggingType, reflectionPrompt, frequency, scheduledTime, dayOfWeek, goalDays, participants } = parsed.data;

  const momentToken = generateToken();

  const [moment] = await db.insert(sharedMomentsTable).values({
    ritualId: null,
    name,
    intention,
    loggingType,
    reflectionPrompt: reflectionPrompt ?? null,
    frequency,
    scheduledTime,
    dayOfWeek: dayOfWeek ?? null,
    goalDays,
    momentToken,
    windowMinutes: 60,
  }).returning();

  const [organizer] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));

  // Merge organizer into participants, deduplicate by email
  const allMembers: Array<{ email: string; name: string }> = [
    { email: organizer.email, name: organizer.name ?? organizer.email },
    ...participants.map(p => ({ email: p.email, name: p.name || p.email })),
  ];
  const seen = new Set<string>();
  const uniqueMembers = allMembers.filter(m => {
    if (seen.has(m.email)) return false;
    seen.add(m.email);
    return true;
  });

  const baseUrl = process.env["REPLIT_DEV_DOMAIN"]
    ? `https://${process.env["REPLIT_DEV_DOMAIN"]}/moment`
    : `http://localhost:${process.env["PORT"] ?? 3001}/moment`;

  const memberTokenRows = uniqueMembers.map(m => ({
    momentId: moment.id,
    email: m.email,
    name: m.name,
    userToken: generateToken(),
  }));

  const insertedTokens = await db.insert(momentUserTokensTable).values(memberTokenRows).returning();

  const freqLabel = frequency === "daily" ? "Daily" : frequency === "weekly" ? "Weekly" : "Monthly";
  const [hh, mm] = scheduledTime.split(":").map(Number);
  const timeLabel = new Date(0, 0, 0, hh, mm).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const loggingLabel = { photo: "Share a photo", reflection: "Reflect on a prompt", both: "Photo and reflection", checkin: "Just show up" }[loggingType];

  const linkLines = insertedTokens.map(t => `  ${t.name ?? t.email}: ${baseUrl}/${momentToken}/${t.userToken}`);

  const calDescription = [
    intention,
    "",
    `${freqLabel} at ${timeLabel} · ${goalDays}-day goal`,
    loggingType === "reflection" || loggingType === "both"
      ? `Prompt: ${reflectionPrompt ?? "Show up and reflect."}`
      : `How: ${loggingLabel}`,
    "",
    "You have one hour. Tap your personal link:",
    ...linkLines,
    "",
    "No login needed. Just show up. 🌿",
    "",
    "Coordinated by Eleanor · eleanor.app",
  ].join("\n");

  const recurrenceRule = frequency === "daily"
    ? ["RRULE:FREQ=DAILY"]
    : frequency === "weekly"
    ? [`RRULE:FREQ=WEEKLY${dayOfWeek ? `;BYDAY=${dayOfWeek}` : ""}`]
    : ["RRULE:FREQ=MONTHLY"];

  const startDate = new Date();
  startDate.setHours(hh, mm, 0, 0);
  if (startDate < new Date()) startDate.setDate(startDate.getDate() + 1);
  const endDate = new Date(startDate.getTime() + 60 * 60_000);

  const attendeeEmails = uniqueMembers.map(m => m.email);

  const gcalEventId = await createCalendarEvent(sessionUserId, {
    summary: `🌿 ${name}`,
    description: calDescription,
    startDate,
    endDate,
    attendees: attendeeEmails,
    recurrence: recurrenceRule,
  }).catch(() => null);

  if (gcalEventId) {
    const organizerTokenRow = insertedTokens.find(t => t.email === organizer.email);
    if (organizerTokenRow) {
      await db.update(momentUserTokensTable)
        .set({ googleCalendarEventId: gcalEventId })
        .where(eq(momentUserTokensTable.id, organizerTokenRow.id));
    }
  }

  res.status(201).json({
    moment: { ...moment },
    memberCount: uniqueMembers.length,
    gcalCreated: !!gcalEventId,
  });
});

// ─── GET /api/moments — list all standalone moments the user participates in ─
router.get("/moments", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Find all moment_user_tokens for this user's email
  const userTokenRows = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.email, user.email));

  const momentIds = [...new Set(userTokenRows.map(t => t.momentId))];
  if (momentIds.length === 0) { res.json({ moments: [] }); return; }

  const flatMoments = (await db.select().from(sharedMomentsTable)
    .where(inArray(sharedMomentsTable.id, momentIds)))
    .filter(m => m.ritualId === null);

  const enriched = await Promise.all(flatMoments.map(async (m) => {
    const allMembers = await db.select().from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.momentId, m.id));

    const todayPosts = await db.select().from(momentPostsTable)
      .where(and(eq(momentPostsTable.momentId, m.id), eq(momentPostsTable.windowDate, todayDate())));

    const windows = await db.select().from(momentWindowsTable)
      .where(eq(momentWindowsTable.momentId, m.id));
    const latestWindow = windows.sort((a, b) => b.windowDate.localeCompare(a.windowDate))[0] ?? null;

    const myToken = userTokenRows.find(t => t.momentId === m.id);

    return {
      ...m,
      memberCount: allMembers.length,
      members: allMembers.map(t => ({ name: t.name, email: t.email })),
      todayPostCount: todayPosts.length,
      windowOpen: isWindowOpen(m),
      minutesLeft: minutesRemaining(m),
      latestWindow,
      myUserToken: myToken?.userToken ?? null,
    };
  }));

  res.json({ moments: enriched });
});

// ─── GET /api/moments/:id — full detail for one moment ──────────────────────
router.get("/moments/:id", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  // Auth: must be a participant
  const myTokenRow = await db.select().from(momentUserTokensTable)
    .where(and(eq(momentUserTokensTable.momentId, momentId), eq(momentUserTokensTable.email, user.email)));
  if (myTokenRow.length === 0) { res.status(403).json({ error: "Forbidden" }); return; }

  const allMembers = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, momentId));

  // All windows sorted newest first
  const windows = await db.select().from(momentWindowsTable)
    .where(eq(momentWindowsTable.momentId, momentId));
  const sortedWindows = windows.sort((a, b) => b.windowDate.localeCompare(a.windowDate));

  // All posts ever
  const allPosts = await db.select().from(momentPostsTable)
    .where(eq(momentPostsTable.momentId, momentId));

  // Group posts by windowDate
  const postsByDate: Record<string, typeof allPosts> = {};
  for (const post of allPosts) {
    if (!postsByDate[post.windowDate]) postsByDate[post.windowDate] = [];
    postsByDate[post.windowDate].push(post);
  }

  const windowsWithPosts = sortedWindows.map(w => ({
    ...w,
    posts: (postsByDate[w.windowDate] ?? []).map(p => ({
      guestName: p.guestName,
      photoUrl: p.photoUrl,
      reflectionText: p.reflectionText,
      isCheckin: p.isCheckin === 1,
    })),
  }));

  // Today's open window (may not have a record yet if no posts)
  const windowDate = todayDate();
  const todayPosts = postsByDate[windowDate] ?? [];
  const windowOpen = isWindowOpen(moment);
  const minsLeft = minutesRemaining(moment);

  res.json({
    moment,
    members: allMembers.map(t => ({ name: t.name, email: t.email })),
    memberCount: allMembers.length,
    myUserToken: myTokenRow[0]?.userToken ?? null,
    windows: windowsWithPosts,
    todayPostCount: todayPosts.length,
    windowOpen,
    minutesLeft: minsLeft,
  });
});

// ─── GET /api/rituals/:id/moments — list moments for a circle ───────────────
router.get("/rituals/:id/moments", async (req, res): Promise<void> => {
  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual || ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const moments = await db.select().from(sharedMomentsTable)
    .where(eq(sharedMomentsTable.ritualId, ritualId));

  // For each moment, get the latest window
  const enriched = await Promise.all(moments.map(async (m) => {
    const windows = await db.select().from(momentWindowsTable)
      .where(eq(momentWindowsTable.momentId, m.id));
    const sortedWindows = windows.sort((a, b) => b.windowDate.localeCompare(a.windowDate));
    const latestWindow = sortedWindows[0] ?? null;

    const todayPosts = await db.select().from(momentPostsTable)
      .where(and(eq(momentPostsTable.momentId, m.id), eq(momentPostsTable.windowDate, todayDate())));

    return {
      ...m,
      latestWindow,
      todayPostCount: todayPosts.length,
      windowOpen: isWindowOpen(m),
    };
  }));

  res.json({ moments: enriched });
});

// ─── GET /api/moment/:momentToken/:userToken — public posting page ───────────
router.get("/moment/:momentToken/:userToken", async (req, res): Promise<void> => {
  const { momentToken, userToken } = req.params;

  const [moment] = await db.select().from(sharedMomentsTable)
    .where(eq(sharedMomentsTable.momentToken, momentToken));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  const [userTokenRow] = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.userToken, userToken));
  if (!userTokenRow || userTokenRow.momentId !== moment.id) {
    res.status(404).json({ error: "Invalid token" });
    return;
  }

  const ritual = moment.ritualId
    ? (await db.select().from(ritualsTable).where(eq(ritualsTable.id, moment.ritualId)))[0] ?? null
    : null;
  const windowDate = todayDate();

  const allTodayPosts = await db.select().from(momentPostsTable)
    .where(and(eq(momentPostsTable.momentId, moment.id), eq(momentPostsTable.windowDate, windowDate)));

  const myPost = allTodayPosts.find(p => p.userToken === userToken) ?? null;

  const allMembers = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, moment.id));

  const windowOpen = isWindowOpen(moment);
  const minsLeft = minutesRemaining(moment);

  res.json({
    moment: {
      id: moment.id,
      name: moment.name,
      intention: moment.intention,
      loggingType: moment.loggingType,
      reflectionPrompt: moment.reflectionPrompt,
      currentStreak: moment.currentStreak,
      longestStreak: moment.longestStreak,
      state: moment.state,
    },
    ritualName: ritual?.name ?? "",
    windowDate,
    windowOpen,
    minutesRemaining: minsLeft,
    memberCount: allMembers.length,
    todayPostCount: allTodayPosts.length,
    myPost: myPost
      ? {
          photoUrl: myPost.photoUrl,
          reflectionText: myPost.reflectionText,
          isCheckin: myPost.isCheckin === 1,
        }
      : null,
    userName: userTokenRow.name ?? userTokenRow.email,
  });
});

// ─── POST /api/moment/:momentToken/:userToken/post — submit a post ───────────
const PostSchema = z.object({
  photoUrl: z.string().optional(),
  reflectionText: z.string().max(280).optional(),
  isCheckin: z.boolean().default(false),
});

router.post("/moment/:momentToken/:userToken/post", async (req, res): Promise<void> => {
  const { momentToken, userToken } = req.params;

  const parsed = PostSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  try {
    const [moment] = await db.select().from(sharedMomentsTable)
      .where(eq(sharedMomentsTable.momentToken, momentToken));
    if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

    const [userTokenRow] = await db.select().from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.userToken, userToken));
    if (!userTokenRow || userTokenRow.momentId !== moment.id) {
      res.status(404).json({ error: "Invalid token" });
      return;
    }

    const windowDate = todayDate();

    // Check for existing post today from this user
    const existingPosts = await db.select().from(momentPostsTable)
      .where(and(eq(momentPostsTable.momentId, moment.id), eq(momentPostsTable.windowDate, windowDate)));
    const myExisting = existingPosts.find(p => p.userToken === userToken);

    const guestName = userTokenRow.name ?? userTokenRow.email;
    const { photoUrl, reflectionText, isCheckin } = parsed.data;

    if (myExisting) {
      await db.update(momentPostsTable)
        .set({
          photoUrl: photoUrl ?? null,
          reflectionText: reflectionText ?? null,
          isCheckin: isCheckin ? 1 : 0,
        })
        .where(eq(momentPostsTable.id, myExisting.id));
    } else {
      await db.insert(momentPostsTable).values({
        momentId: moment.id,
        windowDate,
        userToken,
        guestName,
        photoUrl: photoUrl ?? null,
        reflectionText: reflectionText ?? null,
        isCheckin: isCheckin ? 1 : 0,
      });
    }

    // Recount posts to get fresh total
    const allTodayPosts = await db.select().from(momentPostsTable)
      .where(and(eq(momentPostsTable.momentId, moment.id), eq(momentPostsTable.windowDate, windowDate)));

    res.status(201).json({
      success: true,
      todayPostCount: allTodayPosts.length,
      memberCount: (await db.select().from(momentUserTokensTable).where(eq(momentUserTokensTable.momentId, moment.id))).length,
    });

    // Async: close and evaluate window if it's past the window end time
    const windowIsStillOpen = isWindowOpen(moment);
    if (!windowIsStillOpen) {
      evaluateWindow(moment.id, windowDate).catch(err =>
        console.warn("Window evaluation failed:", err?.message ?? err)
      );
    }

  } catch (err) {
    console.error("POST /moment/:momentToken/:userToken/post error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/rituals/:id/moments/:momentId/journal — window history ─────────
router.get("/rituals/:id/moments/:momentId/journal", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.momentId, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Not found" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, moment.ritualId));
  if (!ritual || ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const windows = await db.select().from(momentWindowsTable)
    .where(eq(momentWindowsTable.momentId, momentId));

  const enriched = await Promise.all(
    windows.sort((a, b) => b.windowDate.localeCompare(a.windowDate)).map(async (w) => {
      const posts = await db.select().from(momentPostsTable)
        .where(and(eq(momentPostsTable.momentId, momentId), eq(momentPostsTable.windowDate, w.windowDate)));
      return { ...w, posts };
    })
  );

  res.json({ windows: enriched, moment });
});

export default router;
