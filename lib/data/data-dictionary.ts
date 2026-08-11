/**
 * Data dictionary for the public downloads (#591): the two CSV exports and
 * the key tables of the PostgreSQL dump. Single source for the
 * /data/dictionary page and GET /api/export/dictionary.
 *
 * Guard tests assert two-directional sync with the CSV flatteners and the
 * Drizzle schema, so an out-of-sync dictionary fails `pnpm test` (and the
 * pre-push hook) — it can never reach production. When you add a column,
 * the failing test brings you here.
 */

export interface DictionaryEntry {
  /** Column name exactly as it appears in the artifact. */
  name: string;
  /** Practical type as a downloader sees it (CSV cells are strings; this is the semantic type). */
  type: string;
  /** Plain-language meaning, derivation, and caveats. Deliberately thorough. */
  description: string;
}

export interface DictionaryArtifact {
  key: 'csv_weekly' | 'csv_scores' | string;
  title: string;
  /** What this artifact is and the grain of one row. */
  description: string;
  entries: DictionaryEntry[];
}

// ---------------------------------------------------------------------------
// Shared descriptions (fields that appear identically in a CSV and a table)
// ---------------------------------------------------------------------------

const CATEGORY_DESC =
  'Key of one of the 14 monitored institutional categories (e.g. civilLiberties, executiveActions). The full list with display titles is in lib/data/categories.ts; category pages use the same keys.';

const WEEK_OF_DESC =
  'Monday (YYYY-MM-DD) anchoring the ISO week this row summarizes. Every weekly series in the system is Monday-anchored; a validation invariant (G2c) rejects off-grid dates. Weeks run Monday 00:00 UTC through Sunday.';

const DOCUMENT_COUNT_DESC =
  'Number of scored documents in the category-week: the count of document_scores rows, not of all stored documents. Only the counting population is scored — documents must have substantive content (≥100 chars), be retrieval-relevant, and (for court records) be inside the documented counting scope (see counting_scope). This rule is applied uniformly to ALL periods, past and present, so counts are directly comparable across collection-method changes.';

const SEVERITY_DESC =
  'Sum of final keyword-severity scores across the week’s scored documents. Keyword severity is an ANNOTATION layer only — it never drives concern status (AI document review does). Useful as a rough activity-intensity signal.';

const CONCERN_STATUS_DESC =
  'Convergence status for the category-week: Stable, Elevated, or ConfirmedConcern. Driven solely by AI document review (two-pass, cross-provider); structural, silence, and thematic layers are descriptive context and cannot change this value. Verified comparable across all pipeline changes by zero-flip gates.';

const SCORED_AT_DESC =
  'Timestamp when the keyword scorer produced this row. Re-scoring (repairs, rule changes) refreshes it; it is not the document’s publication time.';

const DOCUMENT_CLASS_DESC =
  'Document class assigned by the classifier (e.g. official_action, press_release, court_document) used to weight keyword severity — official actions weigh more than commentary. The multiplier applied is class_multiplier.';

const MATCH_TIER_DESC = (tier: string, weight: string) =>
  `Count of ${tier}-tier keyword matches in the document (after negation and suppression filtering). Tiers by increasing severity: warning, drift, capture; a ${tier} match carries weight ${weight} in severity_score.`;

// ---------------------------------------------------------------------------
// Weekly aggregates CSV
// ---------------------------------------------------------------------------

const STRUCTURAL_DIMS: Array<[string, string]> = [
  ['volume', 'weekly scored-document count'],
  [
    'typeComposition',
    'distribution of documents across source types (Jensen-Shannon divergence vs baseline mix)',
  ],
  [
    'functionalDistribution',
    'distribution across functional buckets like rulemaking/enforcement/personnel (JSD vs baseline)',
  ],
  ['agencyActivity', 'distribution of documents across issuing agencies (JSD vs baseline)'],
  ['publicationTempo', 'day-of-week publication variance'],
  [
    'sourceConvergence',
    'share of the week’s activity where government and independent sources cover the same stories',
  ],
];

function structuralEntries(): DictionaryEntry[] {
  const out: DictionaryEntry[] = [];
  for (const [dim, meaning] of STRUCTURAL_DIMS) {
    out.push(
      {
        name: `structural_${dim}`,
        type: 'number (z-score)',
        description: `Z-score of ${meaning} against the category’s cycle-matched baseline period (empirical mean/stddev; ±2 is notable, beyond ±3 unusual). Descriptive context only — does not drive concern_status.`,
      },
      {
        name: `structural_${dim}_raw`,
        type: 'number',
        description: `Raw value of ${meaning} for this week, before z-scoring.`,
      },
      {
        name: `structural_${dim}_baselineMean`,
        type: 'number',
        description: `Baseline mean of ${meaning}: the average weekly value across the cycle-matched baseline period (e.g. week 30 of a term compares to the same administration cycle-year of the Biden baseline).`,
      },
      {
        name: `structural_${dim}_baselineStdDev`,
        type: 'number',
        description: `Baseline standard deviation of ${meaning}; the denominator of structural_${dim}. Floored to avoid runaway z-scores when baseline variance is near zero.`,
      },
    );
  }
  return out;
}

