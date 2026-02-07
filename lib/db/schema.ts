import { pgTable, serial, text, timestamp, integer, jsonb, boolean, varchar, real, date } from 'drizzle-orm/pg-core';

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

export const aiAnalysisHistory = pgTable('ai_analysis_history', {
  id: serial('id').primaryKey(),
  category: varchar('category', { length: 50 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  confidence: real('confidence'),
  reasoning: text('reasoning'),
  tokensInput: integer('tokens_input'),
  tokensOutput: integer('tokens_output'),
  latencyMs: integer('latency_ms'),
  keywordStatus: varchar('keyword_status', { length: 20 }),
  consensus: boolean('consensus'),
  analyzedAt: timestamp('analyzed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const intentStatements = pgTable('intent_statements', {
  id: serial('id').primaryKey(),
  text: text('text').notNull(),
  source: varchar('source', { length: 255 }).notNull(),
  sourceTier: integer('source_tier').notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  policyArea: varchar('policy_area', { length: 50 }).notNull(),
  score: real('score').notNull(),
  date: date('date').notNull(),
  url: text('url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const intentAssessments = pgTable('intent_assessments', {
  id: serial('id').primaryKey(),
  overall: varchar('overall', { length: 50 }).notNull(),
  confidence: real('confidence'),
  rhetoricScore: real('rhetoric_score').notNull(),
  actionScore: real('action_score').notNull(),
  gap: real('gap').notNull(),
  detail: jsonb('detail'),
  assessedAt: timestamp('assessed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const siteUptime = pgTable('site_uptime', {
  id: serial('id').primaryKey(),
  hostname: varchar('hostname', { length: 255 }).notNull(),
  status: integer('status').notNull(),
  responseTimeMs: integer('response_time_ms'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
  isUp: boolean('is_up').notNull(),
});

export const alerts = pgTable('alerts', {
  id: serial('id').primaryKey(),
  type: varchar('type', { length: 50 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  severity: varchar('severity', { length: 20 }).notNull(),
  message: text('message').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export const contentSnapshots = pgTable('content_snapshots', {
  id: serial('id').primaryKey(),
  url: text('url').notNull().unique(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  reportCount: integer('report_count'),
  snapshotAt: timestamp('snapshot_at', { withTimezone: true }).defaultNow().notNull(),
});
