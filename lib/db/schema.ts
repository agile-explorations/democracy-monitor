import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  varchar,
  real,
  date,
  index,
  customType,
  unique,
} from 'drizzle-orm/pg-core';

const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: unknown): number[] {
    // pgvector returns "[1,2,3]" format
    if (typeof value === 'string') return JSON.parse(value);
    if (Array.isArray(value)) return value as number[];
    return [];
  },
});

export const cacheEntries = pgTable('cache_entries', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 512 }).notNull().unique(),
  value: jsonb('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const documents = pgTable(
  'documents',
  {
    id: serial('id').primaryKey(),
    sourceType: varchar('source_type', { length: 50 }).notNull(),
    category: varchar('category', { length: 50 }).notNull(),
    title: text('title').notNull(),
    content: text('content'),
    url: text('url'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata'),
    sourceOrigin: varchar('source_origin', { length: 30 }),
    embedding: vector('embedding'),
    embeddedAt: timestamp('embedded_at', { withTimezone: true }),
  },
  (table) => [
    unique('uq_documents_url_category').on(table.url, table.category),
    index('idx_documents_category').on(table.category),
    index('idx_documents_source_origin').on(table.sourceOrigin),
  ],
);

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

export const sourceHealth = pgTable('source_health', {
  id: serial('id').primaryKey(),
  sourceId: varchar('source_id', { length: 100 }).notNull(),
  sourceName: varchar('source_name', { length: 255 }).notNull(),
  sourceType: varchar('source_type', { length: 20 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  documentCount: integer('document_count'),
  expectedDocCount: integer('expected_doc_count'),
  errorMessage: text('error_message'),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
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

export const legalDocuments = pgTable('legal_documents', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  citation: varchar('citation', { length: 255 }).notNull(),
  content: text('content').notNull(),
  relevantCategories: jsonb('relevant_categories').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const debates = pgTable('debates', {
  id: serial('id').primaryKey(),
  category: varchar('category', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  messages: jsonb('messages').notNull(),
  verdict: jsonb('verdict').notNull(),
  totalRounds: integer('total_rounds').notNull(),
  totalLatencyMs: integer('total_latency_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const digests = pgTable('digests', {
  id: serial('id').primaryKey(),
  date: varchar('date', { length: 10 }).notNull().unique(),
  summary: text('summary').notNull(),
  highlights: jsonb('highlights').$type<string[]>(),
  categorySummaries: jsonb('category_summaries'),
  overallAssessment: text('overall_assessment'),
  summaryExpert: text('summary_expert'),
  categorySummariesExpert: jsonb('category_summaries_expert'),
  provider: varchar('provider', { length: 50 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const keywordTrends = pgTable('keyword_trends', {
  id: serial('id').primaryKey(),
  keyword: varchar('keyword', { length: 255 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  count: integer('count').notNull(),
  baselineAvg: real('baseline_avg'),
  ratio: real('ratio'),
  isAnomaly: boolean('is_anomaly').notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const semanticClusters = pgTable('semantic_clusters', {
  id: serial('id').primaryKey(),
  label: varchar('label', { length: 255 }).notNull(),
  description: text('description'),
  documentCount: integer('document_count').notNull(),
  topKeywords: jsonb('top_keywords').$type<string[]>(),
  categories: jsonb('categories').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiDocumentAssessments = pgTable(
  'ai_document_assessments',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id'),
    url: text('url').notNull(),
    category: varchar('category', { length: 50 }).notNull(),
    pass: integer('pass').notNull(),
    relevant: boolean('relevant'),
    confidence: real('confidence'),
    erosionType: varchar('erosion_type', { length: 30 }),
    signals: jsonb('signals').$type<string[]>(),
    assessment: varchar('assessment', { length: 30 }),
    reasoning: text('reasoning'),
    comparativeContext: text('comparative_context'),
    citedPassages: jsonb('cited_passages').$type<string[]>(),
    counterArguments: jsonb('counter_arguments').$type<string[]>(),
    isAuditSample: boolean('is_audit_sample').notNull().default(false),
    model: varchar('model', { length: 100 }).notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    tokensInput: integer('tokens_input'),
    tokensOutput: integer('tokens_output'),
    latencyMs: integer('latency_ms'),
    weekOf: date('week_of').notNull(),
    assessedAt: timestamp('assessed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_ai_doc_assess_category_week').on(table.category, table.weekOf),
    index('idx_ai_doc_assess_url').on(table.url),
    unique('uq_ai_doc_assess_url_pass_model').on(table.url, table.pass, table.model),
  ],
);

export const documentScores = pgTable(
  'document_scores',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id'),
    url: text('url').notNull().unique(),
    category: varchar('category', { length: 50 }).notNull(),
    severityScore: real('severity_score').notNull(),
    finalScore: real('final_score').notNull(),
    captureCount: integer('capture_count').notNull().default(0),
    driftCount: integer('drift_count').notNull().default(0),
    warningCount: integer('warning_count').notNull().default(0),
    suppressedCount: integer('suppressed_count').notNull().default(0),
    documentClass: varchar('document_class', { length: 20 }).notNull().default('unknown'),
    classMultiplier: real('class_multiplier').notNull().default(1.0),
    isHighAuthority: boolean('is_high_authority').notNull().default(false),
    matches: jsonb('matches').$type<unknown[]>().notNull(),
    suppressed: jsonb('suppressed').$type<unknown[]>().notNull(),
    scoredAt: timestamp('scored_at', { withTimezone: true }).defaultNow().notNull(),
    weekOf: date('week_of').notNull(),
  },
  (table) => [
    index('idx_document_scores_category_week').on(table.category, table.weekOf),
    index('idx_document_scores_document_id').on(table.documentId),
    index('idx_document_scores_url').on(table.url),
  ],
);

export const weeklyAggregates = pgTable(
  'weekly_aggregates',
  {
    id: serial('id').primaryKey(),
    category: varchar('category', { length: 50 }).notNull(),
    weekOf: date('week_of').notNull(),
    totalSeverity: real('total_severity').notNull(),
    documentCount: integer('document_count').notNull(),
    avgSeverityPerDoc: real('avg_severity_per_doc').notNull(),
    captureProportion: real('capture_proportion').notNull().default(0),
    driftProportion: real('drift_proportion').notNull().default(0),
    warningProportion: real('warning_proportion').notNull().default(0),
    severityMix: real('severity_mix').notNull().default(0),
    captureMatchCount: integer('capture_match_count').notNull().default(0),
    driftMatchCount: integer('drift_match_count').notNull().default(0),
    warningMatchCount: integer('warning_match_count').notNull().default(0),
    suppressedMatchCount: integer('suppressed_match_count').notNull().default(0),
    topKeywords: jsonb('top_keywords').$type<string[]>(),
    structuralScore: real('structural_score'),
    structuralDetail: jsonb('structural_detail'),
    thematicScore: real('thematic_score'),
    thematicDetail: jsonb('thematic_detail'),
    convergenceScore: real('convergence_score'),
    convergenceDetail: jsonb('convergence_detail'),
    aiScore: real('ai_score'),
    aiDetail: jsonb('ai_detail'),
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_weekly_aggregates_category_week').on(table.category, table.weekOf),
    index('idx_weekly_aggregates_category').on(table.category),
    index('idx_weekly_aggregates_week_of').on(table.weekOf),
  ],
);

export const baselines = pgTable(
  'baselines',
  {
    id: serial('id').primaryKey(),
    baselineId: varchar('baseline_id', { length: 50 }).notNull(),
    category: varchar('category', { length: 50 }).notNull(),
    avgWeeklySeverity: real('avg_weekly_severity').notNull(),
    stddevWeeklySeverity: real('stddev_weekly_severity').notNull(),
    avgWeeklyDocCount: real('avg_weekly_doc_count').notNull(),
    avgSeverityMix: real('avg_severity_mix').notNull(),
    driftNoiseFloor: real('drift_noise_floor'),
    embeddingCentroid: vector('embedding_centroid'),
    cycleYear: integer('cycle_year'),
    administration: varchar('administration', { length: 50 }),
    calendarYear: integer('calendar_year'),
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_baselines_baseline_category').on(table.baselineId, table.category),
    index('idx_baselines_baseline_id').on(table.baselineId),
  ],
);

export const cycleAdjustmentFactors = pgTable(
  'cycle_adjustment_factors',
  {
    id: serial('id').primaryKey(),
    category: varchar('category', { length: 50 }).notNull(),
    cycleYear: integer('cycle_year').notNull(),
    referenceCycleYear: integer('reference_cycle_year').notNull(),
    severityRatio: real('severity_ratio').notNull(),
    volumeRatio: real('volume_ratio').notNull(),
    severityStddevRatio: real('severity_stddev_ratio').notNull(),
    sourceBaselines: jsonb('source_baselines').$type<string[]>().notNull(),
    sampleSize: integer('sample_size').notNull(),
    confidence: varchar('confidence', { length: 20 }).notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_cycle_adj_category_years').on(
      table.category,
      table.cycleYear,
      table.referenceCycleYear,
    ),
    index('idx_cycle_adj_category').on(table.category),
  ],
);

export const intentWeekly = pgTable(
  'intent_weekly',
  {
    id: serial('id').primaryKey(),
    policyArea: varchar('policy_area', { length: 50 }).notNull(),
    weekOf: date('week_of').notNull(),
    rhetoricScore: real('rhetoric_score').notNull(),
    actionScore: real('action_score').notNull(),
    gap: real('gap').notNull(),
    statementCount: integer('statement_count').notNull().default(0),
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_intent_weekly_area_week').on(table.policyArea, table.weekOf),
    index('idx_intent_weekly_policy_area').on(table.policyArea),
    index('idx_intent_weekly_week_of').on(table.weekOf),
  ],
);

export const p2025Proposals = pgTable('p2025_proposals', {
  id: varchar('id', { length: 50 }).primaryKey(),
  chapter: varchar('chapter', { length: 100 }).notNull(),
  targetAgency: varchar('target_agency', { length: 100 }),
  dashboardCategory: varchar('dashboard_category', { length: 50 }),
  policyArea: varchar('policy_area', { length: 50 }),
  severity: varchar('severity', { length: 20 }).notNull(),
  text: text('text').notNull(),
  summary: text('summary').notNull(),
  embedding: vector('embedding'),
  status: varchar('status', { length: 20 }).notNull().default('not_started'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const p2025Matches = pgTable(
  'p2025_matches',
  {
    id: serial('id').primaryKey(),
    proposalId: varchar('proposal_id', { length: 50 }).notNull(),
    documentId: integer('document_id'),
    cosineSimilarity: real('cosine_similarity').notNull(),
    llmClassification: varchar('llm_classification', { length: 20 }),
    llmConfidence: real('llm_confidence'),
    llmReasoning: text('llm_reasoning'),
    humanReviewed: boolean('human_reviewed').notNull().default(false),
    humanClassification: varchar('human_classification', { length: 20 }),
    matchedAt: timestamp('matched_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_p2025_matches_proposal').on(table.proposalId),
    index('idx_p2025_matches_document').on(table.documentId),
  ],
);

export const legislativeItems = pgTable(
  'legislative_items',
  {
    id: serial('id').primaryKey(),
    govInfoId: varchar('govinfo_id', { length: 100 }).notNull().unique(),
    title: text('title').notNull(),
    type: varchar('type', { length: 20 }).notNull(),
    date: date('date').notNull(),
    url: text('url').notNull(),
    chamber: varchar('chamber', { length: 10 }).notNull(),
    committee: varchar('committee', { length: 200 }),
    relevantCategories: jsonb('relevant_categories').$type<string[]>().notNull(),
    summary: text('summary'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_legislative_items_date').on(table.date),
    index('idx_legislative_items_type').on(table.type),
  ],
);

export const validationDataPoints = pgTable(
  'validation_data_points',
  {
    id: serial('id').primaryKey(),
    source: varchar('source', { length: 30 }).notNull(),
    date: date('date').notNull(),
    dimension: varchar('dimension', { length: 50 }).notNull(),
    score: real('score').notNull(),
    rawScore: real('raw_score'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_validation_source_date_dim').on(table.source, table.date, table.dimension),
    index('idx_validation_source').on(table.source),
    index('idx_validation_date').on(table.date),
  ],
);