const CSV_WEEKLY_ENTRIES: DictionaryEntry[] = [
  {
    name: 'id',
    type: 'integer',
    description:
      'Database row id of the weekly aggregate. Stable within one database copy only — do not use as a cross-download key; (category, weekOf) is the natural key.',
  },
  { name: 'category', type: 'string', description: CATEGORY_DESC },
  { name: 'weekOf', type: 'date', description: WEEK_OF_DESC },
  { name: 'totalSeverity', type: 'number', description: SEVERITY_DESC },
  { name: 'documentCount', type: 'integer', description: DOCUMENT_COUNT_DESC },
  {
    name: 'avgSeverityPerDoc',
    type: 'number',
    description: 'totalSeverity / documentCount; 0 when the week has no scored documents.',
  },
  {
    name: 'captureProportion',
    type: 'number 0–1',
    description:
      'Share of the week’s scored documents containing at least one capture-tier keyword match (the most severe annotation tier).',
  },
  {
    name: 'driftProportion',
    type: 'number 0–1',
    description: 'Share of scored documents with at least one drift-tier keyword match.',
  },
  {
    name: 'warningProportion',
    type: 'number 0–1',
    description:
      'Share of scored documents with at least one warning-tier keyword match (the mildest tier).',
  },
  {
    name: 'severityMix',
    type: 'number',
    description:
      'Weighted blend of the three tier proportions summarizing how severe the week’s keyword annotations skew. Annotation layer only.',
  },
  {
    name: 'captureMatchCount',
    type: 'integer',
    description: 'Total capture-tier keyword matches summed across the week’s documents.',
  },
  {
    name: 'driftMatchCount',
    type: 'integer',
    description: 'Total drift-tier keyword matches summed across the week’s documents.',
  },
  {
    name: 'warningMatchCount',
    type: 'integer',
    description: 'Total warning-tier keyword matches summed across the week’s documents.',
  },
  {
    name: 'suppressedMatchCount',
    type: 'integer',
    description:
      'Keyword matches removed by negation/context suppression rules (e.g. “no evidence of X”) and therefore excluded from the counts above.',
  },
  {
    name: 'topKeywords',
    type: 'string (comma-joined)',
    description: 'Most frequent matched keywords for the week, most common first.',
  },
  {
    name: 'structuralScore',
    type: 'number',
    description:
      'Composite structural anomaly score: mean of the absolute per-dimension z-scores (structural_* columns). Descriptive context only.',
  },
  {
    name: 'structural_composite',
    type: 'number',
    description:
      'Same composite as structuralScore, carried inside the structural detail; the two agree.',
  },
  ...structuralEntries(),
  {
    name: 'structural_anomalous',
    type: 'boolean',
    description:
      'True when the composite exceeds the anomaly threshold — a flag for “this week’s document-flow shape departs from baseline”, not a concern finding.',
  },
  {
    name: 'structural_driftTrend',
    type: 'string',
    description: 'Direction of the composite over recent weeks: rising, falling, or stable.',
  },
  {
    name: 'structural_longHorizon_cumulativeDeviation',
    type: 'number',
    description:
      'Sum of composite deviation over the long-horizon window — surfaces slow sustained shifts a single week never would.',
  },
  {
    name: 'structural_longHorizon_cumulativeWindow',
    type: 'integer (weeks)',
    description: 'Length of the long-horizon window the cumulative deviation is summed over.',
  },
  {
    name: 'structural_functionalShifts',
    type: 'string (bucket:direction pairs)',
    description:
      'Functional buckets whose share moved materially vs baseline, e.g. “enforcement:up, rulemaking:down”.',
  },
  {
    name: 'aiScore',
    type: 'number (z-score)',
    description:
      'Z-score of the week’s AI Pass-1 flag rate against the category baseline. Summary of the detection layer; the classification detail is in the ai_* columns.',
  },
  {
    name: 'ai_flagCount',
    type: 'integer',
    description:
      'Documents flagged by AI Pass 1 (screening model) as potentially erosion-relevant this week.',
  },
  {
    name: 'ai_totalDocuments',
    type: 'integer',
    description:
      'Documents the AI review pipeline evaluated this week — the L2 evidence population. Can differ from documentCount: review eligibility (content ≥100 chars, retrieval-relevant) is not restricted by counting_scope, so out-of-scope court opinions are still reviewed as evidence.',
  },
  { name: 'ai_flagRate', type: 'number 0–1', description: 'ai_flagCount / ai_totalDocuments.' },
  {
    name: 'ai_concernRate',
    type: 'number 0–1',
    description:
      'Share of Pass-2-reviewed documents classified potentially or clearly concerning. The primary driver of concern_status.',
  },
  {
    name: 'ai_p2_routine',
    type: 'integer',
    description: 'Pass-2 classifications: routine government activity.',
  },
  {
    name: 'ai_p2_novelNotConcerning',
    type: 'integer',
    description: 'Pass-2 classifications: novel but not concerning.',
  },
  {
    name: 'ai_p2_potentiallyConcerning',
    type: 'integer',
    description: 'Pass-2 classifications: potentially concerning — contributes to ai_concernRate.',
  },
  {
    name: 'ai_p2_clearlyConcerning',
    type: 'integer',
    description: 'Pass-2 classifications: clearly concerning — contributes to ai_concernRate.',
  },
  {
    name: 'ai_auditFalseNegativeRate',
    type: 'number 0–1',
    description:
      'From the audit sample of Pass-1-UNflagged documents sent to Pass 2 anyway: the share Pass 2 would have flagged. Measures what screening misses.',
  },
  {
    name: 'thematicScore',
    type: 'number (z-score)',
    description: 'Same value as thematic_zScore, surfaced at the top level.',
  },
  {
    name: 'thematic_centroidDistance',
    type: 'number 0–2',
    description:
      'Cosine distance between this week’s document-embedding centroid and the rolling 8-week centroid. Higher = the week’s topics moved further from the recent norm. Computed over the counting population.',
  },
  {
    name: 'thematic_zScore',
    type: 'number (z-score)',
    description:
      'centroidDistance z-scored against the rolling 8-week window’s own mean/stddev. Mean-reverting by construction — single-week spikes matter more than long runs. Descriptive context only.',
  },
  {
    name: 'thematic_novelDocRate',
    type: 'number 0–1',
    description:
      'Share of the week’s documents farther than the novelty threshold (calibrated to the 90th percentile of doc-to-centroid distances) from the rolling centroid.',
  },
  {
    name: 'thematic_varianceRatio',
    type: 'number',
    description:
      'This week’s embedding variance over the rolling window’s variance: >1 = topics more scattered than usual, <1 = more concentrated.',
  },
  {
    name: 'thematic_crossAdminDistance',
    type: 'number 0–2',
    description:
      'Distance between this week’s centroid and the cycle-matched baseline administration’s centroid — how far topics sit from the prior administration’s norm.',
  },
  {
    name: 'thematic_rollingWindow_weeks',
    type: 'integer',
    description:
      'Weeks actually available in the rolling window (up to 8; fewer near a term start).',
  },
  {
    name: 'thematic_rollingWindow_meanDistance',
    type: 'number',
    description:
      'Mean weekly centroid distance across the rolling window — the baseline thematic_zScore compares against.',
  },
  {
    name: 'thematic_rollingWindow_stdDev',
    type: 'number',
    description:
      'Standard deviation of the rolling window’s distances — thematic_zScore’s denominator.',
  },
  {
    name: 'thematic_crossAdminBaseline',
    type: 'string',
    description: 'Identifier of the baseline period used for crossAdminDistance (e.g. biden_2022).',
  },
  {
    name: 'thematic_bootstrap',
    type: 'boolean',
    description:
      'True in early-term weeks where the rolling window is too short for reliable statistics — treat thematic values as low-confidence.',
  },
  {
    name: 'convergenceScore',
    type: 'integer',
    description:
      'Count of layers reading elevated this week (the concern_*Elevated flags). Context only; concern_status is not a function of this count.',
  },
  { name: 'concern_status', type: 'string enum', description: CONCERN_STATUS_DESC },
  {
    name: 'concern_pattern',
    type: 'string',
    description:
      'Short machine-generated description of which layers are elevated and how they align.',
  },
  {
    name: 'concern_structuralElevated',
    type: 'boolean',
    description: 'Structural composite above its elevation threshold this week (context flag).',
  },
  {
    name: 'concern_aiElevated',
    type: 'boolean',
    description: 'AI review layer elevated — the flag that drives concern_status.',
  },
  {
    name: 'concern_silenceElevated',
    type: 'boolean',
    description:
      'Silence detection found government sources conspicuously quiet while independent sources stayed active (context flag).',
  },
  {
    name: 'concern_thematicElevated',
    type: 'boolean',
    description: 'Thematic drift above its elevation threshold this week (context flag).',
  },
  {
    name: 'computedAt',
    type: 'timestamp',
    description: 'When the aggregate row was last computed. Repairs and re-derivations refresh it.',
  },
];

