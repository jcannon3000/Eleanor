import { Router, type IRouter } from "express";
import { eq, desc, or, sql, inArray, and, isNull, gt } from "drizzle-orm";
import { db, ritualsTable, meetupsTable, usersTable, sharedMomentsTable, momentUserTokensTable, momentWindowsTable, prayerRequestsTable } from "@workspace/db";
import { computeStreak } from "../lib/streak";

const router: IRouter = Router();

type Participant = { name: string; email: string };

// Helper: get all rituals where the user is owner OR participant
async function getUserRituals(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return { user: null, rituals: [] as (typeof ritualsTable.$inferSelect)[] };
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

  // Map email -> ritual info
  const map = new Map<string, {
    name: string;
    email: string;
    sharedCircleCount: number;
    firstCircleDate: Date;
    sharedRitualIds: number[];
  }>();

  for (const ritual of rituals) {
    const participants = (ritual.participants as Participant[]) ?? [];
    for (const p of participants) {
      if (!p.email || p.email === ownerEmail) continue;
      if (map.has(p.email)) {
        const existing = map.get(p.email)!;
        existing.sharedCircleCount++;
        existing.sharedRitualIds.push(ritual.id);
        if (ritual.createdAt < existing.firstCircleDate) {
          existing.firstCircleDate = ritual.createdAt;
        }
      } else {
        map.set(p.email, {
          name: p.name,
          email: p.email,
          sharedCircleCount: 1,
          firstCircleDate: ritual.createdAt,
          sharedRitualIds: [ritual.id],
        });
      }
    }
  }

  // Owner's shared moment IDs
  const ownerTokenRows = await db.select({ momentId: momentUserTokensTable.momentId })
    .from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.email, ownerEmail));
  const ownerMomentIds = ownerTokenRows.map(t => t.momentId);

  // Add practice-only people (not already in the map from rituals)
  if (ownerMomentIds.length > 0) {
    const practiceTokenRows = await db
      .select({ email: momentUserTokensTable.email, name: momentUserTokensTable.name })
      .from(momentUserTokensTable)
      .where(inArray(momentUserTokensTable.momentId, ownerMomentIds));
    for (const row of practiceTokenRows) {
      if (!row.email || row.email === ownerEmail) continue;
      if (!map.has(row.email)) {
        map.set(row.email, {
          name: row.name || row.email,
          email: row.email,
          sharedCircleCount: 0,
          firstCircleDate: new Date(),
          sharedRitualIds: [],
        });
      }
    }
  }

  // Build a set of all garden emails for prayer request lookup
  const allGardenEmails = Array.from(map.keys());

  // Batch-fetch active prayer requests with body text for all garden members
  const activePrayerMap = new Map<string, { id: number; body: string; createdAt: string }>();
  if (allGardenEmails.length > 0) {
    const gardenUsers = await db.select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.email, allGardenEmails));
    const gardenUserIds = gardenUsers.map(u => u.id);
    const emailByUserId = new Map(gardenUsers.map(u => [u.id, u.email]));
    if (gardenUserIds.length > 0) {
      const now = new Date();
      const activeRequests = await db.select({
        id: prayerRequestsTable.id,
        ownerId: prayerRequestsTable.ownerId,
        body: prayerRequestsTable.body,
        createdAt: prayerRequestsTable.createdAt,
      }).from(prayerRequestsTable).where(
        and(
          inArray(prayerRequestsTable.ownerId, gardenUserIds),
          eq(prayerRequestsTable.isAnswered, false),
          isNull(prayerRequestsTable.closedAt),
          or(isNull(prayerRequestsTable.expiresAt), gt(prayerRequestsTable.expiresAt, now)),
        )
      ).orderBy(desc(prayerRequestsTable.createdAt));
      for (const r of activeRequests) {
        const email = emailByUserId.get(r.ownerId);
        if (email && !activePrayerMap.has(email)) {
          activePrayerMap.set(email, { id: r.id, body: r.body, createdAt: r.createdAt.toISOString() });
        }
      }
    }
  }

  // Batch-fetch shared ritual names for all people
  const allRitualIds = new Set<number>();
  for (const p of map.values()) for (const rid of p.sharedRitualIds) allRitualIds.add(rid);
  const ritualNameMap = new Map<number, string>();
  if (allRitualIds.size > 0) {
    const ritualRows = await db.select({ id: ritualsTable.id, name: ritualsTable.name })
      .from(ritualsTable).where(inArray(ritualsTable.id, Array.from(allRitualIds)));
    for (const r of ritualRows) ritualNameMap.set(r.id, r.name);
  }

  // Batch-fetch most recent bloom window date per shared moment
  const lastBloomMap = new Map<number, string>();

  const peopleEnriched = await Promise.all(
    Array.from(map.values()).map(async (p) => {
      let maxStreak = 0;
      let score = 0;
      let sharedMomentIds: number[] = [];
      let sharedPractices: Array<{ id: number; name: string; currentStreak: number; templateType: string | null }> = [];
      let lastActiveDate: string | null = null;

      // Shared tradition names
      const sharedTraditions = p.sharedRitualIds
        .map(rid => ({ id: rid, name: ritualNameMap.get(rid) ?? "Tradition" }))
        .filter((v, i, a) => a.findIndex(x => x.id === v.id) === i);

      // Completed meetups across shared rituals
      if (p.sharedRitualIds.length > 0) {
        const completedRows = await db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(meetupsTable)
          .where(and(
            inArray(meetupsTable.ritualId, p.sharedRitualIds),
            eq(meetupsTable.status, "completed")
          ));
        score += completedRows[0]?.count ?? 0;
      }

      // Shared practices
      if (ownerMomentIds.length > 0) {
        const personTokenRows = await db.select({ momentId: momentUserTokensTable.momentId })
          .from(momentUserTokensTable)
          .where(eq(momentUserTokensTable.email, p.email));
        const personMomentIdSet = new Set(personTokenRows.map(t => t.momentId));
        sharedMomentIds = ownerMomentIds.filter(id => personMomentIdSet.has(id));

        if (sharedMomentIds.length > 0) {
          const sharedMoments = await db
            .select({
              id: sharedMomentsTable.id,
              name: sharedMomentsTable.name,
              currentStreak: sharedMomentsTable.currentStreak,
              templateType: sharedMomentsTable.templateType,
            })
            .from(sharedMomentsTable)
            .where(inArray(sharedMomentsTable.id, sharedMomentIds));
          maxStreak = Math.max(0, ...sharedMoments.map(m => m.currentStreak ?? 0));
          sharedPractices = sharedMoments.map(m => ({
            id: m.id,
            name: m.name,
            currentStreak: m.currentStreak ?? 0,
            templateType: m.templateType,
          }));

          // Bloom windows = shared practice sessions done together
          const bloomRows = await db
            .select({ count: sql<number>`cast(count(*) as int)` })
            .from(momentWindowsTable)
            .where(and(
              inArray(momentWindowsTable.momentId, sharedMomentIds),
              eq(momentWindowsTable.status, "bloom")
            ));
          score += bloomRows[0]?.count ?? 0;

          // Most recent bloom window for this person's shared practices
          const lastBloomRow = await db
            .select({ windowDate: momentWindowsTable.windowDate })
            .from(momentWindowsTable)
            .where(and(
              inArray(momentWindowsTable.momentId, sharedMomentIds),
              eq(momentWindowsTable.status, "bloom")
            ))
            .orderBy(desc(momentWindowsTable.windowDate))
            .limit(1);
          lastActiveDate = lastBloomRow[0]?.windowDate ?? null;
        }
      }

      const prayer = activePrayerMap.get(p.email) ?? null;

      return {
        name: p.name,
        email: p.email,
        sharedCircleCount: p.sharedCircleCount,
        firstCircleDate: p.firstCircleDate.toISOString(),
        maxSharedStreak: maxStreak,
        score,
        sharedPractices,
        sharedTraditions,
        lastActiveDate: lastActiveDate ?? p.firstCircleDate.toISOString(),
        activePrayerRequest: prayer,
      };
    })
  );

  res.json(peopleEnriched);
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
  const ownerTokenRows = await db.select({ momentId: momentUserTokensTable.momentId })
    .from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.email, ownerEmail));
  const ownerMomentIds = ownerTokenRows.map(t => t.momentId);

  let sharedPractices: Array<{
    id: number; name: string; currentStreak: number; longestStreak: number;
    totalBlooms: number; frequency: string; templateType: string | null; createdAt: string;
  }> = [];
  let sharedMomentIds: number[] = [];

  if (ownerMomentIds.length > 0) {
    const personTokenRows = await db.select({ momentId: momentUserTokensTable.momentId })
      .from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.email, email));
    const personMomentIdSet = new Set(personTokenRows.map(t => t.momentId));
    sharedMomentIds = ownerMomentIds.filter(id => personMomentIdSet.has(id));
    if (sharedMomentIds.length > 0) {
      const moments = await db.select({
        id: sharedMomentsTable.id,
        name: sharedMomentsTable.name,
        currentStreak: sharedMomentsTable.currentStreak,
        longestStreak: sharedMomentsTable.longestStreak,
        totalBlooms: sharedMomentsTable.totalBlooms,
        frequency: sharedMomentsTable.frequency,
        templateType: sharedMomentsTable.templateType,
        createdAt: sharedMomentsTable.createdAt,
      }).from(sharedMomentsTable).where(inArray(sharedMomentsTable.id, sharedMomentIds));

      // Compute live bloom counts per practice from windows table
      const bloomCountRows = await db
        .select({
          momentId: momentWindowsTable.momentId,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(momentWindowsTable)
        .where(and(
          inArray(momentWindowsTable.momentId, sharedMomentIds),
          eq(momentWindowsTable.status, "bloom")
        ))
        .groupBy(momentWindowsTable.momentId);
      const bloomCountMap = new Map(bloomCountRows.map(r => [r.momentId, r.count]));

      sharedPractices = moments.map(m => ({
        ...m,
        totalBlooms: bloomCountMap.get(m.id) ?? m.totalBlooms,
        createdAt: m.createdAt.toISOString(),
      }));
    }
  }

  if (sharedRituals.length === 0 && sharedPractices.length === 0) {
    res.status(404).json({ error: "Person not found in any of your traditions or practices" });
    return;
  }

  // Resolve display name
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

  // Aggregate stats
  const totalGatherings = enriched.reduce(
    (sum, { meetups }) => sum + meetups.filter(m => m.status === "completed").length,
    0
  );

  let totalBloomWindows = 0;
  if (sharedMomentIds.length > 0) {
    const bloomRows = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(momentWindowsTable)
      .where(and(
        inArray(momentWindowsTable.momentId, sharedMomentIds),
        eq(momentWindowsTable.status, "bloom")
      ));
    totalBloomWindows = bloomRows[0]?.count ?? 0;
  }

  const score = totalGatherings + totalBloomWindows;

  // Best current streak across all shared traditions + practices
  const currentBestStreak = Math.max(
    0,
    ...enriched.map(e => e.ritual.streak),
    ...sharedPractices.map(p => p.currentStreak)
  );
  // Best all-time streak (traditions only have current; practices have longestStreak)
  const longestEverStreak = Math.max(
    0,
    ...enriched.map(e => e.ritual.streak),
    ...sharedPractices.map(p => p.longestStreak)
  );

  const firstCircleDate = sharedRituals.length > 0
    ? new Date(Math.min(...sharedRituals.map(r => r.createdAt.getTime()))).toISOString()
    : null;

  // Fetch active prayer request for this person
  let activePrayerRequest: { id: number; body: string; createdAt: string; expiresAt: string | null } | null = null;
  const [personUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (personUser) {
    const now = new Date();
    const [req] = await db.select({
      id: prayerRequestsTable.id,
      body: prayerRequestsTable.body,
      createdAt: prayerRequestsTable.createdAt,
      expiresAt: prayerRequestsTable.expiresAt,
    }).from(prayerRequestsTable).where(
      and(
        eq(prayerRequestsTable.ownerId, personUser.id),
        eq(prayerRequestsTable.isAnswered, false),
        isNull(prayerRequestsTable.closedAt),
        or(isNull(prayerRequestsTable.expiresAt), gt(prayerRequestsTable.expiresAt, now)),
      )
    ).orderBy(desc(prayerRequestsTable.createdAt)).limit(1);
    if (req) {
      activePrayerRequest = {
        id: req.id,
        body: req.body,
        createdAt: req.createdAt.toISOString(),
        expiresAt: req.expiresAt?.toISOString() ?? null,
      };
    }
  }

  res.json({
    name: personName,
    email,
    stats: {
      sharedCircleCount: sharedRituals.length,
      sharedPracticesCount: sharedPractices.length,
      totalGatherings,
      totalBloomWindows,
      score,
      currentBestStreak,
      longestEverStreak,
      firstCircleDate,
    },
    sharedRituals: enriched,
    sharedPractices,
    activePrayerRequest,
  });
});

export default router;
