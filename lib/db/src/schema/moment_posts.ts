import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { sharedMomentsTable } from "./shared_moments";

export const momentPostsTable = pgTable("moment_posts", {
  id: serial("id").primaryKey(),
  momentId: integer("moment_id").notNull().references(() => sharedMomentsTable.id, { onDelete: "cascade" }),
  windowDate: text("window_date").notNull(),
  userToken: text("user_token").notNull(),
  guestName: text("guest_name").notNull(),
  photoUrl: text("photo_url"),
  reflectionText: text("reflection_text"),
  isCheckin: integer("is_checkin").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MomentPost = typeof momentPostsTable.$inferSelect;
