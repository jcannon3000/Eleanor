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
    colorId?: string;       // Google Calendar color (e.g. "5" = banana/yellow)
    status?: string;        // "tentative" | "confirmed"
    reminders?: Array<{ method: string; minutes: number }>;
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

  const defaultReminders = [
    { method: "popup", minutes: 10 },
  ];

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
        colorId: opts.colorId,
        status: opts.status,
        reminders: {
          useDefault: false,
          overrides: opts.reminders ?? defaultReminders,
        },
      },
    });
    return event.data.id ?? null;
  } catch (err) {
    console.error("Calendar event create failed:", err);
    return null;
  }
}

export async function createAllDayCalendarEvent(
  userId: number,
  opts: {
    summary: string;
    description?: string;
    dateStr: string;
    attendees?: string[];
    recurrence?: string[];
  }
): Promise<string | null> {
  const auth = await getAuthedClient(userId);
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  const attendeeList = opts.attendees?.map(email => ({ email })) ?? [];

  const nextDay = new Date(opts.dateStr + "T00:00:00Z");
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const endDateStr = nextDay.toISOString().split("T")[0];

  try {
    const event = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: attendeeList.length > 0 ? "all" : "none",
      requestBody: {
        summary: opts.summary,
        description: opts.description,
        start: { date: opts.dateStr },
        end: { date: endDateStr },
        attendees: attendeeList.length > 0 ? attendeeList : undefined,
        recurrence: opts.recurrence,
        reminders: { useDefault: false, overrides: [] },
      },
    });
    return event.data.id ?? null;
  } catch (err) {
    console.error("All-day calendar event create failed:", err);
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


export async function updateCalendarEvent(
  userId: number,
  eventId: string,
  opts: {
    summary?: string;
    description?: string;
    startDate?: Date;
    startLocalStr?: string;  // "2026-04-01T12:15:00" — preferred for tz-aware updates
    endDate?: Date;
    endLocalStr?: string;    // "2026-04-01T13:15:00"
    timeZone?: string;       // e.g. "America/Chicago" — required when using startLocalStr
    attendees?: string[];
  }
): Promise<boolean> {
  const auth = await getAuthedClient(userId);
  if (!auth) return false;

  const calendar = google.calendar({ version: "v3", auth });
  const attendeeList = opts.attendees?.map((email) => ({ email })) ?? [];
  const useLocalTime = !!(opts.startLocalStr && opts.timeZone);
  const tz = opts.timeZone ?? "UTC";

  let startField: { dateTime: string; timeZone: string };
  let endField: { dateTime: string; timeZone: string };

  if (useLocalTime) {
    startField = { dateTime: opts.startLocalStr!, timeZone: tz };
    endField = { dateTime: opts.endLocalStr ?? opts.startLocalStr!, timeZone: tz };
  } else {
    const start = opts.startDate ?? new Date();
    const end = opts.endDate ?? new Date(start.getTime() + 60 * 60 * 1000);
    startField = { dateTime: start.toISOString(), timeZone: "UTC" };
    endField = { dateTime: end.toISOString(), timeZone: "UTC" };
  }

  try {
    await calendar.events.patch({
      calendarId: "primary",
      eventId,
      sendUpdates: "all",
      requestBody: {
        summary: opts.summary,
        description: opts.description,
        start: startField,
        end: endField,
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

export async function getCalendarEventAttendees(
  userId: number,
  eventId: string
): Promise<Array<{ email: string; displayName?: string; responseStatus?: string }> | null> {
  const auth = await getAuthedClient(userId);
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  try {
    const res = await calendar.events.get({ calendarId: "primary", eventId });
    const attendees = res.data.attendees ?? [];
    return attendees
      .filter(a => a.email && !a.self)
      .map(a => ({
        email: a.email!,
        displayName: a.displayName ?? undefined,
        responseStatus: a.responseStatus ?? undefined,
      }));
  } catch {
    return null;
  }
}

export async function addAttendeesToCalendarEvent(
  userId: number,
  eventId: string,
  newEmails: string[]
): Promise<boolean> {
  const auth = await getAuthedClient(userId);
  if (!auth) return false;

  const calendar = google.calendar({ version: "v3", auth });
  try {
    const existing = await calendar.events.get({ calendarId: "primary", eventId });
    const currentAttendees = existing.data.attendees ?? [];
    const currentEmails = new Set(currentAttendees.map(a => a.email));
    const toAdd = newEmails.filter(e => !currentEmails.has(e));
    if (toAdd.length === 0) return true;
    const merged = [...currentAttendees, ...toAdd.map(email => ({ email }))];
    await calendar.events.patch({
      calendarId: "primary",
      eventId,
      sendUpdates: "all",
      requestBody: { attendees: merged },
    });
    return true;
  } catch {
    return false;
  }
}

export async function removeAttendeesFromCalendarEvent(
  userId: number,
  eventId: string,
  emailsToRemove: string[]
): Promise<boolean> {
  const auth = await getAuthedClient(userId);
  if (!auth) return false;

  const calendar = google.calendar({ version: "v3", auth });
  try {
    const existing = await calendar.events.get({ calendarId: "primary", eventId });
    const currentAttendees = existing.data.attendees ?? [];
    const removeSet = new Set(emailsToRemove.map(e => e.toLowerCase()));
    const filtered = currentAttendees.filter(a => !removeSet.has((a.email ?? "").toLowerCase()));
    await calendar.events.patch({
      calendarId: "primary",
      eventId,
      sendUpdates: "all",
      requestBody: { attendees: filtered },
    });
    return true;
  } catch {
    return false;
  }
}

