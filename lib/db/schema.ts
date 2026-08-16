import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  bigint,
  jsonb,
  boolean,
  varchar,
  real,
  date,
  index,
  uniqueIndex,
  customType,
  unique,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string; driverParam: string }>({
  dataType() {
    return 'tsvector';
  },
});

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
    contentType: varchar('content_type', { length: 20 }).notNull().default('full_text'),
    caseId: varchar('case_id', { length: 100 }),
    speaker: varchar('speaker', { length: 200 }),
    embedding: vector('embedding'),
    embeddedAt: timestamp('embedded_at', { withTimezone: true }),
    /** Fragment lineage (#704 Path A): set on rows split out of a multi-topic
     *  parent granule (points at the parent documents.id). Fragments are
     *  retrieval-grade — embedded and searchable — but sit outside the
     *  counting population (counting_scope=false) and are excluded from L2
     *  assessment; the parent row remains the single source for origin URL
     *  and metadata. */
    parentId: integer('parent_id'),
    /** Compact FTS ranking vector (#702/#703): title (weight A) + first 20k
     *  chars of content (weight B). Maintained by a DB trigger (migration
     *  0053); MATCHING still uses the full generated search_vector — this
     *  column exists so ts_rank never detoasts multi-MB vectors. Nullable:
     *  rows await the batched backfill; the hybrid FTS arm ranks only
     *  non-null rows (graceful pre-backfill degradation). */
    searchRankVector: tsvector('search_rank_vector'),
    /** NULL = retrieval-relevant (default); false = annotated off-topic by the
     *  retrieval relevance filter (#524/#544) — excluded from assessment,
     *  statistics, search, and exports but kept for auditability. */
    retrievalRelevant: boolean('retrieval_relevant'),
    /** NULL = in counting scope (default); false = judicial opinion outside
     *  the documented counting population (#587: opinion-scope classifier
     *  applied uniformly to all eras) — excluded from counts, structural
     *  statistics, embeddings, and drift, but kept stored and still eligible
     *  as L2 assessment evidence. */
    countingScope: boolean('counting_scope'),
  },
  (table) => [
    unique('uq_documents_url_category').on(table.url, table.category),
    index('idx_documents_parent_id').on(table.parentId),
    index('idx_documents_category').on(table.category),
    index('idx_documents_source_origin').on(table.sourceOrigin),
    index('idx_documents_case_id').on(table.caseId),
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
    /** WHO performs the erosion-relevant action (#537). Nullable: rows
     *  predating attribution carry NULL until the light-pass backfill. */
    erosionActor: varchar('erosion_actor', { length: 30 }),
    signals: jsonb('signals').$type<string[]>(),
    assessment: varchar('assessment', { length: 30 }),
    reasoning: text('reasoning'),
    comparativeContext: text('comparative_context'),
    citedPassages: jsonb('cited_passages').$type<string[]>(),
    counterArguments: jsonb('counter_arguments').$type<string[]>(),
    isAuditSample: boolean('is_audit_sample').notNull().default(false),
    model: varchar('model', { length: 100 }).notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    /** Prompt vintage that produced this row (#557 parity audit). Nullable:
     *  rows predating 2026-07-19 carry NULL — vintage inferable only from
     *  assessed_at. Constants live beside the prompts (document-review-pass1/2). */
    promptVersion: varchar('prompt_version', { length: 30 }),
    tokensInput: integer('tokens_input'),
    tokensOutput: integer('tokens_output'),
    latencyMs: integer('latency_ms'),
    weekOf: date('week_of').notNull(),
    assessedAt: timestamp('assessed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_ai_doc_assess_category_week').on(table.category, table.weekOf),
    index('idx_ai_doc_assess_url').on(table.url),
    unique('uq_ai_doc_assess_url_cat_pass_model').on(
      table.url,
      table.category,
      table.pass,
      table.model,
    ),
  ],
);

