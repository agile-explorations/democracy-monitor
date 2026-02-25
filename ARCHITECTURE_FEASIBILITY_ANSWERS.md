# Architecture Feasibility Answers

**Date:** 2026-02-22
**Context:** Answers to 8 questions for Claude Online to generate an Architecture Proposal document.
**Source:** Codebase investigation + spike findings from `SPIKE_FUNCTIONAL_CLASSIFICATION_FINDINGS.md`

---

## Q1: What embedding infrastructure already exists?

**Full pgvector pipeline is operational.** The codebase has:

- **Embedding model**: OpenAI `text-embedding-3-small`, 1536 dimensions (`lib/services/embedding-service.ts`)
- **Storage**: `vector(1536)` custom type on `documents.embedding` column and `baselines.embedding_centroid` column, plus `p2025_proposals.embedding` (`lib/db/schema.ts:17-30`)
- **Core functions** (`embedding-service.ts`): `embedText()`, `embedBatch()`, `computeCentroid()`, `cosineSimilarity()`
- **Semantic drift** (`semantic-drift-service.ts`): `computeWeekCentroid()` averages all embedded docs for a category/week, `computeSemanticDrift()` compares week centroid vs baseline centroid using cosine similarity, normalizes against a `driftNoiseFloor`
- **Clustering** (`semantic-clustering-service.ts`): Full k-means implementation over embeddings, AI-generated cluster labels, stores results in `semantic_clusters` table
- **P2025 matching** (`p2025-matcher.ts`): `findSimilarProposals()` uses pgvector cosine similarity with threshold=0.5, `classifyMatch()` uses LLM judge for `implements`/`exceeds`/`loosely_related`/`not_related` verdicts
- **Document embedder** (`document-embedder.ts`): `embedUnprocessedDocuments()` called during snapshot for rhetoric docs
- **Baselines** store `embeddingCentroid` (vector) and `driftNoiseFloor` (real) per category

**Key gap**: Embeddings are currently only generated for rhetoric/intent documents during `snapshotRhetoric()` (line 85 of snapshot.ts). FR documents are NOT automatically embedded. The infrastructure exists but coverage is partial.

---

## Q2: What is the actual schema for `documents` and `document_scores`?

### `documents` table (`schema.ts:40-52`)

| Column         | Type            | Notes                                                                  |
| -------------- | --------------- | ---------------------------------------------------------------------- |
| `id`           | serial PK       |                                                                        |
| `source_type`  | varchar(50)     | `Notice`, `Rule`, `Proposed Rule`, `Presidential Document`, `rhetoric` |
| `category`     | varchar(50)     | One of 11 categories + `intent`                                        |
| `title`        | text            |                                                                        |
| `content`      | text (nullable) | Body text when available                                               |
| `url`          | text (unique)   | Upsert key                                                             |
| `published_at` | timestamptz     |                                                                        |
| `fetched_at`   | timestamptz     |                                                                        |
| `metadata`     | jsonb           | **Only stores `{agency: string}`** — no other FR API fields            |
| `embedding`    | vector(1536)    | pgvector column, nullable                                              |
| `embedded_at`  | timestamptz     |                                                                        |

### `document_scores` table (`schema.ts:206-232`)

| Column              | Type               | Notes                                     |
| ------------------- | ------------------ | ----------------------------------------- |
| `id`                | serial PK          |                                           |
| `document_id`       | integer (nullable) | FK to documents, resolved post-store      |
| `url`               | text (unique)      |                                           |
| `category`          | varchar(50)        |                                           |
| `severity_score`    | real               | Raw keyword severity                      |
| `final_score`       | real               | After class multiplier                    |
| `capture_count`     | integer            |                                           |
| `drift_count`       | integer            |                                           |
| `warning_count`     | integer            |                                           |
| `suppressed_count`  | integer            |                                           |
| `document_class`    | varchar(20)        | `executive_order`, `rule`, `notice`, etc. |
| `class_multiplier`  | real               | Authority weight                          |
| `is_high_authority` | boolean            |                                           |
| `matches`           | jsonb (array)      | Full keyword match details                |
| `suppressed`        | jsonb (array)      | Suppressed matches                        |
| `scored_at`         | timestamptz        |                                           |
| `week_of`           | date               | Monday-based week                         |

Indexes on: `(category, week_of)`, `(document_id)`, `(url)`.

### Other relevant tables

