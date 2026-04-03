import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { ritualsTable } from "./rituals";

export const ritualTimeSuggestionsTable = pgTable("ritual_time_suggestions", {
  id: serial("id").primaryKey(),
  ritualId: integer("ritual_id").notNull().references(() => ritualsTable.id, { onDelete: "cascade" }),
  suggestedByEmail: text("suggested_by_email").notNull(),
  suggestedByName: text("suggested_by_name"),
  suggestedTime: text("suggested_time").notNull(), // ISO timestamp string
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RitualTimeSuggestion = typeof ritualTimeSuggestionsTable.$inferSelect;
