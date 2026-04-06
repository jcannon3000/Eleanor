import { pgTable, serial, text, integer, timestamp, boolean, date, jsonb, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const correspondencesTable = pgTable("correspondences", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  frequency: text("frequency").notNull().default("fortnightly"),
  groupType: text("group_type").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Correspondence = typeof correspondencesTable.$inferSelect;

export const correspondenceMembersTable = pgTable("correspondence_members", {
  id: serial("id").primaryKey(),
  correspondenceId: integer("correspondence_id").notNull().references(() => correspondencesTable.id),
  userId: integer("user_id").references(() => usersTable.id),
  email: text("email").notNull(),
  name: text("name"),
  inviteToken: text("invite_token").notNull().unique(),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  lastLetterAt: timestamp("last_letter_at", { withTimezone: true }),
  homeCity: text("home_city"),
  homeCountry: text("home_country"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CorrespondenceMember = typeof correspondenceMembersTable.$inferSelect;

export const lettersTable = pgTable("letters", {
  id: serial("id").primaryKey(),
  correspondenceId: integer("correspondence_id").notNull().references(() => correspondencesTable.id),
  authorUserId: integer("author_user_id").references(() => usersTable.id),
  authorEmail: text("author_email").notNull(),
  authorName: text("author_name").notNull(),
  content: text("content").notNull(),
  letterNumber: integer("letter_number").notNull(),
  periodNumber: integer("period_number").notNull(),
  periodStartDate: date("period_start_date").notNull(),
  postmarkCity: text("postmark_city"),
  postmarkCountry: text("postmark_country"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  readBy: jsonb("read_by").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Letter = typeof lettersTable.$inferSelect;

export const letterDraftsTable = pgTable("letter_drafts", {
  id: serial("id").primaryKey(),
  correspondenceId: integer("correspondence_id").notNull().references(() => correspondencesTable.id),
  authorUserId: integer("author_user_id").references(() => usersTable.id),
  authorEmail: text("author_email").notNull(),
  content: text("content").notNull().default(""),
  periodStartDate: date("period_start_date").notNull(),
  lastSavedAt: timestamp("last_saved_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("letter_drafts_unique").on(table.correspondenceId, table.authorEmail, table.periodStartDate),
]);

export type LetterDraft = typeof letterDraftsTable.$inferSelect;

export const letterRemindersTable = pgTable("letter_reminders", {
  id: serial("id").primaryKey(),
  correspondenceId: integer("correspondence_id").notNull().references(() => correspondencesTable.id),
  memberEmail: text("member_email").notNull(),
  periodStartDate: date("period_start_date").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("letter_reminders_unique").on(table.correspondenceId, table.memberEmail, table.periodStartDate),
]);

export type LetterReminder = typeof letterRemindersTable.$inferSelect;