// ---------------------------------------------------------------------------
// Document scores CSV
// ---------------------------------------------------------------------------

const CSV_SCORES_ENTRIES: DictionaryEntry[] = [
  {
    name: 'id',
    type: 'integer',
    description:
      'Database row id of the score row (single-copy stable only; use url + category as the natural key).',
  },
  {
    name: 'documentId',
    type: 'integer|empty',
    description: 'Row id of the scored document in the documents table, when linked.',
  },
  {
    name: 'url',
    type: 'string',
    description:
      'Source URL of the document — the stable join key to the documents table (with category).',
  },
  { name: 'category', type: 'string', description: CATEGORY_DESC },
  {
    name: 'severityScore',
    type: 'number',
    description:
      'Weighted sum of the document’s keyword matches (tier weights: capture > drift > warning), before the class multiplier. Annotation layer only — never drives concern status.',
  },
  {
    name: 'finalScore',
    type: 'number',
    description: 'severityScore × classMultiplier — the value weekly totalSeverity sums.',
  },
  { name: 'captureCount', type: 'integer', description: MATCH_TIER_DESC('capture', 'highest') },
  { name: 'driftCount', type: 'integer', description: MATCH_TIER_DESC('drift', 'middle') },
  { name: 'warningCount', type: 'integer', description: MATCH_TIER_DESC('warning', 'lowest') },
  {
    name: 'suppressedCount',
    type: 'integer',
    description: 'Matches removed by negation/suppression rules for this document.',
  },
  { name: 'documentClass', type: 'string', description: DOCUMENT_CLASS_DESC },
  {
    name: 'classMultiplier',
    type: 'number',
    description:
      'Weight applied to severityScore for the document class (official actions above commentary).',
  },
  {
    name: 'isHighAuthority',
    type: 'boolean',
    description: 'Source is a high-authority issuer (courts, GAO, inspectors general).',
  },
  {
    name: 'matches_count',
    type: 'integer',
    description:
      'Number of keyword matches kept after suppression (equals captureCount + driftCount + warningCount).',
  },
  {
    name: 'matches_keywords',
    type: 'string (comma-joined)',
    description: 'The matched keywords themselves.',
  },
  {
    name: 'suppressed_count',
    type: 'integer',
    description: 'Number of suppressed matches (equals suppressedCount).',
  },
  {
    name: 'suppressed_keywords',
    type: 'string (comma-joined)',
    description:
      'Keywords whose matches were suppressed, with the applicable rule recorded in the full dump’s JSON.',
  },
  { name: 'scoredAt', type: 'timestamp', description: SCORED_AT_DESC },
  { name: 'weekOf', type: 'date', description: WEEK_OF_DESC },
];

