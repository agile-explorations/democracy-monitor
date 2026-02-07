import { pgTable, serial, text, timestamp, integer, jsonb, boolean, varchar } from 'drizzle-orm/pg-core';

export const cacheEntries = pgTable('cache_entries', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 512 }).notNull().unique(),
  value: jsonb('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  sourceType: varchar('source_type', { length: 50 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  title: text('title').notNull(),
  content: text('content'),
  url: text('url'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata'),
});

export const assessments = pgTable('assessments', {
  id: serial('id').primaryKey(),
  category: varchar('category', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  reason: text('reason').notNull(),
  matches: jsonb('matches').$type<string[]>(),
  detail: jsonb('detail'),
  assessedAt: timestamp('assessed_at', { withTimezone: true }).defaultNow().notNull(),
  aiProvider: varchar('ai_provider', { length: 50 }),
  confidence: integer('confidence'),
});

export const siteUptime = pgTable('site_uptime', {
  id: serial('id').primaryKey(),
  hostname: varchar('hostname', { length: 255 }).notNull(),
  status: integer('status').notNull(),
  responseTimeMs: integer('response_time_ms'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
  isUp: boolean('is_up').notNull(),
});
