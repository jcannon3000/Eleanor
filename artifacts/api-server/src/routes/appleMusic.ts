import { Router } from "express";
import { pool } from "@workspace/db";
import { z } from "zod";
import { generateDeveloperToken } from "../lib/appleMusic";
import { logger } from "../lib/logger";

const router = Router();

// GET /api/apple-music/developer-token
router.get("/apple-music/developer-token", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const token = generateDeveloperToken();
    res.json({ token });
  } catch (err) {
    logger.error({ err }, "Failed to generate Apple Music developer token");
    res.status(500).json({ error: "Apple Music not configured" });
  }
});

// GET /api/apple-music/status
router.get("/apple-music/status", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const client = await pool.connect();
  try {
    const { rows } = await client.query<{
      apple_music_user_token: string | null;
      apple_music_last_polled: string | null;
    }>(
      `SELECT apple_music_user_token, apple_music_last_polled FROM users WHERE id = $1`,
      [sessionUserId]
    );
    const row = rows[0];
    res.json({
      connected: !!row?.apple_music_user_token,
      lastPolled: row?.apple_music_last_polled ?? null,
    });
  } finally {
    client.release();
  }
});

// POST /api/apple-music/connect
const ConnectSchema = z.object({ musicUserToken: z.string().min(1) });

router.post("/apple-music/connect", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = ConnectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE users SET apple_music_user_token = $1, apple_music_snapshot = NULL, apple_music_last_polled = NULL WHERE id = $2`,
      [parsed.data.musicUserToken, sessionUserId]
    );
    res.json({ ok: true });
  } finally {
    client.release();
  }
});

// DELETE /api/apple-music/disconnect
router.delete("/apple-music/disconnect", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE users SET apple_music_user_token = NULL, apple_music_snapshot = NULL, apple_music_last_polled = NULL WHERE id = $1`,
      [sessionUserId]
    );
    res.json({ ok: true });
  } finally {
    client.release();
  }
});

export default router;
