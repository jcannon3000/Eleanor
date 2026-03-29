import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ritualsTable } from "./rituals";

export const meetupsTable = pgTable("meetups", {
  id: serial("id").primaryKey(),
  ritualId: integer("ritual_id").notNull().references(() => ritualsTable.id, { onDelete: "cascade" }),
  scheduledDate: timestamp("scheduled_date", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("planned"),
  notes: text("notes"),
  googleCalendarEventId: text("google_calendar_event_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMeetupSchema = createInsertSchema(meetupsTable).omit({ id: true, createdAt: true });
export type InsertMeetup = z.infer<typeof insertMeetupSchema>;
export type Meetup = typeof meetupsTable.$inferSelect;
