import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const emailLoginTokensTable = pgTable("email_login_tokens", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"), // for new-user signups
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
