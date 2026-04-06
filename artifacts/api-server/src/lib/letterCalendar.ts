import { createCalendarEvent } from "./calendar";
import { formatHumanDate } from "./letterPeriods";

export async function sendLetterCalendarEvent(params: {
  recipientEmail: string;
  recipientName: string;
  authorName: string;
  correspondenceName: string;
  postmarkCity: string;
  letterDate: Date;
  letterUrl: string;
  correspondenceId: number;
}): Promise<string | null> {
  const {
    recipientEmail,
    authorName,
    correspondenceName,
    postmarkCity,
    letterDate,
    letterUrl,
  } = params;

  const humanDate = formatHumanDate(letterDate);
  const postmarkLine = postmarkCity ? `Postmarked: ${postmarkCity} · ${humanDate}` : `Sent: ${humanDate}`;

  // Schedule for 8am today, or 1 hour from now if past 8am
  const now = new Date();
  const eightAm = new Date(now);
  eightAm.setHours(8, 0, 0, 0);
  const startDate = now > eightAm ? new Date(now.getTime() + 60 * 60 * 1000) : eightAm;
  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);

  const description = [
    `${authorName} has written their letter in ${correspondenceName}.`,
    "",
    postmarkLine,
    "",
    `Read it here →`,
    letterUrl,
    "",
    `Then write back when it's your turn. 🌿`,
    "",
    `──────────────────`,
    `Be together with Phoebe.`,
  ].join("\n");

  try {
    const eventId = await createCalendarEvent(0, {
      summary: `📮 ${authorName} wrote you a letter`,
      organizer: { displayName: "Phoebe", email: "eleanorscheduler@gmail.com" },
      description,
      startDate,
      endDate,
      attendees: [recipientEmail],
      colorId: "7",
      status: "confirmed",
      reminders: [{ method: "popup", minutes: 0 }],
    });
    return eventId;
  } catch (err) {
    console.error("Letter calendar event failed:", err);
    return null;
  }
}