// ---------------------------------------------------------------------------
// Dump tables
// ---------------------------------------------------------------------------

const TABLE_DOCUMENTS: DictionaryEntry[] = [
  {
    name: 'id',
    type: 'serial',
    description:
      'Row id (single-copy stable only). The natural key is (url, category) — one document can appear under several categories.',
  },
  {
    name: 'source_type',
    type: 'varchar',
    description:
      'Kind of document as ingested: e.g. judicial_opinion, press_release (DOJ API or DHS/ICE/CBP newsrooms — distinguish by source_origin), bill, floor_speech, or a Federal Register type like Rule / Notice. Format change 2026-08: court_opinion (docket-entry stub) rows were retired — the case universe they carried moved to tracked_cases.',
  },
  { name: 'category', type: 'varchar', description: CATEGORY_DESC },
  { name: 'title', type: 'text', description: 'Document title as published by the source.' },
  {
    name: 'content',
    type: 'text|null',
    description:
      'Full text as fetched (PDF-extracted where the source publishes PDFs). Stored raw — boilerplate stripping happens at assessment time only. An upsert guard never replaces substantive content (≥100 chars) with a near-empty refetch.',
  },
  {
    name: 'url',
    type: 'text',
    description: 'Source URL; with category, the natural key used by every derived table.',
  },
  {
    name: 'published_at',
    type: 'timestamptz|null',
    description:
      'Publication time claimed by the source. Drives week assignment (Monday of its ISO week).',
  },
  {
    name: 'fetched_at',
    type: 'timestamptz',
    description: 'When this row was last written by ingestion (refreshed on re-fetch upserts).',
  },
  {
    name: 'metadata',
    type: 'jsonb|null',
    description:
      'Source-specific fields: agency (issuing agency or human-readable court name), action, suitNature (court NOS code), caseId, clQueries (CourtListener query provenance), and others varying by source.',
  },
  {
    name: 'source_origin',
    type: 'varchar|null',
    description:
      'Ingestion pipeline that produced the row: federal_register, courtlistener, doj, govinfo, govinfo_cpd, crec, chrg (congressional hearing transcripts, routed by title + opening-statement topic classification), oig, fec, legiscan, dhs_press (DHS/ICE/CBP newsroom scrape; CBP restricted to national media releases — the port-level local-media-release URL class is excluded at fetch, owner decision 2026-08-07; cross-host HQ mirrors deduped by normalized title + day with ICE > CBP > DHS precedence; the ICE HSI criminal-investigation subset also stores to lawEnforcement). Legacy origins (whitehouse, gdelt) remain stored but are excluded from all analysis.',
  },
  {
    name: 'content_type',
    type: 'varchar',
    description:
      'full_text, or metadata_only for rows that intentionally carry no body (GDELT rhetoric records and unobtainable-body documents) — metadata_only rows are excluded from counts, statistics, embeddings, and search. Format change 2026-08: the largest metadata_only population, docket-entry stubs, was retired to tracked_cases.',
  },
  {
    name: 'parent_id',
    type: 'integer|null',
    description:
      "Fragment lineage (2026-08): set on rows split out of a multi-topic Congressional Record granule; points at the parent documents.id, which remains the single source for the origin URL and metadata. Fragments are searchable (embedded) but sit outside the counting population (counting_scope=false) and outside AI assessment — see the methodology page's Congressional Record granularity note. NULL for all non-fragment documents.",
  },
  {
    name: 'case_id',
    type: 'varchar|null',
    description:
      'Court-case identifier used to group filings and dedupe case-level counting. For CourtListener rows the format is cl:<docketId>, where <docketId> is the CourtListener docket primary key — joinable to https://www.courtlistener.com/docket/<docketId>/, the v4 API (/api/rest/v4/docket-entries/?docket=<docketId>), and tracked_cases.case_id (the case-level record: court, dates, status, posture). Every CourtListener opinion carries case_id.',
  },
  {
    name: 'speaker',
    type: 'varchar|null',
    description: 'Attributed speaker for floor speeches (CREC).',
  },
  {
    name: 'embedding',
    type: 'vector|null',
    description:
      'Text embedding (pgvector) used by thematic drift and semantic search. Computed only for the counting population.',
  },
  {
    name: 'embedded_at',
    type: 'timestamptz|null',
    description:
      'When the embedding was computed; also set as an attempted marker when embedding failed so the pipeline does not retry forever. NULL = not yet embedded (or re-queued after a content repair).',
  },
  {
    name: 'retrieval_relevant',
    type: 'boolean|null',
    description:
      'NULL/true = relevant. false = annotated off-topic for its category by the retrieval-relevance filter; kept for auditability but excluded from assessment, statistics, search, and exports of derived values.',
  },
  {
    name: 'counting_scope',
    type: 'boolean|null',
    description:
      'NULL/true = inside the counting population. false = a court-category judicial opinion outside the documented counting rule (classifier v1: every SCOTUS opinion; circuit/D.D.C. opinions containing executive-power phrases). Applied uniformly to ALL eras so document counts are method-consistent across the February 2026 collection change. Out-of-scope opinions stay stored and remain AI-review evidence — this flag governs counting only.',
  },
  {
    name: 'search_vector',
    type: 'tsvector (database-managed)',
    description:
      'Generated full-text search index over title/content. Maintained by the database, not application code; not present in the Drizzle schema.',
  },
];

