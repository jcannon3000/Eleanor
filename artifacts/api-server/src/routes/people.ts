import { Router, type IRouter } from "express";
import { eq, desc, or, sql, inArray } from "drizzle-orm";
import { db, ritualsTable, meetupsTable, usersTable, sharedMomentsTable, momentUserTokensTable, momentPostsTable } from "@workspace/db";
import { computeStreak } from "../lib/streak";

const router: IRouter = Router();

type Participant = { name: string; email: string };

// Helper: get all rituals where the user is owner OR participant
async function getUserRituals(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return { user: null, rituals: [] };
  const rituals = await db.select().from(ritualsTable).where(
    or(
      eq(ritualsTable.ownerId, userId),
      sql`${ritualsTable.participants} @> ${JSON.stringify([{ email: user.email }])}::jsonb`
    )
  );
  return { user, rituals };
}

// GET /api/people?ownerId=N
// Returns all unique people from the user's rituals (owned + participant)
router.get("/people", async (req, res): Promise<void> => {
  const ownerId = parseInt(String(req.query.ownerId ?? ""), 10);
  if (isNaN(ownerId)) {
    res.status(400).json({ error: "ownerId is required" });
    return;
  }

  const { user: owner, rituals } = await getUserRituals(ownerId);

  const ownerEmail = owner?.email ?? "";

  // Map email -> person summary
  const map = new Map<string, {
    name: string;
    email: string;
    sharedCircleCount: number;
    firstCircleDate: Date;
  }>();

  for (const ritual of rituals) {
    const participants = (ritual.participants as Participant[]) ?? [];
    for (const p of participants) {
      if (!p.email || p.email === ownerEmail) continue;
      if (map.has(p.email)) {
        const existing = map.get(p.email)!;
        existing.sharedCircleCount++;
        if (ritual.createdAt < existing.firstCircleDate) {
          existing.firstCircleDate = ritual.createdAt;
        }
      } else {
        map.set(p.email, {
          name: p.name,
          email: p.email,
          sharedCircleCount: 1,
          firstCircleDate: ritual.createdAt,
        });
      }
    }
  }

  // Enrich each person with max current streak from shared practices
  const ownerTokenRows = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.email, ownerEmail));
  const ownerMomentIds = ownerTokenRows.map(t => t.momentId);

  const peopleWithStreaks = await Promise.all(
    Array.from(map.values()).map(async (p) => {
      let maxStreak = 0;
      if (ownerMomentIds.length > 0) {
        const personTokenRows = await db.select().from(momentUserTokensTable)
          .where(eq(momentUserTokensTable.email, p.email));
        const personMomentIds = new Set(personTokenRows.map(t => t.momentId));
        const sharedMomentIds = ownerMomentIds.filter(id => personMomentIds.has(id));
        if (sharedMomentIds.length > 0) {
          const sharedMoments = await db.select({ currentStreak: sharedMomentsTable.currentStreak })
            .from(sharedMomentsTable)
            .where(inArray(sharedMomentsTable.id, sharedMomentIds));
          maxStreak = Math.max(0, ...sharedMoments.map(m => m.currentStreak ?? 0));
        }
      }
      return {
        ...p,
        firstCircleDate: p.firstCircleDate.toISOString(),
        maxSharedStreak: maxStreak,
      };
    })
  );

  res.json(peopleWithStreaks);
});

