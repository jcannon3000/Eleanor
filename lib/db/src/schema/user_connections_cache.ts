import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Persists connections between users across practice/tradition membership.
// Survives practice deletion (no cascade). Used to populate the people recommender.
export const userConnectionsCacheTable = pgTable("user_connections_cache", {
  userEmail: text("user_email").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactName: text("contact_name"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserConnectionCache = typeof userConnectionsCacheTable.$inferSelect;