const TABLE_DOCUMENT_SCORES: DictionaryEntry[] = CSV_SCORES_ENTRIES.filter(
  (e) =>
    !['matches_count', 'matches_keywords', 'suppressed_count', 'suppressed_keywords'].includes(
      e.name,
    ),
)
  .map((e) => ({
    ...e,
    name: e.name
      .replace('documentId', 'document_id')
      .replace('severityScore', 'severity_score')
      .replace('finalScore', 'final_score')
      .replace('captureCount', 'capture_count')
      .replace('driftCount', 'drift_count')
      .replace('warningCount', 'warning_count')
      .replace('suppressedCount', 'suppressed_count')
      .replace('documentClass', 'document_class')
      .replace('classMultiplier', 'class_multiplier')
      .replace('isHighAuthority', 'is_high_authority')
      .replace('scoredAt', 'scored_at')
      .replace('weekOf', 'week_of'),
  }))
  .concat([
    {
      name: 'matches',
      type: 'jsonb',
      description:
        'Kept keyword matches with tier, weight, and a text snippet of surrounding context for each (the CSV flattens this to counts + keywords).',
    },
    {
      name: 'suppressed',
      type: 'jsonb',
      description:
        'Suppressed matches with the negation/suppression rule and reason each one triggered.',
    },
  ]);

const TABLE_WEEKLY_AGGREGATES: DictionaryEntry[] = [
  ...CSV_WEEKLY_ENTRIES.filter((e) => ['category'].includes(e.name)),
  { name: 'id', type: 'serial', description: 'Row id. Natural key: (category, week_of).' },
  { name: 'week_of', type: 'date', description: WEEK_OF_DESC },
  { name: 'total_severity', type: 'real', description: SEVERITY_DESC },
  { name: 'document_count', type: 'integer', description: DOCUMENT_COUNT_DESC },
  {
    name: 'avg_severity_per_doc',
    type: 'real',
    description: 'total_severity / document_count (0 for empty weeks).',
  },
  {
    name: 'capture_proportion',
    type: 'real',
    description: 'Share of scored documents with ≥1 capture-tier match.',
  },
  {
    name: 'drift_proportion',
    type: 'real',
    description: 'Share of scored documents with ≥1 drift-tier match.',
  },
  {
    name: 'warning_proportion',
    type: 'real',
    description: 'Share of scored documents with ≥1 warning-tier match.',
  },
  {
    name: 'severity_mix',
    type: 'real',
    description: 'Weighted blend of tier proportions (annotation layer).',
  },
  {
    name: 'capture_match_count',
    type: 'integer',
    description: 'Total capture-tier matches across the week.',
  },
  {
    name: 'drift_match_count',
    type: 'integer',
    description: 'Total drift-tier matches across the week.',
  },
  {
    name: 'warning_match_count',
    type: 'integer',
    description: 'Total warning-tier matches across the week.',
  },
  {
    name: 'suppressed_match_count',
    type: 'integer',
    description: 'Matches removed by suppression rules across the week.',
  },
  {
    name: 'top_keywords',
    type: 'jsonb',
    description: 'Most frequent matched keywords with counts (CSV joins these to a string).',
  },
  {
    name: 'structural_score',
    type: 'real|null',
    description:
      'Composite structural anomaly score (see the weekly CSV structural_* columns for the flattened detail).',
  },
  {
    name: 'structural_detail',
    type: 'jsonb|null',
    description:
      'Full structural result: per-dimension z-scores with raw/baseline stats, anomaly flag, drift trend, long-horizon accumulation, functional shifts. The CSV structural_* columns are this object flattened.',
  },
  {
    name: 'thematic_score',
    type: 'real|null',
    description: 'Thematic drift z-score (see thematic_* CSV columns).',
  },
  {
    name: 'thematic_detail',
    type: 'jsonb|null',
    description:
      'Full thematic result: centroid distance, novelty rate, variance ratio, rolling-window stats, cross-admin comparison, bootstrap flag.',
  },
  {
    name: 'convergence_score',
    type: 'integer|null',
    description: 'Count of elevated layers (context only).',
  },
  {
    name: 'convergence_detail',
    type: 'jsonb|null',
    description:
      'Concern synthesis: status (drives everything status-colored in the UI), pattern description, per-layer elevation flags.',
  },
  {
    name: 'ai_score',
    type: 'real|null',
    description: 'AI flag-rate z-score (see ai_* CSV columns).',
  },
  {
    name: 'ai_detail',
    type: 'jsonb|null',
    description:
      'AI review summary: flag counts and rates, Pass-2 classification distribution, audit false-negative rate.',
  },
  {
    name: 'computed_at',
    type: 'timestamptz',
    description: 'When the aggregate was last recomputed.',
  },
  {
    name: 'enriched_at',
    type: 'timestamptz|null',
    description:
      'Lineage stamp: when the enrichment layers (structural/AI summary/thematic/convergence) last ran for this row. NULL on legacy rows enriched before the stamp existed (mid-2026); validation treats those as a warning, not an error.',
  },
];