// GET /api/people/:email?ownerId=N
// Returns a full relationship profile for a specific person
router.get("/people/:email", async (req, res): Promise<void> => {
  const email = decodeURIComponent(req.params.email ?? "");
  const ownerId = parseInt(String(req.query.ownerId ?? ""), 10);

  if (!email || isNaN(ownerId)) {
    res.status(400).json({ error: "email and ownerId are required" });
    return;
  }

  const { user: owner, rituals: allRituals } = await getUserRituals(ownerId);
  const ownerEmail = owner?.email ?? "";

  const sharedRituals = allRituals.filter(r => {
    const participants = (r.participants as Participant[]) ?? [];
    return participants.some(p => p.email === email);
  });

  // Find shared practices (moments) where both owner and person are members
  const ownerTokenRows = await db.select({ momentId: momentUserTokensTable.momentId, name: momentUserTokensTable.name })
    .from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.email, ownerEmail));
  const ownerMomentIds = ownerTokenRows.map(t => t.momentId);

  let sharedPractices: Array<{
    id: number; name: string; currentStreak: number; totalBlooms: number;
    frequency: string; templateType: string | null; createdAt: string;
  }> = [];

  if (ownerMomentIds.length > 0) {
    const personTokenRows = await db.select({ momentId: momentUserTokensTable.momentId })
      .from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.email, email));
    const personMomentIdSet = new Set(personTokenRows.map(t => t.momentId));
    const sharedMomentIds = ownerMomentIds.filter(id => personMomentIdSet.has(id));
    if (sharedMomentIds.length > 0) {
      const moments = await db.select({
        id: sharedMomentsTable.id,
        name: sharedMomentsTable.name,
        currentStreak: sharedMomentsTable.currentStreak,
        totalBlooms: sharedMomentsTable.totalBlooms,
        frequency: sharedMomentsTable.frequency,
        templateType: sharedMomentsTable.templateType,
        createdAt: sharedMomentsTable.createdAt,
      }).from(sharedMomentsTable).where(inArray(sharedMomentsTable.id, sharedMomentIds));
      sharedPractices = moments.map(m => ({ ...m, createdAt: m.createdAt.toISOString() }));
    }
  }

  if (sharedRituals.length === 0 && sharedPractices.length === 0) {
    res.status(404).json({ error: "Person not found in any of your traditions or practices" });
    return;
  }

  // Resolve display name from rituals or moment_user_tokens
  let personName = email;
  for (const ritual of sharedRituals) {
    const match = (ritual.participants as Participant[]).find(p => p.email === email);
    if (match?.name) { personName = match.name; break; }
  }
  if (personName === email && ownerMomentIds.length > 0) {
    const nameRow = await db.select({ name: momentUserTokensTable.name })
      .from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.email, email))
      .limit(1);
    if (nameRow[0]?.name) personName = nameRow[0].name;
  }

  // Enrich each shared ritual with its meetups
  const enriched = await Promise.all(
    sharedRituals.map(async (ritual) => {
      const meetups = await db
        .select()
        .from(meetupsTable)
        .where(eq(meetupsTable.ritualId, ritual.id))
        .orderBy(desc(meetupsTable.scheduledDate));

      const { streak, nextMeetupDate, lastMeetupDate, status } = computeStreak(meetups, ritual.frequency);

      return {
        ritual: {
          id: ritual.id,
          name: ritual.name,
          frequency: ritual.frequency,
          dayPreference: ritual.dayPreference,
          intention: ritual.intention,
          participants: (ritual.participants as Participant[]),
          ownerId: ritual.ownerId,
          createdAt: ritual.createdAt.toISOString(),
          streak,
          nextMeetupDate,
          lastMeetupDate,
          status,
        },
        meetups: meetups.map(m => ({
          id: m.id,
          ritualId: m.ritualId,
          scheduledDate: m.scheduledDate.toISOString(),
          status: m.status,
          notes: m.notes,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    })
  );

  const totalGatherings = enriched.reduce(
    (sum, { meetups }) => sum + meetups.filter(m => m.status === "completed").length,
    0
  );

  const firstCircleDate = sharedRituals.length > 0
    ? new Date(Math.min(...sharedRituals.map(r => r.createdAt.getTime()))).toISOString()
    : null;

  res.json({
    name: personName,
    email,
    stats: {
      sharedCircleCount: sharedRituals.length,
      totalGatherings,
      firstCircleDate,
    },
    sharedRituals: enriched,
    sharedPractices,
  });
});

export default router;