export const documentScores = pgTable(
  'document_scores',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id'),
    url: text('url').notNull(),
    category: varchar('category', { length: 50 }).notNull(),
    severityScore: real('severity_score').notNull(),
    finalScore: real('final_score').notNull(),
    captureCount: integer('capture_count').notNull().default(0),
    driftCount: integer('drift_count').notNull().default(0),
    warningCount: integer('warning_count').notNull().default(0),
    suppressedCount: integer('suppressed_count').notNull().default(0),
    documentClass: varchar('document_class', { length: 30 }).notNull().default('unknown'),
    classMultiplier: real('class_multiplier').notNull().default(1.0),
    isHighAuthority: boolean('is_high_authority').notNull().default(false),
    matches: jsonb('matches').$type<unknown[]>().notNull(),
    suppressed: jsonb('suppressed').$type<unknown[]>().notNull(),
    scoredAt: timestamp('scored_at', { withTimezone: true }).defaultNow().notNull(),
    weekOf: date('week_of').notNull(),
  },
  (table) => [
    unique('uq_document_scores_url_category').on(table.url, table.category),
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
    /** When enrichment (layer scores + convergence status) last ran for this
     *  row (#568). Distinct from computed_at, which count-only upserts also
     *  bump. Drives the enrichment-freshness invariant in validate:graph:
     *  enriched_at must be >= the newest assessment touching the week. */
    enrichedAt: timestamp('enriched_at', { withTimezone: true }),
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

export const narratives = pgTable(
  'narratives',
  {
    id: serial('id').primaryKey(),
    category: varchar('category', { length: 50 }).notNull(),
    weekOf: date('week_of').notNull(),
    version: varchar('version', { length: 20 }).notNull(),
    content: text('content').notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
    /** Owner accepted this narrative as-is despite newer assessment data
     *  (G4h): set by narratives:accept-stale after a repair review. Assessment
     *  data newer than this stamp re-flags the narrative — acceptance covers
     *  what the owner saw, not the future. generated_at is never rewritten. */
    stalenessAcceptedAt: timestamp('staleness_accepted_at', { withTimezone: true }),
  },
  (table) => [
    unique('uq_narratives_category_week_version').on(table.category, table.weekOf, table.version),
    index('idx_narratives_category').on(table.category),
    index('idx_narratives_week_of').on(table.weekOf),
  ],
);

export const narrativeFailures = pgTable(
  'narrative_failures',
  {
    id: serial('id').primaryKey(),
    category: varchar('category', { length: 50 }).notNull(),
    weekOf: date('week_of').notNull(),
    failedPass: integer('failed_pass').notNull(),
    error: text('error').notNull(),
    attempts: integer('attempts').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    unique('uq_narrative_failures_category_week').on(table.category, table.weekOf),
    index('idx_narrative_failures_unresolved').on(table.resolvedAt),
  ],
);

export const fetchLog = pgTable(
  'fetch_log',
  {
    id: serial('id').primaryKey(),
    sourceOrigin: varchar('source_origin', { length: 30 }).notNull(),
    category: varchar('category', { length: 50 }).notNull(),
    weekStart: date('week_start').notNull(),
    weekEnd: date('week_end').notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    itemsFetched: integer('items_fetched').notNull().default(0),
    itemsStored: integer('items_stored').notNull().default(0),
    errors: jsonb('errors').$type<string[]>(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_fetch_log_source_category_week').on(
      table.sourceOrigin,
      table.category,
      table.weekStart,
    ),
  ],
);

export const cronLocks = pgTable('cron_locks', {
  lockKey: varchar('lock_key', { length: 64 }).primaryKey(),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  pid: integer('pid'),
});

export const cronRuns = pgTable(
  'cron_runs',
  {
    id: serial('id').primaryKey(),
    jobName: varchar('job_name', { length: 50 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    summary: jsonb('summary'),
    errors: jsonb('errors').$type<string[]>(),
  },
  (table) => [index('idx_cron_runs_job_name').on(table.jobName)],
);

export const legiscanDatasets = pgTable('legiscan_datasets', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull().unique(),
  state: varchar('state', { length: 2 }).notNull(),
  sessionName: text('session_name'),
  datasetHash: varchar('dataset_hash', { length: 32 }).notNull(),
  datasetDate: timestamp('dataset_date', { withTimezone: true }),
  downloadedAt: timestamp('downloaded_at', { withTimezone: true }).defaultNow().notNull(),
  billCount: integer('bill_count'),
});

export const subscribers = pgTable(
  'subscribers',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    confirmToken: varchar('confirm_token', { length: 64 }).notNull(),
    confirmed: boolean('confirmed').notNull().default(false),
    subscribedAt: timestamp('subscribed_at', { withTimezone: true }).defaultNow().notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
  },
  (table) => [
    unique('uq_subscribers_email').on(table.email),
    unique('uq_subscribers_token').on(table.confirmToken),
  ],
);

export const feedback = pgTable(
  'feedback',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }),
    category: varchar('category', { length: 50 }),
    type: varchar('type', { length: 20 }).notNull(),
    message: text('message').notNull(),
    pageUrl: text('page_url'),
    // Moderation gate (#668): new submissions default to unapproved and are
    // hidden from the public GET until a moderator approves via the CLI. The
    // grandfather step in the migration sets existing rows to true.
    approved: boolean('approved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_feedback_created_at').on(table.createdAt)],
);

