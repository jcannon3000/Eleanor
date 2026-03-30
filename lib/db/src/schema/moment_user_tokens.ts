import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { sharedMomentsTable } from "./shared_moments";

export const momentUserTokensTable = pgTable("moment_user_tokens", {
  id: serial("id").primaryKey(),
  momentId: integer("moment_id").notNull().references(() => sharedMomentsTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  userToken: text("user_token").notNull().unique(),
  googleCalendarEventId: text("google_calendar_event_id"),
  personalTime: text("personal_time"),
  personalTimezone: text("personal_timezone"),
  calendarConnected: boolean("calendar_connected").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MomentUserToken = typeof momentUserTokensTable.$inferSelect;
