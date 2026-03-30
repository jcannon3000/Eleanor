import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { ritualsTable } from "./rituals";

export const inviteTokensTable = pgTable("invite_tokens", {
  id: serial("id").primaryKey(),
  ritualId: integer("ritual_id").notNull().references(() => ritualsTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  token: text("token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
});

export type InviteToken = typeof inviteTokensTable.$inferSelect;
