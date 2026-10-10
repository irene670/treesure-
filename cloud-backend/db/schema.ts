import { sql } from "drizzle-orm";
import { primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const saplingEvents = sqliteTable("sapling_events", {
  id: text("id").primaryKey(),
  json: text("json").notNull(),
});

export const saplingRegistrations = sqliteTable("sapling_registrations", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  email: text("email").notNull(),
  json: text("json").notNull(),
  photoKey: text("photo_key"),
  unsubscribeToken: text("unsubscribe_token").notNull().unique(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("sapling_registrations_event_email_unique").on(table.eventId, table.email),
]);

export const saplingRateLimits = sqliteTable("sapling_rate_limits", {
  key: text("key").notNull(),
  windowStart: text("window_start").notNull(),
  count: text("count").notNull(),
}, (table) => [primaryKey({ columns: [table.key, table.windowStart] })]);

export const newsletterSubscribers = sqliteTable("newsletter_subscribers", {
  email: text("email").primaryKey(),
  unsubscribeToken: text("unsubscribe_token").notNull().unique(),
  consentAt: text("consent_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  active: text("active").notNull().default("1"),
});