const TABLE_AI_ASSESSMENTS: DictionaryEntry[] = [
  { name: 'id', type: 'serial', description: 'Row id. Natural key: (url, category, pass).' },
  {
    name: 'document_id',
    type: 'integer|null',
    description: 'Row id of the assessed document, when linked.',
  },
  {
    name: 'url',
    type: 'text',
    description: 'Assessed document URL (join to documents with category).',
  },
  { name: 'category', type: 'varchar', description: CATEGORY_DESC },
  {
    name: 'pass',
    type: 'integer',
    description:
      '1 = screening pass (flags potentially erosion-relevant documents), 2 = detailed classification of flagged documents. Different model providers per pass for epistemic independence.',
  },
  {
    name: 'relevant',
    type: 'boolean|null',
    description: 'Pass 1: whether the document was flagged as potentially erosion-relevant.',
  },
  {
    name: 'confidence',
    type: 'real|null',
    description: 'Model-reported confidence for its judgment (0–1).',
  },
  {
    name: 'erosion_type',
    type: 'varchar|null',
    description:
      'Pass 2 erosion taxonomy: e.g. formal_override, operational_hollowing, norm_erosion — or null when not concerning.',
  },
  {
    name: 'erosion_actor',
    type: 'varchar|null',
    description:
      'Attributed acting institution (e.g. fed_exec, state_local, judiciary) from the actor-attribution pass — distinguishes federal-executive action from other actors.',
  },
  {
    name: 'signals',
    type: 'jsonb|null',
    description: 'Structured signals the model cited (named patterns with short evidence).',
  },
  {
    name: 'assessment',
    type: 'varchar|null',
    description:
      'Pass 2 classification: routine, novel_not_concerning, potentially_concerning, clearly_concerning. Weekly concern rates aggregate this field.',
  },
  {
    name: 'reasoning',
    type: 'text|null',
    description: 'Model’s stated reasoning for the classification.',
  },
  {
    name: 'comparative_context',
    type: 'text|null',
    description: 'Pass 2: how the action compares to prior-administration norms.',
  },
  {
    name: 'cited_passages',
    type: 'jsonb|null',
    description: 'Verbatim passages from the document the model cited as evidence.',
  },
  {
    name: 'counter_arguments',
    type: 'text|null',
    description:
      'Model-generated strongest case AGAINST its own classification (skeptic discipline).',
  },
  {
    name: 'is_audit_sample',
    type: 'boolean',
    description:
      'True when a Pass-1-unflagged document was deliberately sent to Pass 2 as an audit of screening recall — these rows power the audit false-negative rate.',
  },
  {
    name: 'model',
    type: 'varchar',
    description:
      'Model identifier that produced the row (e.g. gpt-4o-mini for Pass 1, a Claude model for Pass 2).',
  },
  {
    name: 'provider',
    type: 'varchar',
    description: 'Model provider (openai / anthropic) — cross-provider by design.',
  },
  {
    name: 'prompt_version',
    type: 'varchar',
    description:
      'Version tag of the prompt in force. Compare rates across prompt versions with care — calibration changes shift flag rates (documented in the methodology).',
  },
  {
    name: 'tokens_input',
    type: 'integer|null',
    description: 'Input tokens billed for the call (cost transparency).',
  },
  {
    name: 'tokens_output',
    type: 'integer|null',
    description: 'Output tokens billed for the call.',
  },
  {
    name: 'latency_ms',
    type: 'integer|null',
    description: 'Wall-clock latency of the model call, in milliseconds.',
  },
  { name: 'week_of', type: 'date', description: WEEK_OF_DESC },
  {
    name: 'assessed_at',
    type: 'timestamptz',
    description:
      'When the assessment ran. Downstream freshness invariants compare enrichment and narrative timestamps against the newest assessed_at in each week.',
  },
];

