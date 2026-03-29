import { google } from "googleapis";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env["GOOGLE_CLIENT_ID"],
    process.env["GOOGLE_CLIENT_SECRET"],
    process.env["GOOGLE_REDIRECT_URI"]
  );
}

async function getAuthedClient(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || !user.googleAccessToken) return null;

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
    expiry_date: user.googleTokenExpiry ? user.googleTokenExpiry.getTime() : undefined,
  });

  oauth2Client.on("tokens", async (tokens) => {
    const update: Record<string, unknown> = {};
    if (tokens.access_token) update.googleAccessToken = tokens.access_token;
    if (tokens.expiry_date) update.googleTokenExpiry = new Date(tokens.expiry_date);
    if (Object.keys(update).length > 0) {
      await db.update(usersTable).set(update).where(eq(usersTable.id, userId));
    }
  });

  return oauth2Client;
}

export async function createCalendarEvent(
  userId: number,
  opts: { summary: string; description?: string; startDate: Date; endDate?: Date }
): Promise<string | null> {
  const auth = await getAuthedClient(userId);
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  const start = opts.startDate;
  const end = opts.endDate ?? new Date(start.getTime() + 60 * 60 * 1000);

  try {
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: opts.summary,
        description: opts.description,
        start: { dateTime: start.toISOString(), timeZone: "UTC" },
        end: { dateTime: end.toISOString(), timeZone: "UTC" },
        reminders: { useDefault: true },
      },
    });
    return event.data.id ?? null;
  } catch (err) {
    console.error("Calendar event create failed:", err);
    return null;
  }
}

export async function deleteCalendarEvent(userId: number, eventId: string): Promise<void> {
  const auth = await getAuthedClient(userId);
  if (!auth) return;

  const calendar = google.calendar({ version: "v3", auth });
  try {
    await calendar.events.delete({ calendarId: "primary", eventId });
  } catch (err) {
    console.error("Calendar event delete failed:", err);
  }
}