export const feedbackResponses = pgTable(
  'feedback_responses',
  {
    id: serial('id').primaryKey(),
    feedbackId: integer('feedback_id')
      .notNull()
      .references(() => feedback.id),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_feedback_responses_feedback_id').on(table.feedbackId)],
);

/**
 * Deterministic index of notable weeks in the current term, ranked by
 * significance rules over weekly_aggregates (no AI). Recomputed whenever the
 * living term summary regenerates (i.e. whenever aggregate data changes).
 */
/** One-line AI event headline per analysis week (#539). Routine weeks store a
 *  deterministic fallback (generated=false) — never blank, zero AI cost. */
export const weekHeadlines = pgTable('week_headlines', {
  id: serial('id').primaryKey(),
  weekOf: date('week_of').notNull().unique(),
  headline: text('headline').notNull(),
  /** True when AI-generated from confirmed docs; false for the routine fallback. */
  generated: boolean('generated').notNull().default(false),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const significantWeeks = pgTable(
  'significant_weeks',
  {
    id: serial('id').primaryKey(),
    weekOf: date('week_of').notNull().unique(),
    reasons: jsonb('reasons').$type<{ type: string; detail: string }[]>().notNull(),
    /** One-line AI event summary of what happened that week (null if unavailable). */
    headline: text('headline'),
    rank: integer('rank').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_significant_weeks_rank').on(table.rank)],
);

/**
 * Drop ledger for the retrieval relevance filter (#524). Documents dropped at
 * FR fetch time are not stored, but every drop is recorded here so exclusions
 * stay observable (audit input for validate:mf-drops). FR is a stable archive
 * addressable by URL, so ledger rows suffice to re-fetch and re-evaluate.
 */
export const frDropLedger = pgTable(
  'fr_drop_ledger',
  {
    id: serial('id').primaryKey(),
    category: varchar('category', { length: 50 }).notNull(),
    signalUrl: text('signal_url').notNull(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    agency: text('agency'),
    publishedAt: date('published_at'),
    /** RelevanceResult reason: no-allow-match | excluded */
    reason: varchar('reason', { length: 30 }).notNull(),
    patternVersion: integer('pattern_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_fr_drop_ledger_url_category').on(table.url, table.category),
    index('idx_fr_drop_ledger_category_created').on(table.category, table.createdAt),
  ],
);

/**
 * CHRG hearings seen but routed to zero categories (#608). Makes routing
 * drops auditable and stops the weekly trailing-window pass from re-fetching
 * the same off-topic transcripts forever.
 */
export const chrgSeenLedger = pgTable(
  'chrg_seen_ledger',
  {
    id: serial('id').primaryKey(),
    packageId: text('package_id').notNull(),
    title: text('title').notNull(),
    committees: text('committees'),
    dateIssued: date('date_issued'),
    /** Why the hearing was not ingested: zero_categories | no_text */
    reason: varchar('reason', { length: 30 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('uq_chrg_seen_ledger_package_id').on(table.packageId)],
);

/**
 * Robots.txt compliance audit trail (#685, owner directive 2026-08-08).
 * One row per host per audit run, carrying the RAW robots.txt text observed at
 * check time plus the per-path verdicts — the evidentiary record that lets us
 * report the pipeline was compliant when documents were retrieved.
 * Trigger values: snapshot (weekly gate) | manual (validate:robots) |
 * retrospective (Wayback-evidenced attestation for a past fetch window).
 */
export const robotsAudit = pgTable(
  'robots_audit',
  {
    id: serial('id').primaryKey(),
    auditedAt: timestamp('audited_at', { withTimezone: true }).defaultNow().notNull(),
    trigger: varchar('trigger', { length: 20 }).notNull(),
    host: varchar('host', { length: 120 }).notNull(),
    /** HTTP status of the robots.txt fetch (null = network failure). */
    fetchStatus: integer('fetch_status'),
    /** Raw robots.txt body observed at check time (null when unreachable). */
    robotsTxt: text('robots_txt'),
    /** Where the robots text came from: live | wayback (retrospective rows). */
    robotsSource: varchar('robots_source', { length: 20 }).notNull().default('live'),
    /** Per-path verdicts: [{path, allowed, matchedRule, kind, status}]. */
    verdicts: jsonb('verdicts').notNull(),
    violationCount: integer('violation_count').notNull().default(0),
    note: text('note'),
  },
  (table) => [index('idx_robots_audit_host_time').on(table.host, table.auditedAt)],
);

/**
 * Case-tracker universe (#693, milestone R-CASE-TRACKER). One row per tracked
 * federal case: the category routing that previously lived only on the 283k
 * metadata-only docket-stub document rows, joined with CourtListener bulk
 * docket metadata (dates, status) and an optional tier-B posture cache from
 * the live docket-timeline fetch. Seeded locally from bulk staging
 * (cases:seed), promoted via db:promote, refreshed weekly as a snapshot
 * post-step, and upserted directly at ingest once stub persistence stops.
 */
export const trackedCases = pgTable(
  'tracked_cases',
  {
    id: serial('id').primaryKey(),
    /** cl:<docketId> — the same join key documents.case_id carries. */
    caseId: varchar('case_id', { length: 50 }).notNull(),
    docketId: bigint('docket_id', { mode: 'number' }).notNull(),
    /** Category routing — the ONLY home of case→category mapping post-retirement. */
    categories: jsonb('categories').$type<string[]>().notNull(),
    caseName: text('case_name').notNull(),
    courtId: varchar('court_id', { length: 30 }),
    courtName: varchar('court_name', { length: 200 }),
    docketNumber: varchar('docket_number', { length: 100 }),
    natureOfSuit: varchar('nature_of_suit', { length: 200 }),
    cause: varchar('cause', { length: 200 }),
    dateFiled: date('date_filed'),
    dateTerminated: date('date_terminated'),
    dateLastFiling: date('date_last_filing'),
    /** 'open' | 'terminated' — derived from dateTerminated. */
    status: varchar('status', { length: 12 }).notNull(),
    /** Tier-B posture cache from the live docket-timeline fetch (asOf = data age). */
    posture: jsonb('posture').$type<{
      line: string;
      eventType: string;
      date: string;
      asOf: string;
    } | null>(),
    /** Latest P2 AI-review reasoning for an opinion in this case (#700 follow-on) — the "what is this case about" line. */
    caseSummary: text('case_summary'),
    clusterDisposition: text('cluster_disposition'),
    clusterPrecedential: varchar('cluster_precedential', { length: 50 }),
    clusterCitationCount: integer('cluster_citation_count'),
    /** Query provenance: union of opinion clQueries + 'stub-seed' | 'ingest'. */
    provenance: jsonb('provenance').$type<string[]>(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /** Last v4 API touch; null = bulk/stub data only (sorts first in refresh queue). */
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_tracked_cases_case_id').on(table.caseId),
    index('idx_tracked_cases_categories').using('gin', table.categories),
    index('idx_tracked_cases_status_last_filing').on(table.status, table.dateLastFiling),
  ],
);

/** Per-build search phase timings (#727): degradation CAPTURE, not trend
 *  tracking — every docsOnly retrieval build writes a row (outliers
 *  preserved, never averaged) so sudden or intermittent slowdowns are
 *  detectable and diagnosable after the fact: when, the exact search, the
 *  phase breakdown, and the running release. Threshold trips flag the row
 *  and email the operator. Retention: indefinite raw (owner decision). */
export const searchTimings = pgTable(
  'search_timings',
  {
    id: serial('id').primaryKey(),
    measuredAt: timestamp('measured_at', { withTimezone: true }).defaultNow().notNull(),
    query: text('query').notNull(),
    queryHash: varchar('query_hash', { length: 16 }).notNull(),
    /** tier / eras / dateFrom / dateTo / refresh — the exact search shape. */
    params: jsonb('params').$type<Record<string, string | boolean | null>>(),
    /** 'build' = retrieval ran (timings present); 'cache' = served from the
     *  docsOnly cache (behavior row, no timings); 'empty' = retrieval ran
     *  and found nothing — the unmet-demand signal (#727). */
    served: varchar('served', { length: 8 }).default('build').notNull(),
    /** Documents returned; 0 on 'empty' rows, null on 'cache' rows. */
    docCount: integer('doc_count'),
    embedMs: integer('embed_ms'),
    expansionMs: integer('expansion_ms'),
    retrieveWallMs: integer('retrieve_wall_ms'),
    totalMs: integer('total_ms'),
    windows: jsonb('windows').$type<Array<{ key: string; searchMs: number; rerankMs: number }>>(),
    appVersion: varchar('app_version', { length: 20 }),
    gitCommit: varchar('git_commit', { length: 40 }),
    flagged: boolean('flagged').default(false).notNull(),
    flagReason: text('flag_reason'),
  },
  (table) => [
    index('idx_search_timings_measured_at').on(table.measuredAt),
    index('idx_search_timings_flagged').on(table.flagged, table.measuredAt),
  ],
);
