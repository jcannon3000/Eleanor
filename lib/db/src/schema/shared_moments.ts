import { pgTable, serial, text, integer, timestamp, boolean, date } from "drizzle-orm/pg-core";
import { ritualsTable } from "./rituals";

export const sharedMomentsTable = pgTable("shared_moments", {
  id: serial("id").primaryKey(),
  ritualId: integer("ritual_id").references(() => ritualsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  intention: text("intention").notNull(),
  loggingType: text("logging_type").notNull().default("photo"),
  reflectionPrompt: text("reflection_prompt"),
  templateType: text("template_type"),
  intercessionTopic: text("intercession_topic"),
  intercessionSource: text("intercession_source"),
  intercessionFullText: text("intercession_full_text"),
  timerDurationMinutes: integer("timer_duration_minutes").notNull().default(10),
  frequency: text("frequency").notNull().default("weekly"),
  scheduledTime: text("scheduled_time").notNull().default("08:00"),
  windowMinutes: integer("window_minutes").notNull().default(60),
  goalDays: integer("goal_days").notNull().default(30),
  dayOfWeek: text("day_of_week"),
  timezone: text("timezone").notNull().default("UTC"),
  timeOfDay: text("time_of_day"),
  momentToken: text("moment_token").notNull().unique(),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  totalBlooms: integer("total_blooms").notNull().default(0),
  state: text("state").notNull().default("active"),
  frequencyType: text("frequency_type"),
  frequencyDaysPerWeek: integer("frequency_days_per_week"),
  practiceDays: text("practice_days"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SharedMoment = typeof sharedMomentsTable.$inferSelect;

export const momentRenewalsTable = pgTable("moment_renewals", {
  id: serial("id").primaryKey(),
  momentId: integer("moment_id").notNull().references(() => sharedMomentsTable.id, { onDelete: "cascade" }),
  previousIntention: text("previous_intention"),
  newIntention: text("new_intention"),
  previousIntercessionTopic: text("previous_intercession_topic"),
  newIntercessionTopic: text("new_intercession_topic"),
  renewalCount: integer("renewal_count").notNull().default(1),
  renewedAt: timestamp("renewed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const momentCalendarEventsTable = pgTable("moment_calendar_events", {
  id: serial("id").primaryKey(),
  sharedMomentId: integer("shared_moment_id").notNull().references(() => sharedMomentsTable.id, { onDelete: "cascade" }),
  momentMemberId: integer("moment_member_id").notNull(),
  googleCalendarEventId: text("google_calendar_event_id"),
  icsSent: boolean("ics_sent").notNull().default(false),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  isFirstEvent: boolean("is_first_event").notNull().default(false),
  logged: boolean("logged").notNull().default(false),
  loggedAt: timestamp("logged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const momentStreakDaysTable = pgTable("moment_streak_days", {
  id: serial("id").primaryKey(),
  sharedMomentId: integer("shared_moment_id").notNull().references(() => sharedMomentsTable.id, { onDelete: "cascade" }),
  practiceDate: date("practice_date").notNull(),
  membersLogged: integer("members_logged").notNull().default(0),
  bloomed: boolean("bloomed").notNull().default(false),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
});