- **`weekly_aggregates`** — Per-category-per-week rollup: `total_severity`, `document_count`, `avg_severity_per_doc`, `capture/drift/warning_proportion`, `severity_mix`, match counts, `top_keywords`. Unique on `(category, week_of)`.
- **`baselines`** — Per-baseline-per-category: `avg_weekly_severity`, `stddev_weekly_severity`, `avg_weekly_doc_count`, `avg_severity_mix`, `drift_noise_floor`, `embedding_centroid` (vector), `cycle_year`, `administration`. Unique on `(baseline_id, category)`.
- **`assessments`** — Weekly snapshots: `category`, `status`, `reason`, `matches` (jsonb), `detail` (jsonb), `ai_provider`, `confidence`.
- **`cycle_adjustment_factors`** — Year 1 vs Year 2 severity/volume/stddev ratios per category.
- **`semantic_clusters`** — `label`, `description`, `document_count`, `top_keywords`, `categories`.
- **`p2025_proposals`** — With `embedding` vector column for similarity matching.
- **`p2025_matches`** — `cosine_similarity`, `llm_classification`, `llm_confidence`.

Full schema: 19 tables total in `lib/db/schema.ts` (402 lines).

---

## Q3: Can structural anomaly (baseline metadata distributions) be computed from existing data?

**Yes, for `source_type` distribution.** The spike confirmed this with live queries against 132K+ documents. We have `source_type` values (`Notice`, `Rule`, `Proposed Rule`, `Presidential Document`, `rhetoric`) on every document. The spike computed cross-administration comparisons and found real signal:

- Presidential Documents tripled in civilService (3.5% -> 10.4%)
- Excepted Service notices disappeared (18 -> 0)
- Proposed Rules declined in fiscal

**Partially, for title prefix heuristics.** Title patterns like `"Self-Regulatory Organizations;"`, `"Privacy Act of 1974;"`, `"Excepted Service"` cover ~45% of Notice documents. These are queryable now against existing data.

**No, for the `action` field.** We don't store it. The `metadata` JSONB only has `{agency}`. The FR API provides `action` (e.g., `"Notice of a modified system of records."`) but `FrApiDocument` in `federal-register-fetcher.ts:34-42` doesn't extract it, and `document-store.ts:31` only writes `{agency}` to metadata.

**Summary**: Baseline distributions can be computed right now from existing data for Tier 1 (source_type, 62.7% coverage) and Tier 2 (title heuristics, additional 16.8%). The 20.5% ambiguous remainder needs the `action` field.

---

## Q4: What's the migration path for storing three-layer convergence results?

The `weekly_aggregates` table currently stores keyword-layer results (severity scores, tier proportions, match counts, top keywords). For three-layer convergence:

### Option A: Extend `weekly_aggregates` (Recommended)

Add columns for structural and thematic scores:

```
structural_score        real
structural_detail       jsonb   -- {source_type_dist, presidential_proportion, etc.}
thematic_score          real
thematic_detail         jsonb   -- {centroid_drift, cluster_shift, etc.}
convergence_score       real
convergence_detail      jsonb   -- {layer_agreement, weights_used, etc.}
```

Simplest approach. The `weekly_aggregates` table is already the per-category-per-week rollup. Adding nullable columns avoids a new table and keeps the query pattern identical. The schema-first workflow (modify `schema.ts` -> `pnpm db:generate` -> `pnpm db:migrate`) handles this cleanly.

### Option B: New `convergence_results` table

Separate from weekly_aggregates. Cleaner separation of concerns but requires join queries everywhere the UI needs convergence data.

### Option C: Extend `assessments`

The `detail` JSONB column already stores flexible data. Could add convergence info there. But assessments are per-snapshot, not per-week — different granularity.

### For the `action` field

Add to `FrApiDocument` interface, extract in `toContentItem()`, store in `metadata` JSONB alongside `agency`. No schema migration needed — `metadata` is already `jsonb`. Just needs code changes in `federal-register-fetcher.ts` and `document-store.ts`.

---

## Q5: What's the realistic LOC estimate for Sprint R2 (structural + thematic layers only, no AI)?

