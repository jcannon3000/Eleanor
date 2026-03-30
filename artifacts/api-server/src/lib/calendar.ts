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
  opts: {
    summary: string;
    description?: string;
    location?: string;
    startDate: Date;
    startLocalStr?: string; // "2026-03-31T08:00:00" — preferred for tz-aware scheduling
    endDate?: Date;
    endLocalStr?: string;   // "2026-03-31T09:00:00"
    attendees?: string[];
    recurrence?: string[];
    timeZone?: string;      // e.g. "America/New_York"
  }
): Promise<string | null> {
  const auth = await getAuthedClient(userId);
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  const start = opts.startDate;
  const end = opts.endDate ?? new Date(start.getTime() + 60 * 60 * 1000);

  const useLocalTime = !!(opts.startLocalStr && opts.timeZone);
  const tz = opts.timeZone ?? "UTC";

  const attendeeList = opts.attendees?.map(email => ({ email })) ?? [];

  try {
    const event = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: attendeeList.length > 0 ? "all" : "none",
      requestBody: {
        summary: opts.summary,
        description: opts.description,
        location: opts.location,
        start: useLocalTime
          ? { dateTime: opts.startLocalStr, timeZone: tz }
          : { dateTime: start.toISOString(), timeZone: "UTC" },
        end: useLocalTime
          ? { dateTime: opts.endLocalStr ?? opts.startLocalStr, timeZone: tz }
          : { dateTime: end.toISOString(), timeZone: "UTC" },
        attendees: attendeeList.length > 0 ? attendeeList : undefined,
        recurrence: opts.recurrence,
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 10 },
            { method: "email", minutes: 60 },
          ],
        },
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

export async function getFreeBusy(
  userId: number,
  timeMin: Date,
  timeMax: Date
): Promise<Array<{ start: string; end: string }>> {
  const auth = await getAuthedClient(userId);
  if (!auth) return [];

  const calendar = google.calendar({ version: "v3", auth });

  try {
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: "primary" }],
      },
    });
    const busySlots = res.data.calendars?.["primary"]?.busy ?? [];
    return busySlots
      .filter((s) => s.start && s.end)
      .map((s) => ({ start: s.start as string, end: s.end as string }));
  } catch (err) {
    console.error("Free/busy query failed:", err);
    return [];
  }
}

export async function updateCalendarEvent(
  userId: number,
  eventId: string,
  opts: {
    summary?: string;
    description?: string;
    startDate: Date;
    endDate?: Date;
    attendees?: string[];
  }
): Promise<boolean> {
  const auth = await getAuthedClient(userId);
  if (!auth) return false;

  const calendar = google.calendar({ version: "v3", auth });
  const start = opts.startDate;
  const end = opts.endDate ?? new Date(start.getTime() + 60 * 60 * 1000);
  const attendeeList = opts.attendees?.map((email) => ({ email })) ?? [];

  try {
    await calendar.events.patch({
      calendarId: "primary",
      eventId,
      sendUpdates: "all",
      requestBody: {
        summary: opts.summary,
        description: opts.description,
        start: { dateTime: start.toISOString(), timeZone: "UTC" },
        end: { dateTime: end.toISOString(), timeZone: "UTC" },
        attendees: attendeeList.length > 0 ? attendeeList : undefined,
      },
    });
    return true;
  } catch (err) {
    console.error("Calendar event update failed:", err);
    return false;
  }
}

export async function getCalendarEvent(
  userId: number,
  eventId: string
): Promise<{ startDate: Date; endDate: Date } | null> {
  const auth = await getAuthedClient(userId);
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  try {
    const res = await calendar.events.get({ calendarId: "primary", eventId });
    const start = res.data.start?.dateTime;
    const end = res.data.end?.dateTime;
    if (!start) return null;
    return {
      startDate: new Date(start),
      endDate: end ? new Date(end) : new Date(new Date(start).getTime() + 60 * 60 * 1000),
    };
  } catch {
    return null;
  }
}

export async function searchContacts(userId: number, query: string): Promise<Array<{ name: string; email: string }>> {
  const auth = await getAuthedClient(userId);
  if (!auth) return [];

  const people = google.people({ version: "v1", auth });

  try {
    const res = await people.people.searchContacts({
      query,
      readMask: "names,emailAddresses",
      pageSize: 10,
    });

    const results: Array<{ name: string; email: string }> = [];
    for (const person of res.data.results ?? []) {
      const p = person.person;
      if (!p) continue;
      const name = p.names?.[0]?.displayName ?? "";
      for (const emailObj of p.emailAddresses ?? []) {
        const email = emailObj.value ?? "";
        if (email) {
          results.push({ name, email });
        }
      }
    }
    return results;
  } catch (err) {
    console.error("Contacts search failed:", err);
    return [];
  }
}
