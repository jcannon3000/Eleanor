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

// POST /api/apple-music/check-now/:momentId — on-demand check for all members of a listening practice
router.post("/apple-music/check-now/:momentId", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const momentId = parseInt(req.params["momentId"] ?? "", 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const client = await pool.connect();
  try {
    // Verify practice is a listening practice
    const { rows: [practice] } = await client.query<{
      id: number; template_type: string; listening_type: string; listening_title: string | null;
      listening_artist: string | null; timezone: string; state: string;
    }>(`SELECT id, template_type, listening_type, listening_title, listening_artist, COALESCE(timezone,'UTC') AS timezone, state
        FROM shared_moments WHERE id = $1`, [momentId]);
    if (!practice || practice.template_type !== "listening") {
      res.status(400).json({ error: "Not a listening practice" }); return;
    }

    let devToken: string;
    try { devToken = generateDeveloperToken(); } catch {
      res.status(500).json({ error: "Apple Music not configured" }); return;
    }

    // Get all members of this practice who have Apple Music connected
    const { rows: members } = await client.query<{
      user_token: string; email: string; guest_name: string;
      apple_music_user_token: string; apple_music_snapshot: string | null; user_id: number;
    }>(`SELECT mut.user_token, mut.email, COALESCE(mut.name, mut.email) AS guest_name,
               u.apple_music_user_token, u.apple_music_snapshot, u.id AS user_id
        FROM moment_user_tokens mut
        JOIN users u ON u.email = mut.email
        WHERE mut.moment_id = $1 AND u.apple_music_user_token IS NOT NULL`, [momentId]);

    const todayDate = new Date().toLocaleDateString("en-CA", { timeZone: practice.timezone });
    let newLogs = 0;

    for (const member of members) {
      // Already logged today?
      const { rows: existing } = await client.query(
        `SELECT id FROM moment_posts WHERE moment_id = $1 AND user_token = $2 AND window_date = $3`,
        [momentId, member.user_token, todayDate]
      );
      if (existing.length > 0) continue;

      // Fetch their recently played
      try {
        const tracks: Array<{ id: string; attributes: { name: string; artistName: string; albumName: string } }> = [];
        for (const offset of [0, 10, 20, 30, 40]) {
          const r = await fetch(
            `https://api.music.apple.com/v1/me/recent/played/tracks?limit=10&offset=${offset}&types=songs`,
            { headers: { Authorization: `Bearer ${devToken}`, "Music-User-Token": member.apple_music_user_token } }
          );
          if (!r.ok) break;
          const d = await r.json() as { data?: typeof tracks };
          if (!d.data || d.data.length === 0) break;
          tracks.push(...d.data);
        }

        // Diff against snapshot — new tracks
        const prevIds = new Set<string>(member.apple_music_snapshot ? (JSON.parse(member.apple_music_snapshot) as string[]) : []);
        const newTracks = tracks.filter(t => !prevIds.has(t.id));

        // Check if any match
        const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, "").trim();
        const pTitle = norm(practice.listening_title ?? "");
        const pArtist = norm(practice.listening_artist ?? "");

        const matched = newTracks.some(t => {
          const tName = norm(t.attributes.name);
          const tArtist = norm(t.attributes.artistName);
          const tAlbum = norm(t.attributes.albumName);
          if (practice.listening_type === "song") return pTitle && tName.includes(pTitle) && (pArtist ? tArtist.includes(pArtist) : true);
          if (practice.listening_type === "album") return pTitle && tAlbum.includes(pTitle) && (pArtist ? tArtist.includes(pArtist) : true);
          if (practice.listening_type === "artist") return pArtist ? tArtist.includes(pArtist) : (pTitle ? tArtist.includes(pTitle) : false);
          return false;
        });

        if (matched) {
          await client.query(
            `INSERT INTO moment_posts (moment_id, window_date, user_token, guest_name, is_checkin, created_at)
             VALUES ($1, $2, $3, $4, 1, NOW())`,
            [momentId, todayDate, member.user_token, member.guest_name]
          );
          const { rows: win } = await client.query(
            `SELECT id FROM moment_windows WHERE moment_id = $1 AND window_date = $2`,
            [momentId, todayDate]
          );
          if (win.length === 0) {
            await client.query(
              `INSERT INTO moment_windows (moment_id, window_date, status, post_count, created_at) VALUES ($1, $2, 'open', 1, NOW())`,
              [momentId, todayDate]
            );
          } else {
            await client.query(
              `UPDATE moment_windows SET post_count = post_count + 1 WHERE moment_id = $1 AND window_date = $2`,
              [momentId, todayDate]
            );
          }
          newLogs++;
          logger.info({ userId: member.user_id, momentId }, "On-demand Apple Music check: auto-logged");
        }

        // Update snapshot
        await client.query(
          `UPDATE users SET apple_music_snapshot = $1, apple_music_last_polled = NOW() WHERE id = $2`,
          [JSON.stringify(tracks.map(t => t.id)), member.user_id]
        );
      } catch (err) {
        logger.error({ err, userId: member.user_id }, "On-demand Apple Music check failed for member");
      }
    }

    res.json({ checked: members.length, newLogs });
  } finally {
    client.release();
  }
});

// GET /api/apple-music/search?term=...&types=songs,albums,artists
router.get("/apple-music/search", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const term = (req.query["term"] as string ?? "").trim();
  const types = (req.query["types"] as string) ?? "songs";
  if (!term) { res.json({ results: [] }); return; }

  try {
    const devToken = generateDeveloperToken();
    const url = `https://api.music.apple.com/v1/catalog/us/search?term=${encodeURIComponent(term)}&types=${types}&limit=8`;
    const appleRes = await fetch(url, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    if (!appleRes.ok) {
      logger.error({ status: appleRes.status }, "Apple Music search failed");
      res.status(502).json({ error: "Apple Music search failed" });
      return;
    }
    const data = await appleRes.json() as Record<string, unknown>;
    res.json(data);
  } catch (err) {
    logger.error({ err }, "Apple Music search error");
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
