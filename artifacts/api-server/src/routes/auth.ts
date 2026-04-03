import { getFrontendUrl } from "../lib/urls";
import { Router, type IRouter } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import { google } from "googleapis";
import { db, usersTable, emailLoginTokensTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { randomBytes } from "crypto";
import { sendMagicLinkEmail } from "../lib/email";

const router: IRouter = Router();

const GOOGLE_CONFIGURED =
  !!process.env["GOOGLE_CLIENT_ID"] && !!process.env["GOOGLE_CLIENT_SECRET"];

if (process.env["NODE_ENV"] === "production" && !process.env["GOOGLE_REDIRECT_URI"]) {
  throw new Error("GOOGLE_REDIRECT_URI must be set in production");
}
const callbackURL = process.env["GOOGLE_REDIRECT_URI"] ?? "http://localhost:3001/api/auth/google/callback";
const frontendURL = getFrontendUrl();

if (GOOGLE_CONFIGURED) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env["GOOGLE_CLIENT_ID"]!,
        clientSecret: process.env["GOOGLE_CLIENT_SECRET"]!,
        callbackURL,
        scope: ["profile", "email"],
      },
      async (
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: (err: Error | null, user?: Express.User) => void
      ) => {
        try {
          const email = profile.emails?.[0]?.value ?? "";
          const name = profile.displayName ?? email;
          const avatarUrl = profile.photos?.[0]?.value ?? null;
          const googleId = profile.id;

          // Calendar tokens no longer stored per-user — scheduler account handles all events.
          const existing = await db.select().from(usersTable).where(eq(usersTable.googleId, googleId));
          if (existing.length > 0) {
            const prev = existing[0];
            const [user] = await db
              .update(usersTable)
              .set({ avatarUrl })
              .where(eq(usersTable.id, prev.id))
              .returning();
            return done(null, user);
          }

          const byEmail = await db.select().from(usersTable).where(eq(usersTable.email, email));
          if (byEmail.length > 0) {
            const [user] = await db
              .update(usersTable)
              .set({ googleId, avatarUrl })
              .where(eq(usersTable.id, byEmail[0].id))
              .returning();
            return done(null, user);
          }

          const [user] = await db
            .insert(usersTable)
            .values({ name, email, avatarUrl, googleId })
            .returning();
          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );
}

passport.serializeUser((user: Express.User, done) => {
  done(null, (user as { id: number }).id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    done(null, user ?? null);
  } catch (err) {
    done(err);
  }
});

router.get("/auth/google", (_req, res, next) => {
  if (!GOOGLE_CONFIGURED) {
    res.status(503).send("Google Sign-In is not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
    return;
  }
  passport.authenticate("google", { accessType: "offline" })(res.req, res, next);
});

router.get(
  "/auth/google/callback",
  (req, res, next) => {
    if (!GOOGLE_CONFIGURED) { res.redirect("/?error=auth_failed"); return; }
    passport.authenticate("google", { failureRedirect: `${frontendURL}/?error=auth_failed` })(req, res, next);
  },
  (req, res) => {
    // Explicitly save session before redirect to avoid race condition
    req.session.save(() => {
      res.redirect(`${frontendURL}/dashboard`);
    });
  }
);

// ─── Scheduler account setup (one-time) ──────────────────────────────────────
// Visit /api/auth/scheduler/setup to authorize eleanorscheduler@gmail.com
// and get the refresh token to store as SCHEDULER_GOOGLE_REFRESH_TOKEN env var.
const schedulerCallbackURL = callbackURL.replace("/auth/google/callback", "/auth/scheduler/callback");

router.get("/auth/scheduler/setup", (_req, res) => {
  if (!GOOGLE_CONFIGURED) {
    res.status(503).send("Google OAuth not configured."); return;
  }
  const oauth2 = new google.auth.OAuth2(
    process.env["GOOGLE_CLIENT_ID"]!,
    process.env["GOOGLE_CLIENT_SECRET"]!,
    schedulerCallbackURL
  );
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/gmail.send",
    ],
  });
  res.redirect(url);
});

