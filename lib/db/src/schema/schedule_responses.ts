import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { ritualsTable } from "./rituals";

export const scheduleResponsesTable = pgTable("schedule_responses", {
  id: serial("id").primaryKey(),
  ritualId: integer("ritual_id").notNull().references(() => ritualsTable.id, { onDelete: "cascade" }),
  guestName: text("guest_name").notNull(),
  guestEmail: text("guest_email"),
  chosenTime: text("chosen_time"),
  unavailable: integer("unavailable").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ScheduleResponse = typeof scheduleResponsesTable.$inferSelect;
