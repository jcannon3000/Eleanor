import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
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
  ownerId: integer("owner_id").notNull().references(() => usersTable.id),
  proposedTimes: jsonb("proposed_times").notNull().default([]),
  confirmedTime: timestamp("confirmed_time", { withTimezone: true }),
  schedulingToken: text("scheduling_token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRitualSchema = createInsertSchema(ritualsTable).omit({ id: true, createdAt: true });
export type InsertRitual = z.infer<typeof insertRitualSchema>;
export type Ritual = typeof ritualsTable.$inferSelect;