const TABLE_BASELINES: DictionaryEntry[] = [
  { name: 'id', type: 'serial', description: 'Row id. Natural key: (baseline_id, category).' },
  {
    name: 'baseline_id',
    type: 'varchar',
    description:
      'Baseline period identifier, e.g. biden_2022 or trump_2018 — one prior-administration cycle year. Current-term weeks compare against the cycle-matched baseline.',
  },
  { name: 'category', type: 'varchar', description: CATEGORY_DESC },
  {
    name: 'avg_weekly_severity',
    type: 'real',
    description:
      'Mean weekly total_severity across the baseline period (annotation layer reference).',
  },
  {
    name: 'stddev_weekly_severity',
    type: 'real',
    description: 'Standard deviation of weekly severity across the baseline period.',
  },
  {
    name: 'avg_weekly_doc_count',
    type: 'real',
    description:
      'Mean weekly scored-document count in the baseline period, under the same uniform counting rules as every other period.',
  },
  {
    name: 'avg_severity_mix',
    type: 'real',
    description: 'Mean weekly severity_mix across the baseline period.',
  },
  {
    name: 'drift_noise_floor',
    type: 'real|null',
    description:
      'Baseline week-to-week centroid movement (mean + stddev): the amount of thematic drift that is normal for this category. Null when the period lacks embeddings.',
  },
  {
    name: 'embedding_centroid',
    type: 'vector|null',
    description:
      'Mean embedding of the baseline period’s counting-population documents — the reference point for cross-administration thematic distance.',
  },
  {
    name: 'cycle_year',
    type: 'integer|null',
    description:
      'Year within the presidential term (1–4) this baseline covers; used for cycle-matched comparison.',
  },
  {
    name: 'administration',
    type: 'varchar|null',
    description: 'Administration the baseline period belongs to (biden / trump).',
  },
  {
    name: 'calendar_year',
    type: 'integer|null',
    description: 'Calendar year the period mostly covers, for convenience.',
  },
  {
    name: 'computed_at',
    type: 'timestamptz',
    description:
      'When baseline statistics were last recomputed (re-derivations refresh all baselines under current rules).',
  },
];

const TABLE_NARRATIVES: DictionaryEntry[] = [
  { name: 'id', type: 'serial', description: 'Row id. Natural key: (category, week_of, version).' },
  { name: 'category', type: 'varchar', description: CATEGORY_DESC },
  { name: 'week_of', type: 'date', description: WEEK_OF_DESC },
  {
    name: 'version',
    type: 'varchar',
    description: 'Narrative audience/format version (expert and public variants).',
  },
  { name: 'content', type: 'text', description: 'The generated narrative text (markdown).' },
  {
    name: 'model',
    type: 'varchar',
    description:
      'Model that generated the narrative (multi-pass: draft and final are Claude, critique is GPT).',
  },
  {
    name: 'generated_at',
    type: 'timestamptz',
    description:
      'When this text was generated. Never rewritten — it is provenance. A narrative can be older than later assessment data for its week; see staleness_accepted_at.',
  },
  {
    name: 'staleness_accepted_at',
    type: 'timestamptz|null',
    description:
      'Owner’s explicit accept-as-is decision after reviewing post-generation assessment changes for the week (repairs/backfills routinely extend past weeks’ assessment sets without changing statuses). Assessment data newer than this stamp re-flags the narrative in validation. Null = never needed acceptance, or staleness not yet reviewed.',
  },
];

/** tracked_cases dump table (#693). */
const TABLE_TRACKED_CASES: DictionaryEntry[] = [
  { name: 'id', type: 'serial', description: 'Row id (stable within a single dump only).' },
  {
    name: 'case_id',
    type: 'varchar',
    description:
      'cl:<docketId> — the same identifier documents.case_id carries for CourtListener rows; unique here (one row per case).',
  },
  {
    name: 'docket_id',
    type: 'bigint',
    description: 'CourtListener docket primary key (numeric form of case_id).',
  },
  {
    name: 'categories',
    type: 'jsonb',
    description:
      'Monitored categories this case is routed to (string array). The authoritative case→category mapping — previously recoverable only from metadata-only docket-stub document rows.',
  },
  {
    name: 'case_name',
    type: 'text',
    description: 'Case caption (bulk-authoritative when available, else as first observed).',
  },
  {
    name: 'court_id',
    type: 'varchar|null',
    description: 'CourtListener court identifier (e.g. dcd, ca9, scotus).',
  },
  {
    name: 'court_name',
    type: 'varchar|null',
    description: 'Human-readable court name for display (from bulk court data).',
  },
  {
    name: 'docket_number',
    type: 'varchar|null',
    description: 'Court docket number as assigned by the filing court.',
  },
  {
    name: 'nature_of_suit',
    type: 'varchar|null',
    description: 'PACER nature-of-suit string (e.g. "440 Civil rights other").',
  },
  {
    name: 'cause',
    type: 'varchar|null',
    description: 'PACER cause-of-action string (statute and claim shorthand).',
  },
  {
    name: 'date_filed',
    type: 'date|null',
    description: 'Case filing date per CourtListener bulk data or API refresh.',
  },
  {
    name: 'date_terminated',
    type: 'date|null',
    description: 'Docket termination date; null while the case is open.',
  },
  {
    name: 'date_last_filing',
    type: 'date|null',
    description: 'Most recent filing date CourtListener has recorded.',
  },
  {
    name: 'status',
    type: 'varchar',
    description: "'open' or 'terminated' — derived from date_terminated.",
  },
  {
    name: 'posture',
    type: 'jsonb|null',
    description:
      'Cached one-line case posture from the live docket-timeline fetch: { line, eventType, date, asOf }. asOf is the CourtListener fetch time — the data age.',
  },
  {
    name: 'case_summary',
    type: 'text|null',
    description:
      'Plain-language description of what the case is about, copied from the latest Pass-2 AI review reasoning of an opinion in this case (ai_document_assessments.reasoning) — AI-generated analysis, not a finding of fact. Present only for cases with an AI-assessed opinion (~4% of cases, concentrated on erosion-relevant litigation); synced weekly.',
  },
  {
    name: 'cluster_disposition',
    type: 'text|null',
    description: "Latest opinion cluster's disposition text (bulk-sourced).",
  },
  {
    name: 'cluster_precedential',
    type: 'varchar|null',
    description: 'Latest opinion cluster precedential status (published/unpublished).',
  },
  {
    name: 'cluster_citation_count',
    type: 'integer|null',
    description: 'Citation count of the latest opinion cluster on this docket.',
  },
  {
    name: 'provenance',
    type: 'jsonb|null',
    description:
      "How the case entered the universe: union of CourtListener query provenance markers (e.g. 'scotus-all', 'circuits-exec', 'dcd-exec') plus 'stub-seed' (historical seed) or 'ingest' (weekly discovery).",
  },
  {
    name: 'first_seen_at',
    type: 'timestamptz|null',
    description: 'Earliest ingestion touch across the historical seed rows.',
  },
  {
    name: 'last_seen_at',
    type: 'timestamptz|null',
    description: 'Most recent ingestion touch (weekly discovery or seed).',
  },
  {
    name: 'refreshed_at',
    type: 'timestamptz|null',
    description: 'Last CourtListener API refresh; null = bulk/seed data only.',
  },
  {
    name: 'created_at',
    type: 'timestamptz',
    description: 'When this tracked-case row was first created.',
  },
];

