import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ritualsTable } from "./rituals";

export const ritualMessagesTable = pgTable("ritual_messages", {
  id: serial("id").primaryKey(),
  ritualId: integer("ritual_id").notNull().references(() => ritualsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRitualMessageSchema = createInsertSchema(ritualMessagesTable).omit({ id: true, createdAt: true });
export type InsertRitualMessage = z.infer<typeof insertRitualMessageSchema>;
export type RitualMessage = typeof ritualMessagesTable.$inferSelect;
