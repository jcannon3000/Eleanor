import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ritualsTable } from "./rituals";

export const schedulingResponsesTable = pgTable("scheduling_responses", {
  id: serial("id").primaryKey(),
  ritualId: integer("ritual_id").notNull().references(() => ritualsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  choice: text("choice").notNull(),
  chosenTime: timestamp("chosen_time", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSchedulingResponseSchema = createInsertSchema(schedulingResponsesTable).omit({ id: true, createdAt: true });
export type InsertSchedulingResponse = z.infer<typeof insertSchedulingResponseSchema>;
export type SchedulingResponse = typeof schedulingResponsesTable.$inferSelect;
