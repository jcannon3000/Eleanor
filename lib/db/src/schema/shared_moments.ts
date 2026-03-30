import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { ritualsTable } from "./rituals";

export const sharedMomentsTable = pgTable("shared_moments", {
  id: serial("id").primaryKey(),
  ritualId: integer("ritual_id").notNull().references(() => ritualsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  intention: text("intention").notNull(),
  loggingType: text("logging_type").notNull().default("photo"),
  reflectionPrompt: text("reflection_prompt"),
  frequency: text("frequency").notNull().default("weekly"),
  scheduledTime: text("scheduled_time").notNull().default("08:00"),
  windowMinutes: integer("window_minutes").notNull().default(60),
  goalDays: integer("goal_days").notNull().default(30),
  momentToken: text("moment_token").notNull().unique(),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  totalBlooms: integer("total_blooms").notNull().default(0),
  state: text("state").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SharedMoment = typeof sharedMomentsTable.$inferSelect;
