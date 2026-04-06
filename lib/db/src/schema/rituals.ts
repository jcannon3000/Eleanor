import { pgTable, serial, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const ritualsTable = pgTable("rituals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  frequency: text("frequency").notNull(),
  dayPreference: text("day_preference"),
  participants: jsonb("participants").notNull().default([]),
  intention: text("intention"),
  ownerId: integer("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  location: text("location"),
  proposedTimes: jsonb("proposed_times").notNull().default([]),
  confirmedTime: text("confirmed_time"),
  scheduleToken: text("schedule_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Phoebe gathering fields
  rhythm: text("rhythm").notNull().default("fortnightly"),
  hasIntercession: boolean("has_intercession").notNull().default(false),
  hasFasting: boolean("has_fasting").notNull().default(false),
  intercessionIntention: text("intercession_intention"),
  fastingDescription: text("fasting_description"),
});

export const insertRitualSchema = createInsertSchema(ritualsTable).omit({ id: true, createdAt: true });
export type InsertRitual = z.infer<typeof insertRitualSchema>;
export type Ritual = typeof ritualsTable.$inferSelect;
