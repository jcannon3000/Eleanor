import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, ritualsTable, usersTable, momentUserTokensTable } from "@workspace/db";
import { searchContacts } from "../lib/calendar";

const router: IRouter = Router();

router.get("/contacts/search", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const q = String(req.query.q ?? "").trim();
  if (!q || q.length < 1) {
    res.json([]);
    return;
  }

  const userId = (req.user as { id: number }).id;
  const lq = q.toLowerCase();

  // ── 1. Google Contacts (may be empty if user hasn't connected) ────────────
  const googleResults = await searchContacts(userId, q);

  // ── 2. Members from existing traditions (rituals) ─────────────────────────
  const rituals = await db.select({ participants: ritualsTable.participants })
    .from(ritualsTable)
    .where(eq(ritualsTable.ownerId, userId));

  const ritualMembers: Array<{ name: string; email: string }> = [];
  for (const r of rituals) {
    const parts = (r.participants as Array<{ name: string; email: string }>) ?? [];
    for (const p of parts) {
      if (p.email) ritualMembers.push({ name: p.name ?? p.email, email: p.email });
    }
  }

  // ── 3. Members from existing practices (moments) ──────────────────────────
  const [userRow] = await db.select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  const momentMembers: Array<{ name: string; email: string }> = [];
  if (userRow?.email) {
    const tokenRows = await db.select({ momentId: momentUserTokensTable.momentId })
      .from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.email, userRow.email));

    const momentIds = [...new Set(tokenRows.map(r => r.momentId))];
    if (momentIds.length > 0) {
      const allMembers = await db.select({ name: momentUserTokensTable.name, email: momentUserTokensTable.email })
        .from(momentUserTokensTable)
        .where(inArray(momentUserTokensTable.momentId, momentIds));

      for (const m of allMembers) {
        if (m.email && m.email !== userRow.email) {
          momentMembers.push({ name: m.name ?? m.email, email: m.email });
        }
      }
    }
  }

  // ── 4. Merge, deduplicate, and filter by query ────────────────────────────
  const seen = new Set<string>();
  const merged: Array<{ name: string; email: string }> = [];

  const addIfMatch = (p: { name: string; email: string }) => {
    const emailLower = p.email.toLowerCase();
    if (seen.has(emailLower)) return;
    if (emailLower.includes(lq) || (p.name ?? "").toLowerCase().includes(lq)) {
      seen.add(emailLower);
      merged.push(p);
    }
  };

  // Google results first (highest relevance), then ritual members, then moment members
  for (const p of googleResults) addIfMatch(p);
  for (const p of ritualMembers) addIfMatch(p);
  for (const p of momentMembers) addIfMatch(p);

  res.json(merged.slice(0, 15));
});

export default router;