router.get("/auth/scheduler/callback", async (req, res): Promise<void> => {
  const code = req.query.code as string;
  if (!code) { res.status(400).send("No code returned from Google."); return; }

  try {
    const oauth2 = new google.auth.OAuth2(
      process.env["GOOGLE_CLIENT_ID"]!,
      process.env["GOOGLE_CLIENT_SECRET"]!,
      callbackURL.replace("/auth/google/callback", "/auth/scheduler/callback")
    );
    const { tokens } = await oauth2.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      res.status(400).send("No refresh token returned. Make sure you revoked previous access at https://myaccount.google.com/permissions and try again.");
      return;
    }

    res.send(`
      <html><body style="font-family: system-ui; padding: 2rem; max-width: 600px; margin: 0 auto;">
        <h2>✅ Scheduler account authorized</h2>
        <p>Set this as your <code>SCHEDULER_GOOGLE_REFRESH_TOKEN</code> environment variable on Railway:</p>
        <pre style="background: #f5f5f5; padding: 1rem; border-radius: 8px; word-break: break-all; font-size: 14px;">${refreshToken}</pre>
        <p style="color: #666; font-size: 14px;">Once set, Eleanor will send all calendar invites from this scheduler account.</p>
      </body></html>
    `);
  } catch (err) {
    console.error("Scheduler OAuth callback error:", err);
    res.status(500).send("Failed to exchange code for tokens.");
  }
});

router.get("/auth/me", (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const u = req.user as {
    id: number; name: string; email: string; avatarUrl: string | null;
    googleId: string | null; showPresence: boolean;
  };
  res.json({
    id: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl,
    googleId: u.googleId,
    showPresence: u.showPresence,
  });
});

router.patch("/auth/me/presence", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const { showPresence } = req.body;
  if (typeof showPresence !== "boolean") {
    res.status(400).json({ error: "showPresence must be a boolean" });
    return;
  }
  await db.update(usersTable).set({ showPresence } as Record<string, unknown>).where(eq(usersTable.id, userId));
  res.json({ showPresence });
});

router.post("/auth/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });
});

// ─── Magic link (email) login ─────────────────────────────────────────────────

// POST /api/auth/email/request
// Body: { email, name? }
// Checks if user exists; if not requires name. Sends magic link email.
router.post("/auth/email/request", async (req, res): Promise<void> => {
  const { email, name } = req.body as { email?: string; name?: string };

  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check if user already exists
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));

  if (!existing) {
    // New user — name is required
    if (!name || typeof name !== "string" || name.trim().length < 1) {
      res.json({ needsName: true });
      return;
    }
  }

  // Generate a secure random token
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Invalidate any existing unused tokens for this email first
  await db
    .delete(emailLoginTokensTable)
    .where(eq(emailLoginTokensTable.email, normalizedEmail));

  // Insert new token (store name so we can create the user on verify)
  const storedName = name?.trim() ?? existing?.name ?? normalizedEmail.split("@")[0];
  await db.insert(emailLoginTokensTable).values({
    email: normalizedEmail,
    name: storedName,
    token,
    expiresAt,
  });

  const apiBase = callbackURL.replace("/api/auth/google/callback", "");
  const magicLink = `${apiBase}/api/auth/email/verify?token=${token}`;

  const sent = await sendMagicLinkEmail(normalizedEmail, magicLink, !existing);

  if (!sent) {
    // In dev, log the link so it's usable without email
    console.log(`[DEV] Magic link for ${normalizedEmail}: ${magicLink}`);
  }

  res.json({ ok: true, sent });
});

// GET /api/auth/email/verify?token=xxx
router.get("/auth/email/verify", async (req, res): Promise<void> => {
  const token = req.query.token as string;

  if (!token) {
    res.redirect(`${frontendURL}/?error=invalid_link`);
    return;
  }

  const now = new Date();
  const [row] = await db
    .select()
    .from(emailLoginTokensTable)
    .where(
      and(
        eq(emailLoginTokensTable.token, token),
        gt(emailLoginTokensTable.expiresAt, now)
      )
    );

  if (!row || row.usedAt) {
    res.redirect(`${frontendURL}/?error=link_expired`);
    return;
  }

  // Mark token as used
  await db
    .update(emailLoginTokensTable)
    .set({ usedAt: now })
    .where(eq(emailLoginTokensTable.id, row.id));

  const normalizedEmail = row.email;

  // Find or create the user
  let [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));

  if (!user) {
    const rawName = row.name ?? normalizedEmail.split("@")[0];
    const capitalized = rawName.charAt(0).toUpperCase() + rawName.slice(1);

    [user] = await db
      .insert(usersTable)
      .values({ email: normalizedEmail, name: capitalized })
      .returning();
  }

  // Log in
  req.login(user, (err) => {
    if (err) {
      console.error("Login after magic link failed:", err);
      res.redirect(`${frontendURL}/?error=auth_failed`);
      return;
    }
    req.session.save(() => {
      res.redirect(`${frontendURL}/dashboard`);
    });
  });
});

export { passport };
export default router;