| Component                           | New/Modified     | Est. LOC     | Notes                                                                                    |
| ----------------------------------- | ---------------- | ------------ | ---------------------------------------------------------------------------------------- |
| **Structural classifier**           | New file         | ~80-120      | `source_type` lookup + title prefix patterns (deterministic, no AI). Pure function.      |
| **Structural baseline computation** | New function     | ~40-60       | Compute `source_type` distributions from baseline data, store as baseline metadata       |
| **Structural anomaly detection**    | New function     | ~50-70       | Compare current week's type distribution vs baseline. Chi-squared or proportion delta.   |
| **FR API `action` field capture**   | Modify 2 files   | ~10-15       | Add `action` to `FrApiDocument`, thread through `toContentItem()` and `storeDocuments()` |
| **Thematic layer (embeddings)**     | Already exists   | ~0           | `semantic-drift-service.ts` already does centroid-vs-baseline comparison                 |
| **Convergence score**               | New function     | ~40-60       | Weighted combination of keyword + structural + thematic scores                           |
| **Weekly aggregator extension**     | Modify           | ~30-40       | Add structural/thematic/convergence columns, compute during aggregation                  |
| **Schema migration**                | Modify schema.ts | ~15-20       | New columns on `weekly_aggregates`                                                       |
| **Tests**                           | New files        | ~150-200     | Structural classifier + anomaly detection + convergence tests                            |
| **Total**                           |                  | **~415-585** |                                                                                          |

The thematic layer is mostly free — `semantic-drift-service.ts` already computes everything needed. The main new work is the structural classifier and convergence scoring.

---

## Q6: Performance concerns with embeddings, clustering, structural scores on every weekly snapshot?

### Structural scores: Zero concern

Pure in-memory computation — `source_type` lookup + title `LIKE` patterns. No API calls, no DB queries beyond what we already do. Sub-millisecond.

### Embeddings: Moderate concern for FR documents

Currently only rhetoric docs get embedded (50/batch in `snapshotRhetoric()`). Embedding all FR documents would mean ~500-1000 OpenAI API calls per weekly snapshot (at ~$0.02/1M tokens for text-embedding-3-small, this is <$0.01/week). The `embedUnprocessedDocuments()` function already handles batching.

### Semantic drift: Low concern

`computeWeekCentroid()` is a single DB query (fetch embeddings) + in-memory average. `cosineSimilarity()` is O(1536) arithmetic. Fast.

### Clustering: Higher concern if run weekly

k-means over 500+ 1536-dim vectors takes ~1-2 seconds. AI labeling adds LLM calls per cluster. **Recommendation**: Run clustering on-demand or monthly, not every snapshot. The structural + semantic drift layers don't need clustering.

### Backfill regeneration: The real bottleneck

Any keyword/rule change requires re-running 4 baselines + T2 backfill (~5 hours). Structural scores won't add to this since they're deterministic from existing metadata. But if we add embedding to all FR docs, the backfill would need an embedding pass too.

---

## Q7: Pipeline changes needed to capture FR API `action` and `subtype` fields?

### Current state

- **`subtype` is already partially captured.** `FrApiDocument` (line 40) extracts `subtype`, and `toContentItem()` (line 52) maps it to `ContentItem.subtype`. However, `storeDocuments()` in `document-store.ts:31` does NOT store it in the database — it only writes `{agency}` to `metadata`.
- **`action` is not captured at all.** Not in `FrApiDocument` interface, not in `ContentItem`.

### Changes needed

1. **`lib/services/federal-register-fetcher.ts`** (~3 lines):
   - Add `action?: string;` to `FrApiDocument` interface (line 41)
   - Add `action: doc.action,` to `toContentItem()` return

2. **`lib/types/assessment.ts`** (~1 line):
   - Add `action?: string;` to `ContentItem` interface

3. **`lib/services/document-store.ts`** (~5 lines):
   - Expand metadata object from `{ agency: item.agency }` to include `action` and `subtype`:
     ```typescript
     metadata: {
       ...(item.agency && { agency: item.agency }),
       ...(item.action && { action: item.action }),
       ...(item.subtype && { subtype: item.subtype }),
     }
     ```

4. **No schema migration needed** — `metadata` is already `jsonb`, can store arbitrary keys.

5. **Backfill consideration**: Existing 132K documents won't have `action`/`subtype` in metadata. To populate them retroactively, we'd need a one-time script that re-fetches from FR API (rate-limited at ~1000 requests/hour for 75K FR docs = ~75 hours). Alternatively, the structural classifier can use title heuristics for existing data and the `action` field for newly-fetched data going forward.

---

## Q8: Review the spike's title heuristics for edge cases — best implementation approach?

### Patterns identified by the spike

