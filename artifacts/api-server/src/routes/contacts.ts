import { Router, type IRouter } from "express";
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
  const results = await searchContacts(userId, q);
  res.json(results);
});

export default router;