export const DATA_DICTIONARY: DictionaryArtifact[] = [
  {
    key: 'csv_weekly',
    title: 'Weekly Aggregates CSV',
    description:
      'One row per category-week: keyword annotation totals plus the flattened structural, AI, thematic, and concern layers. The grain of every trend surface on the site.',
    entries: CSV_WEEKLY_ENTRIES,
  },
  {
    key: 'csv_scores',
    title: 'Document Scores CSV',
    description:
      'One row per scored document: keyword annotation detail. Scored documents are the counting population — see documentCount in the weekly CSV for the rules.',
    entries: CSV_SCORES_ENTRIES,
  },
  {
    key: 'table_tracked_cases',
    title: 'tracked_cases (dump)',
    description:
      'One row per tracked federal case: the case→category routing universe (191,800 cases) joined with CourtListener docket metadata (filing/termination dates, status) and an optional cached posture line. Seeded from CourtListener bulk docket data plus our historical docket-stub rows; refreshed weekly for open cases. Format change 2026-08: this table replaces the ~283k metadata-only docket-stub rows formerly in documents — the case universe and activity dates now live here.',
    entries: TABLE_TRACKED_CASES,
  },
  {
    key: 'table_documents',
    title: 'documents (dump)',
    description:
      'Every ingested source document with full text and lineage flags. The flags matter: content_type, retrieval_relevant, and counting_scope define which rows the statistics describe. A document appears once per category that fetched it (url + category is the natural key); routing follows the signal definitions in lib/data/categories.ts. Two sources use derived routing rules: DHS OIG reports also appear under Immigration Enforcement when the component tag assigned by DHS OIG (stored in metadata.dhsComponents) is ICE, CBP, or USCIS, OR when the report title matches ICE/CBP/USCIS (case-sensitive) or border/immigra-/detention/detainee/deportation/asylum/287(g)/migrant/unaccompanied/correctional facility or center/processing center/ports of entry/alien/expedited removal (case-insensitive). Congressional documents (CREC floor speeches, CHRG hearing transcripts) are routed to every category whose topic terms (lib/data/topic-routing-terms.ts) match — hearings classify on the title plus the first 6,000 characters of the transcript, with hearing-specific term calibrations documented in that file; hearings matching no category are recorded in chrg_seen_ledger rather than ingested. Opinion rows carry a case_id (cl:<docketId>, the CourtListener docket key) joining them to tracked_cases, which holds case-level metadata. Format change 2026-08: ~283k metadata-only docket-entry stub rows were removed from this table; the case universe they indexed now lives in tracked_cases.',
    entries: TABLE_DOCUMENTS,
  },
  {
    key: 'table_document_scores',
    title: 'document_scores (dump)',
    description: 'Per-document keyword annotation rows; the JSON match detail the CSV flattens.',
    entries: TABLE_DOCUMENT_SCORES,
  },
  {
    key: 'table_weekly_aggregates',
    title: 'weekly_aggregates (dump)',
    description: 'The weekly CSV’s source table, with layer detail as JSON plus lineage stamps.',
    entries: TABLE_WEEKLY_AGGREGATES,
  },
  {
    key: 'table_ai_document_assessments',
    title: 'ai_document_assessments (dump)',
    description:
      'Per-document AI review rows — the sole active detection layer. Both passes, full reasoning, citations, audit samples, and per-call cost fields.',
    entries: TABLE_AI_ASSESSMENTS,
  },
  {
    key: 'table_baselines',
    title: 'baselines (dump)',
    description:
      'Per-category statistics for each prior-administration cycle-year baseline period.',
    entries: TABLE_BASELINES,
  },
  {
    key: 'table_narratives',
    title: 'narratives (dump)',
    description: 'AI-generated weekly and term narrative texts with generation provenance.',
    entries: TABLE_NARRATIVES,
  },
];
