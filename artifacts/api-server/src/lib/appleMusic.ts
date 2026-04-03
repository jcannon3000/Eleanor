import { createSign } from "crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";

const TEAM_ID = process.env["APPLE_MUSIC_TEAM_ID"] ?? "";
const KEY_ID = process.env["APPLE_MUSIC_KEY_ID"] ?? "";
const PRIVATE_KEY = Buffer.from(
  process.env["APPLE_MUSIC_PRIVATE_KEY_B64"] ?? "",
  "base64"
).toString("utf8");

// ─── Developer Token (JWT) ────────────────────────────────────────────────────

export function generateDeveloperToken(): string {
  if (!TEAM_ID || !KEY_ID || !PRIVATE_KEY) {
    throw new Error("Apple Music credentials not configured");
  }
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 15777000; // ~6 months

  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: KEY_ID })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: TEAM_ID, iat: now, exp })).toString("base64url");
  const signingInput = `${header}.${payload}`;

  const sig = createSign("SHA256")
    .update(signingInput)
    .sign({ key: PRIVATE_KEY, dsaEncoding: "ieee-p1363" });

  return `${signingInput}.${sig.toString("base64url")}`;
}

// ─── Apple Music API ──────────────────────────────────────────────────────────

type AppleTrack = {
  id: string;
  attributes: {
    name: string;
    artistName: string;
    albumName: string;
  };
};

async function fetchRecentTracks(userToken: string, devToken: string): Promise<AppleTrack[]> {
  const tracks: AppleTrack[] = [];
  for (const offset of [0, 10, 20, 30, 40]) {
    const res = await fetch(
      `https://api.music.apple.com/v1/me/recent/played/tracks?limit=10&offset=${offset}&types=songs`,
      {
        headers: {
          Authorization: `Bearer ${devToken}`,
          "Music-User-Token": userToken,
        },
      }
    );
    if (!res.ok) break;
    const data = await res.json() as { data?: AppleTrack[] };
    if (!data.data || data.data.length === 0) break;
    tracks.push(...data.data);
  }
  return tracks;
}

// ─── Matching ─────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

function trackMatches(
  track: AppleTrack,
  listeningType: string,
  listeningTitle: string | null,
  listeningArtist: string | null,
): boolean {
  const tName = norm(track.attributes.name);
  const tArtist = norm(track.attributes.artistName);
  const tAlbum = norm(track.attributes.albumName);
  const pTitle = norm(listeningTitle ?? "");
  const pArtist = norm(listeningArtist ?? "");

  if (listeningType === "song") {
    return pTitle ? tName.includes(pTitle) && (pArtist ? tArtist.includes(pArtist) : true) : false;
  }
  if (listeningType === "album") {
    return pTitle ? tAlbum.includes(pTitle) && (pArtist ? tArtist.includes(pArtist) : true) : false;
  }
  if (listeningType === "artist") {
    return pArtist ? tArtist.includes(pArtist) : (pTitle ? tArtist.includes(pTitle) : false);
  }
  return false;
}

// ─── Polling ──────────────────────────────────────────────────────────────────

export async function pollAllListeningPractices(): Promise<void> {
  const client = await pool.connect();
  try {
    let devToken: string;
    try {
      devToken = generateDeveloperToken();
    } catch (err) {
      logger.warn({ err }, "Apple Music polling skipped — credentials not configured");
      return;
    }

    const { rows: users } = await client.query<{
      id: number;
      email: string;
      apple_music_user_token: string;
      apple_music_snapshot: string | null;
    }>(
      `SELECT id, email, apple_music_user_token, apple_music_snapshot
       FROM users WHERE apple_music_user_token IS NOT NULL`
    );

    for (const user of users) {
      try {
        const tracks = await fetchRecentTracks(user.apple_music_user_token, devToken);
        if (tracks.length === 0) continue;

        const currentIds = tracks.map(t => t.id);
        const previousIds = new Set<string>(
          user.apple_music_snapshot ? (JSON.parse(user.apple_music_snapshot) as string[]) : []
        );

        // New tracks = in current but not in previous snapshot
        const newTracks = tracks.filter(t => !previousIds.has(t.id));

        if (newTracks.length > 0) {
          const { rows: practices } = await client.query<{
            moment_id: number;
            user_token: string;
            guest_name: string;
            listening_type: string;
            listening_title: string | null;
            listening_artist: string | null;
            timezone: string;
          }>(
            `SELECT mut.moment_id, mut.user_token,
                    COALESCE(mut.name, mut.email) AS guest_name,
                    sm.listening_type, sm.listening_title, sm.listening_artist,
                    COALESCE(sm.timezone, 'UTC') AS timezone
             FROM moment_user_tokens mut
             JOIN shared_moments sm ON sm.id = mut.moment_id
             WHERE mut.email = $1
               AND sm.template_type = 'listening'
               AND sm.state = 'active'`,
            [user.email]
          );

          for (const practice of practices) {
            const matchedTrack = newTracks.find(t =>
              trackMatches(t, practice.listening_type, practice.listening_title, practice.listening_artist)
            );
            if (!matchedTrack) continue;

            // Today's date in the practice's timezone
            const todayDate = new Date().toLocaleDateString("en-CA", { timeZone: practice.timezone });

            // Check if already logged today
            const { rows: existing } = await client.query(
              `SELECT id FROM moment_posts WHERE moment_id = $1 AND user_token = $2 AND window_date = $3`,
              [practice.moment_id, practice.user_token, todayDate]
            );
            if (existing.length > 0) continue;

            // Auto-log with track info
            const trackLabel = `${matchedTrack.attributes.name} — ${matchedTrack.attributes.artistName}`;
            await client.query(
              `INSERT INTO moment_posts (moment_id, window_date, user_token, guest_name, is_checkin, reflection_text, created_at)
               VALUES ($1, $2, $3, $4, 1, $5, NOW())`,
              [practice.moment_id, todayDate, practice.user_token, practice.guest_name, trackLabel]
            );

            // Update or insert window
            const { rows: win } = await client.query(
              `SELECT id FROM moment_windows WHERE moment_id = $1 AND window_date = $2`,
              [practice.moment_id, todayDate]
            );
            if (win.length === 0) {
              await client.query(
                `INSERT INTO moment_windows (moment_id, window_date, status, post_count, created_at)
                 VALUES ($1, $2, 'open', 1, NOW())`,
                [practice.moment_id, todayDate]
              );
            } else {
              await client.query(
                `UPDATE moment_windows SET post_count = post_count + 1 WHERE moment_id = $1 AND window_date = $2`,
                [practice.moment_id, todayDate]
              );
            }

            logger.info(
              { userId: user.id, momentId: practice.moment_id },
              "Apple Music auto-logged listening practice"
            );
          }
        }

        // Update snapshot
        await client.query(
          `UPDATE users SET apple_music_snapshot = $1, apple_music_last_polled = NOW() WHERE id = $2`,
          [JSON.stringify(currentIds), user.id]
        );
      } catch (err) {
        logger.error({ err, userId: user.id }, "Error polling Apple Music for user");
      }
    }
  } finally {
    client.release();
  }
}

// ─── Start poller (called once on server boot) ────────────────────────────────

export function startAppleMusicPoller(): void {
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  pollAllListeningPractices().catch(err =>
    logger.error({ err }, "Initial Apple Music poll failed")
  );

  setInterval(() => {
    pollAllListeningPractices().catch(err =>
      logger.error({ err }, "Apple Music poll failed")
    );
  }, SIX_HOURS);

  logger.info("Apple Music poller started (every 6 hours)");
}
