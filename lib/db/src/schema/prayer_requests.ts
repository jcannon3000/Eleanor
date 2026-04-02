import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const prayerRequestsTable = pgTable("prayer_requests", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdByName: text("created_by_name"),
  isAnonymous: boolean("is_anonymous").notNull().default(false),
  isAnswered: boolean("is_answered").notNull().default(false),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closeReason: text("close_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const prayerWordsTable = pgTable("prayer_words", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => prayerRequestsTable.id, { onDelete: "cascade" }),
  authorUserId: integer("author_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  authorName: text("author_name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