| Pattern                                                    | Match Method               | Risk                                                         |
| ---------------------------------------------------------- | -------------------------- | ------------------------------------------------------------ |
| `Self-Regulatory Organizations;`                           | `startsWith`               | Low — highly formulaic SEC filings                           |
| `Notice of Determinations; Culturally Significant`         | `startsWith`               | Low — exact template                                         |
| `Privacy Act of 1974;`                                     | `startsWith`               | Low — statutory reference                                    |
| `Agency Information Collection` / `Information Collection` | `startsWith`               | Medium — "Information Collection" could match other patterns |
| `Submission for OMB Review`                                | `startsWith`               | Medium — bare "Submission for..." is too generic             |
| `Excepted Service`                                         | `startsWith`               | Low — specific term                                          |
| `Statement of Organization, Functions`                     | `startsWith`               | Low — formulaic                                              |
| `Senior Executive Service`                                 | `startsWith` or `includes` | Low — specific term, but sometimes has agency prefix         |

### Edge case risks

1. **"Submission for..."** is too broad — must be "Submission for OMB Review" specifically
2. **"Information Collection"** appears mid-title sometimes ("Agency Information Collection Activities" vs "Information Collection; Comment Request") — needs both prefix variants
3. **SES listings** sometimes have agency prefix before "Senior Executive Service" — `includes()` is safer than `startsWith()`
4. **Multi-category documents** — a Notice could match both "Privacy Act" and "Information Collection" patterns. Need priority ordering.

### Recommended implementation

A deterministic classifier function with ordered pattern matching:

```typescript
// Pure function, no dependencies, fully testable
type FunctionalBucket =
  | 'rulemaking'
  | 'executive_action'
  | 'personnel_action'
  | 'administrative_procedure'
  | 'financial_regulatory'
  | 'organizational_change'
  | 'oversight_advisory'
  | 'news_rhetoric'
  | 'cultural_ceremonial'
  | 'unclassified';

interface ClassificationRule {
  test: (title: string, sourceType: string) => boolean;
  bucket: FunctionalBucket;
}

// Priority-ordered: first match wins
const CLASSIFICATION_RULES: ClassificationRule[] = [
  // Tier 1: Deterministic from source_type
  { test: (_, st) => st === 'Rule' || st === 'Proposed Rule', bucket: 'rulemaking' },
  { test: (_, st) => st === 'Presidential Document', bucket: 'executive_action' },
  { test: (_, st) => st === 'rhetoric', bucket: 'news_rhetoric' },

  // Tier 2: Title prefix heuristics (most specific first)
  { test: (t) => t.startsWith('Self-Regulatory Organizations;'), bucket: 'financial_regulatory' },
  {
    test: (t) => t.startsWith('Notice of Determinations; Culturally'),
    bucket: 'cultural_ceremonial',
  },
  { test: (t) => t.startsWith('Privacy Act of 1974;'), bucket: 'administrative_procedure' },
  {
    test: (t) =>
      t.startsWith('Agency Information Collection') || t.startsWith('Information Collection'),
    bucket: 'administrative_procedure',
  },
  { test: (t) => t.startsWith('Submission for OMB Review'), bucket: 'administrative_procedure' },
  { test: (t) => t.startsWith('Excepted Service'), bucket: 'personnel_action' },
  { test: (t) => t.includes('Senior Executive Service'), bucket: 'personnel_action' },
  { test: (t) => t.startsWith('Personnel Demonstration Project'), bucket: 'personnel_action' },
  { test: (t) => t.startsWith('Statement of Organization'), bucket: 'organizational_change' },
];

function classifyDocumentFunction(title: string, sourceType: string): FunctionalBucket {
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.test(title, sourceType)) return rule.bucket;
  }
  return 'unclassified';
}
```

**Why this approach:**

- Pure function, zero dependencies, trivially testable
- Priority-ordered array is easy to extend with new patterns
- Separates data (rules array) from logic (loop)
- Can be enhanced later with `action` field: just add `action` as a third parameter to the `test` function
- Matches the project's existing pattern of data-driven classification (cf. `ASSESSMENT_RULES`, `SUPPRESSION_RULES`)

**Testing strategy**: Write tests with real title samples from the spike's raw data query results (Biden 2022 + Trump 2025 samples). Include edge cases for each pattern. Regression test against the spike's coverage numbers (62.7% Tier 1, 79.5% Tier 1+2).
