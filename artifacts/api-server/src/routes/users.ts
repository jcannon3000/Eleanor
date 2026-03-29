import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { UpsertUserBody, GetUserResponse, UpsertUserResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/users/me", async (req, res): Promise<void> => {
  const email = req.query.email as string | undefined;
  if (!email) {
    res.status(400).json({ error: "email query param required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(GetUserResponse.parse(user));
});

router.put("/users/me", async (req, res): Promise<void> => {
  const parsed = UpsertUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email));
  if (existing) {
    const [updated] = await db
      .update(usersTable)
      .set({ name: parsed.data.name })
      .where(eq(usersTable.email, parsed.data.email))
      .returning();
    res.json(UpsertUserResponse.parse(updated));
    return;
  }

  const [created] = await db.insert(usersTable).values(parsed.data).returning();
  res.json(UpsertUserResponse.parse(created));
});

export default router;
