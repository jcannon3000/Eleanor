import { Router, type IRouter } from "express";
import { eq, desc, inArray, or, sql, and } from "drizzle-orm";
import { db, prayerRequestsTable, prayerResponsesTable, usersTable, ritualsTable, momentUserTokensTable } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

// Get garden connection user IDs for a user (people who share a tradition or practice)
async function getGardenUserIds(userId: number): Promise<number[]> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return [];

  // People from traditions
  const rituals = await db.select().from(ritualsTable).where(
    or(
      eq(ritualsTable.ownerId, userId),
      sql`${ritualsTable.participants} @> ${JSON.stringify([{ email: user.email }])}::jsonb`
    )
  );
  const participantEmails = new Set<string>();
  for (const r of rituals) {
    const parts = (r.participants as { email: string }[]) ?? [];
    for (const p of parts) {
      if (p.email && p.email !== user.email) participantEmails.add(p.email);
    }
    // Also add owner's email if not self
    const ownerRow = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, r.ownerId)).limit(1);
    if (ownerRow[0]?.email && ownerRow[0].email !== user.email) participantEmails.add(ownerRow[0].email);
  }

  // People from practices
  const myTokens = await db.select({ momentId: momentUserTokensTable.momentId })
    .from(momentUserTokensTable).where(eq(momentUserTokensTable.email, user.email));
  if (myTokens.length > 0) {
    const momentIds = myTokens.map(t => t.momentId);
    const otherTokens = await db.select({ email: momentUserTokensTable.email })
      .from(momentUserTokensTable).where(inArray(momentUserTokensTable.momentId, momentIds));
    for (const t of otherTokens) {
      if (t.email && t.email !== user.email) participantEmails.add(t.email);
    }
  }

  if (participantEmails.size === 0) return [];
  const gardenUsers = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.email, Array.from(participantEmails)));
  return gardenUsers.map(u => u.id);
}

// GET /api/prayer-requests — list prayer requests visible to me (mine + garden)
router.get("/prayer-requests", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const gardenIds = await getGardenUserIds(sessionUserId);
  const visibleOwnerIds = [sessionUserId, ...gardenIds];

  const requests = await db.select().from(prayerRequestsTable)
    .where(inArray(prayerRequestsTable.ownerId, visibleOwnerIds))
    .orderBy(desc(prayerRequestsTable.createdAt));

  // Enrich with owner name, response count, and whether I'm responding
  const enriched = await Promise.all(requests.map(async (r) => {
    const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, r.ownerId));
    const responses = await db.select().from(prayerResponsesTable).where(eq(prayerResponsesTable.requestId, r.id));
    const myResponse = responses.find(resp => resp.userId === sessionUserId);
    return {
      ...r,
      ownerName: owner?.name ?? "Someone",
      isOwnRequest: r.ownerId === sessionUserId,
      prayerCount: responses.length,
      iPrayed: !!myResponse,
    };
  }));

  res.json(enriched);
});

// POST /api/prayer-requests — create a request
router.post("/prayer-requests", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const schema = z.object({ body: z.string().min(1).max(1000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [created] = await db.insert(prayerRequestsTable)
    .values({ ownerId: sessionUserId, body: parsed.data.body })
    .returning();
  res.status(201).json(created);
});

// POST /api/prayer-requests/:id/pray — toggle my "I'm praying" response
router.post("/prayer-requests/:id/pray", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(prayerResponsesTable)
    .where(and(eq(prayerResponsesTable.requestId, id), eq(prayerResponsesTable.userId, sessionUserId)));

  if (existing) {
    await db.delete(prayerResponsesTable).where(eq(prayerResponsesTable.id, existing.id));
    res.json({ iPrayed: false });
  } else {
    await db.insert(prayerResponsesTable).values({ requestId: id, userId: sessionUserId });
    res.json({ iPrayed: true });
  }
});

// PATCH /api/prayer-requests/:id/answer — mark as answered (owner only)
router.patch("/prayer-requests/:id/answer", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [updated] = await db.update(prayerRequestsTable)
    .set({ isAnswered: true, answeredAt: new Date() })
    .where(eq(prayerRequestsTable.id, id))
    .returning();
  res.json(updated);
});

// DELETE /api/prayer-requests/:id — delete (owner only)
router.delete("/prayer-requests/:id", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  res.sendStatus(204);
});

export default router;
