import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { sharedMomentsTable } from "./shared_moments";

export const momentWindowsTable = pgTable("moment_windows", {
  id: serial("id").primaryKey(),
  momentId: integer("moment_id").notNull().references(() => sharedMomentsTable.id, { onDelete: "cascade" }),
  windowDate: text("window_date").notNull(),
  status: text("status").notNull().default("wither"),
  postCount: integer("post_count").notNull().default(0),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MomentWindow = typeof momentWindowsTable.$inferSelect;
