import { pgTable, serial, text, integer, timestamp, date, jsonb, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const bcpTextsTable = pgTable("bcp_texts", {
  id: serial("id").primaryKey(),
  textKey: text("text_key").notNull().unique(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  bcpReference: text("bcp_reference"),
  content: text("content").notNull(),
  seasonRestriction: text("season_restriction"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scriptureCacheTable = pgTable(
  "scripture_cache",
  {
    id: serial("id").primaryKey(),
    reference: text("reference").notNull(),
    cacheDate: date("cache_date").notNull(),
    nrsv_text: text("nrsv_text").notNull(),
    fetchedAt: timestamp("fetched_at").defaultNow(),
  },
  (t) => [unique().on(t.reference, t.cacheDate)]
);

export const morningPrayerCacheTable = pgTable("morning_prayer_cache", {
  id: serial("id").primaryKey(),
  cacheDate: date("cache_date").notNull().unique(),
  liturgicalYear: integer("liturgical_year").notNull(),
  liturgicalSeason: text("liturgical_season").notNull(),
  properNumber: integer("proper_number"),
  feastName: text("feast_name"),
  slidesJson: jsonb("slides_json").notNull(),
  assembledAt: timestamp("assembled_at").defaultNow(),
  assembledByUserId: integer("assembled_by_user_id").references(() => usersTable.id),
});

export type BcpText = typeof bcpTextsTable.$inferSelect;
export type ScriptureCache = typeof scriptureCacheTable.$inferSelect;
export type MorningPrayerCache = typeof morningPrayerCacheTable.$inferSelect;
