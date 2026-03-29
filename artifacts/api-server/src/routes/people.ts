import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, ritualsTable, meetupsTable, usersTable } from "@workspace/db";
import { computeStreak } from "../lib/streak";

const router: IRouter = Router();

type Participant = { name: string; email: string };

// GET /api/people?ownerId=N
// Returns all unique people from the owner's rituals (excluding themselves)
router.get("/people", async (req, res): Promise<void> => {
  const ownerId = parseInt(String(req.query.ownerId ?? ""), 10);
  if (isNaN(ownerId)) {
    res.status(400).json({ error: "ownerId is required" });
    return;
  }

  const [owner, rituals] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, ownerId)).then(r => r[0]),
    db.select().from(ritualsTable).where(eq(ritualsTable.ownerId, ownerId)),
  ]);

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

  const people = Array.from(map.values()).map(p => ({
    ...p,
    firstCircleDate: p.firstCircleDate.toISOString(),
  }));

  res.json(people);
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

  const allRituals = await db.select().from(ritualsTable).where(eq(ritualsTable.ownerId, ownerId));

  const sharedRituals = allRituals.filter(r => {
    const participants = (r.participants as Participant[]) ?? [];
    return participants.some(p => p.email === email);
  });

  if (sharedRituals.length === 0) {
    res.status(404).json({ error: "Person not found in any of your circles" });
    return;
  }

  // Resolve display name from rituals
  let personName = email;
  for (const ritual of sharedRituals) {
    const match = (ritual.participants as Participant[]).find(p => p.email === email);
    if (match?.name) { personName = match.name; break; }
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
  });
});

export default router;
