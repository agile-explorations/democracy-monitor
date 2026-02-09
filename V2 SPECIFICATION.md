# Democracy Monitor — Implementation Specification

## Document Purpose

This specification synthesizes recommendations from two independent AI design reviews (Claude, ChatGPT) against the actual codebase to produce an ordered, implementable plan. Each spec item references the existing files it modifies or creates, and is sequenced for implementation with Claude Code.

**Current state of the codebase**: Next.js 14 (Pages Router), TypeScript, Drizzle ORM + PostgreSQL + pgvector, Redis cache, OpenAI + Anthropic providers, 11 category keyword dictionaries, batch assessment engine, AI-enhanced assessment with RAG, debate service, infrastructure overlay, intent/rhetoric tracking, trend anomaly detection, embedding pipeline, snapshot cron. ~5,300 lines across `lib/`.

---

## Phase 1: Scoring Foundation & False Positive Reduction

**Goal**: Transform the batch-only assessment into per-document scoring with context awareness. This is the prerequisite for everything else.

### 1.1 Per-Document Scoring Engine

**Priority**: Critical — blocks Phases 2–4
**Estimated scope**: ~300 lines new, ~100 lines modified

**What exists**: `assessment-service.ts` processes all items as a batch and produces a categorical status. Keywords are matched but not scored per document. The `AssessmentResult` type has no per-document breakdown.

**What to build**:

Create `lib/services/document-scorer.ts`:

```typescript
export interface DocumentScore {
  documentId?: number; // DB id if stored
  url?: string; // unique key
  title: string;
  publishedAt?: string;
  category: string;
  sourceType: string;

  // Score A: keyword severity
  captureMatches: KeywordMatch[];
  driftMatches: KeywordMatch[];
  warningMatches: KeywordMatch[];
  suppressedMatches: SuppressedMatch[]; // spec 1.2
  severityScore: number; // (capture×4 + drift×2 + warning×1) with diminishing returns

  // Metadata
  documentClass: DocumentClass; // spec 1.3
  classMultiplier: number;
  isHighAuthority: boolean;
  finalScore: number; // severityScore × classMultiplier
  scoredAt: string;
}

export interface KeywordMatch {
  keyword: string;
  tier: 'capture' | 'drift' | 'warning';
  weight: number;
  context: string; // surrounding ~100 chars for audit
  domain?: 'legal' | 'institutional' | 'norms'; // dual-axis tag
}

export interface SuppressedMatch {
  keyword: string;
  tier: 'capture' | 'drift' | 'warning';
  suppressionRule: string; // which rule suppressed it
  reason: string;
}

export function scoreDocument(item: ContentItem, category: string): DocumentScore;
```

**Scoring formula** (use 4/2/1 with diminishing returns):

```
captureScore = first_capture × 4 + second_capture × 2 + subsequent_captures × 1 each
driftScore = drift_matches × 2
warningScore = warning_matches × 1
severityScore = captureScore + driftScore + warningScore
finalScore = severityScore × classMultiplier
```

**Dual-axis keyword metadata**: Add `domain` field to each keyword entry in `assessment-rules.ts`. Values: `legal` (violation of statute/order), `institutional` (structural change to institution), `norms` (norm erosion without legal breach). This is metadata only — does not affect scoring now, but enables future analysis ("Is erosion happening through legal mechanisms or informal pressure?").

**Schema change** — add `document_scores` table:

```sql
CREATE TABLE document_scores (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES documents(id),
  category VARCHAR(50) NOT NULL,
  severity_score REAL NOT NULL,
  final_score REAL NOT NULL,
  capture_count INTEGER NOT NULL DEFAULT 0,
  drift_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  suppressed_count INTEGER NOT NULL DEFAULT 0,
  document_class VARCHAR(20),
  class_multiplier REAL NOT NULL DEFAULT 1.0,
  is_high_authority BOOLEAN NOT NULL DEFAULT FALSE,
  matches JSONB,           -- full KeywordMatch[] for audit
  suppressed JSONB,        -- full SuppressedMatch[] for audit
  scored_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  week_of DATE NOT NULL    -- date_trunc('week', published_at) for aggregation
);

CREATE INDEX idx_doc_scores_category_week ON document_scores (category, week_of);
CREATE INDEX idx_doc_scores_document ON document_scores (document_id);
```

**Integration**: Modify `snapshot.ts` to call `scoreDocument()` for each item before passing to `enhancedAssessment()`. Store results in `document_scores`. The existing `analyzeContent()` continues to produce batch status — the per-document scores are additive, not a replacement.

**Files touched**:

- Create: `lib/services/document-scorer.ts`
- Create: `lib/types/scoring.ts`
- Modify: `lib/data/assessment-rules.ts` (add `domain` to keyword entries)
- Modify: `lib/types/assessment.ts` (extend `AssessmentRule` type)
- Modify: `lib/db/schema.ts` (add `documentScores` table)
- Modify: `lib/cron/snapshot.ts` (call scorer, store results)
- Create: `drizzle/0007_document_scores.sql`

### 1.2 Context Suppression Framework (Negative Keywords)

**Priority**: Critical — directly addresses the #1 validity threat (false positives)
**Estimated scope**: ~200 lines new, ~50 lines modified

**What exists**: `keyword-match.ts` does word-boundary regex. No negation or context checking.

**What to build**:

Create `lib/data/suppression-rules.ts`:

```typescript
export interface SuppressionRule {
  keyword: string; // the trigger keyword
  suppress_if_any: string[]; // co-occurring terms that zero out the match
  downweight_if_any?: string[]; // co-occurring terms that reduce tier by 1
  negate_if_any?: string[]; // negation phrases ("no evidence of", "rejected")
}

export const SUPPRESSION_RULES: Record<string, SuppressionRule[]> = {
  courts: [
    {
      keyword: 'court packing',
      suppress_if_any: ['FDR', '1937', 'historical', 'history of', 'roosevelt'],
      downweight_if_any: ['proposed', 'discussed', 'opinion piece'],
    },
    {
      keyword: 'contempt of court',
      suppress_if_any: ['dismissed', 'overturned on appeal'],
    },
  ],
  // ... per category
};

// Global negation patterns (apply to all categories)
export const NEGATION_PATTERNS: string[] = [
  'no evidence of',
  'no indication of',
  'rejected',
  'blocked',
  'overturned',
  'prevented',
  'failed attempt',
  'proposed but not enacted',
  'bill defeated',
  'amendment rejected',
];
```

**Integration**: Modify `scoreDocument()` to check suppression rules before counting a match. When suppressed, add to `suppressedMatches` array (for audit trail). When downweighted, reduce tier by 1 (capture → drift, drift → warning, warning → suppressed).

**Infrastructure overlay**: Add suppression rules to `infrastructure-keywords.ts` for context-dependent keywords:

- "RICO charge" suppress if co-occurs with "drug trafficking", "organized crime", "racketeering enterprise"
- "conspiracy charge" suppress if co-occurs with "drug conspiracy", "wire fraud"
- "FISA" suppress if co-occurs with "annual report", "compliance review", "reauthorization"
- "section 702" suppress if co-occurs with "renewal", "reform", "civil liberties review"

Split infrastructure keywords into two groups in a new field:

- `always_concerning`: keywords that score regardless of context ("mass detention", "political prosecution", "domestic terrorism designation")
- `context_dependent`: keywords that require absence of suppression terms ("RICO charge", "conspiracy charge", "FISA")

**Files touched**:

- Create: `lib/data/suppression-rules.ts`
- Modify: `lib/services/document-scorer.ts` (apply suppression logic)
- Modify: `lib/data/infrastructure-keywords.ts` (add suppression rules, split keyword groups)
- Modify: `lib/services/infrastructure-analysis.ts` (respect suppression)

### 1.3 Document Class Modifiers

**Priority**: High
**Estimated scope**: ~60 lines new

**What exists**: `ContentItem` has `type` field (rss, federal_register, etc.) but no document-class distinction.

**What to build**:

Add to `lib/services/document-scorer.ts`:

```typescript
export type DocumentClass =
  | 'final_rule'
  | 'proposed_rule'
  | 'executive_order'
  | 'enforcement_action'
  | 'notice'
  | 'press_release'
  | 'court_opinion'
  | 'report'
  | 'unknown';

const CLASS_MULTIPLIERS: Record<DocumentClass, number> = {
  executive_order: 1.5,
  enforcement_action: 1.5,
  final_rule: 1.3,
  court_opinion: 1.3,
  report: 1.0, // GAO, IG reports
  proposed_rule: 0.7,
  notice: 0.5,
  press_release: 0.5,
  unknown: 1.0,
};

export function classifyDocument(item: ContentItem): DocumentClass;
```

Classification logic: Use Federal Register API's `type` field (executive_order, rule, proposed_rule, notice) when available. For RSS items, infer from source (GAO RSS → report, SCOTUS RSS → court_opinion, DoD RSS → press_release). Default to `unknown`.

**Files touched**:

- Modify: `lib/services/document-scorer.ts` (add classification + multiplier)
- Modify: `lib/types/scoring.ts` (add DocumentClass type)

---

## Phase 2: AI Assessment Redesign (Score E)

**Goal**: Redesign the AI layer as an adversarial contextualizer that can downgrade keyword alerts.

### 2.1 Restructure AI Assessment as Skeptic

**Priority**: Critical
**Estimated scope**: ~200 lines modified

**What exists**: `ai-assessment-service.ts` runs the AI after keywords, merges evidence, generates counter-evidence. The AI's status assessment is noted in `consensusNote` but the keyword engine is authoritative (`finalStatus = keywordResult.status`). The assessment prompt in `prompts/assessment.ts` asks for a parallel assessment.

**What to change**:

Redesign the AI prompt to explicitly act as a **skeptical reviewer of the keyword result**, not an independent assessor. The AI should be forced to:

1. Evaluate whether each keyword match is contextually valid
2. Identify which matches are likely false positives (with reasoning)
3. Recommend whether the keyword-derived status should be **downgraded** (never upgraded — keywords are the ceiling)
4. State what evidence would change its mind

New prompt structure for `lib/ai/prompts/assessment.ts`:

```
You are reviewing an automated keyword-based assessment of U.S. democratic
institutions. Your role is SKEPTICAL REVIEWER — your job is to identify
false positives and provide context the keyword engine cannot.

CATEGORY: ${categoryTitle}
KEYWORD ENGINE RESULT: ${keywordStatus}
KEYWORD ENGINE REASON: ${keywordReason}
MATCHED KEYWORDS: ${matches.join(', ')}

DOCUMENTS REVIEWED:
${itemSummaries}

Your task:
1. KEYWORD_REVIEW: For each matched keyword, assess whether it represents
   a genuine institutional concern or a false positive. Explain why.
2. RECOMMENDED_STATUS: Same as or LOWER than the keyword status. You may
   recommend downgrading (e.g., Drift → Warning) but never upgrading.
   The keyword engine is the ceiling.
3. DOWNGRADE_REASON: If recommending a lower status, explain specifically
   why the keyword matches are misleading.
4. CONFIDENCE: 0.0 to 1.0
5. EVIDENCE_FOR: Specific evidence supporting the concerning assessment
6. EVIDENCE_AGAINST: Specific evidence suggesting things are not as bad
   as keywords indicate (REQUIRED — you must steelman the null hypothesis)
7. HOW_WE_COULD_BE_WRONG: At least 2 ways this assessment could be incorrect
8. WHAT_WOULD_CHANGE_MY_MIND: What new evidence would cause you to agree
   with a higher severity level
```

**Disagreement handling**:

```typescript
// In enhancedAssessment():
if (aiResult && aiResult.recommendedStatus !== keywordResult.status) {
  // AI recommends downgrade
  const severityGap =
    statusToNumber(keywordResult.status) - statusToNumber(aiResult.recommendedStatus);

  if (severityGap === 1 && aiResult.confidence >= 0.7) {
    // AI confidently recommends 1-level downgrade → auto-accept
    finalStatus = aiResult.recommendedStatus;
    consensusNote = `AI reviewer (${aiResult.provider}) downgraded from ${keywordResult.status} to ${aiResult.recommendedStatus}: ${aiResult.downgradeReason}`;
  } else if (severityGap >= 2 || aiResult.confidence < 0.7) {
    // Large disagreement or low confidence → flag for human review
    finalStatus = keywordResult.status; // keep keyword result
    consensusNote = `REVIEW NEEDED: AI recommends ${aiResult.recommendedStatus} (confidence: ${aiResult.confidence}), keywords say ${keywordResult.status}`;
    // Store in alerts table for human queue
    await flagForReview(assessment);
  }
}
```

**Files touched**:

- Modify: `lib/ai/prompts/assessment.ts` (new skeptic prompt)
- Modify: `lib/ai/schemas/assessment-response.ts` (add `recommendedStatus`, `downgradeReason`, `keywordReview`, `whatWouldChangeMyMind`)
- Modify: `lib/services/ai-assessment-service.ts` (disagreement handling, auto-downgrade logic)
- Modify: `lib/types/ai.ts` (updated response types)

### 2.2 Human Review Queue

**Priority**: High
**Estimated scope**: ~100 lines new

**What exists**: `alerts` table in schema. Not used for review workflow.

**What to build**:

Create `lib/services/review-queue.ts`:

```typescript
export interface ReviewItem {
  alertId: number;
  category: string;
  keywordStatus: StatusLevel;
  aiRecommendedStatus: StatusLevel;
  aiConfidence: number;
  aiReasoning: string;
  documentCount: number;
  topMatches: string[];
  flaggedAt: string;
}

export async function flagForReview(assessment: EnhancedAssessment): Promise<void>;
export async function getPendingReviews(): Promise<ReviewItem[]>;
export async function resolveReview(
  alertId: number,
  decision: {
    finalStatus: StatusLevel;
    reason: string;
    reviewer: string;
  },
): Promise<void>;
```

For the OSS dev launch, this can be a simple API route (`/api/reviews`) that lists pending disagreements. Full UI can come later.

**Files touched**:

- Create: `lib/services/review-queue.ts`
- Create: `pages/api/reviews.ts`

### 2.3 Note: Evaluate debate-service.ts

The existing `debate-service.ts` (prosecutor vs. defense using two AI providers) is clever but expensive and somewhat redundant with the redesigned Score E. After implementing the skeptic-reviewer pattern in Sprint 2, evaluate whether the full debate adds enough value over the single-pass skeptical review to justify the cost and latency.

---

## Phase 3: Weekly Aggregation & Cumulative Scoring

**Goal**: Build four cumulative views from per-document scores.

**Depends on**: Phase 1 (per-document scores in `document_scores` table)

### 3.1 Weekly Aggregation Engine

**Priority**: High
**Estimated scope**: ~250 lines new

**What exists**: `snapshot-store.ts` has `getWeeklyTrajectory()` which returns one assessment per category per week using `DISTINCT ON`. No numerical aggregation.

**What to build**:

Create `lib/services/weekly-aggregator.ts`:

```typescript
export interface WeeklyAggregate {
  category: string;
  weekOf: string; // ISO date (Monday of week)

  // Score A: sum of per-document finalScores
  totalSeverity: number;
  documentCount: number;
  avgSeverityPerDoc: number;

  // Score B: severity mix (proportion at each tier)
  captureProportion: number;
  driftProportion: number;
  warningProportion: number;
  severityMix: number; // (captureProp×4 + driftProp×2 + warningProp×1)

  // Breakdown
  captureMatchCount: number;
  driftMatchCount: number;
  warningMatchCount: number;
  suppressedMatchCount: number;
  topKeywords: string[]; // most frequent matches this week
}

export async function computeWeeklyAggregate(
  category: string,
  weekOf: string,
): Promise<WeeklyAggregate>;

export async function computeAllWeeklyAggregates(options?: {
  from?: string;
  to?: string;
}): Promise<Record<string, WeeklyAggregate[]>>;
```

**Schema change** — add `weekly_aggregates` table:

```sql
CREATE TABLE weekly_aggregates (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  week_of DATE NOT NULL,
  total_severity REAL NOT NULL,
  document_count INTEGER NOT NULL,
  avg_severity_per_doc REAL NOT NULL,
  capture_proportion REAL NOT NULL DEFAULT 0,
  drift_proportion REAL NOT NULL DEFAULT 0,
  warning_proportion REAL NOT NULL DEFAULT 0,
  severity_mix REAL NOT NULL,
  capture_match_count INTEGER NOT NULL DEFAULT 0,
  drift_match_count INTEGER NOT NULL DEFAULT 0,
  warning_match_count INTEGER NOT NULL DEFAULT 0,
  suppressed_match_count INTEGER NOT NULL DEFAULT 0,
  top_keywords JSONB,
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(category, week_of)
);
```

**Files touched**:

- Create: `lib/services/weekly-aggregator.ts`
- Create: `drizzle/0008_weekly_aggregates.sql`
- Modify: `lib/db/schema.ts`
- Modify: `lib/cron/snapshot.ts` (compute weekly aggregate after scoring)

### 3.2 Four Cumulative Views

**Priority**: High
**Estimated scope**: ~150 lines new

Create `lib/services/cumulative-scoring.ts`:

```typescript
export interface CumulativeScores {
  category: string;
  asOf: string;

  // View 1: Running sum (monotonically increasing)
  runningSum: number;

  // View 2: Running average (can rise or fall)
  runningAverage: number;
  weekCount: number;

  // View 3: High-water mark + current
  highWaterMark: number;
  highWaterWeek: string;
  currentWeekScore: number;

  // View 4: Decay-weighted current pressure
  decayWeightedScore: number;
  decayHalfLifeWeeks: number; // default 8
}

export async function computeCumulativeScores(
  category: string,
  options?: { halfLifeWeeks?: number },
): Promise<CumulativeScores>;
```

**Decay formula**:

```
decayScore = Σ(weekScore × 0.5^(weeksAgo / halfLife))
```

Default half-life: 8 weeks. This means a week's score contributes half its value after 8 weeks, a quarter after 16 weeks, etc.

**Files touched**:

- Create: `lib/services/cumulative-scoring.ts`
- Create: `pages/api/history/cumulative.ts`

---

## Phase 4: Baseline Expansion

**Goal**: Establish robust reference baselines for comparison and semantic drift calibration.

### 4.1 Extended Biden Baseline

**Priority**: High
**Estimated scope**: ~200 lines new

**What exists**: No formal baseline computation. `trend-anomaly-service.ts` uses a rolling 6-month baseline for keyword anomaly detection.

**What to build**:

Create `lib/services/baseline-service.ts`:

```typescript
export interface BaselineConfig {
  id: string; // e.g., 'biden_2024', 'obama_2013', 'biden_2021'
  label: string;
  from: string; // ISO date
  to: string;
  description: string;
  isDefault: boolean;
}

export interface CategoryBaseline {
  baselineId: string;
  category: string;
  avgWeeklySeverity: number; // mean Score A per week
  stdDevWeeklySeverity: number; // for noise floor calculation
  avgWeeklyDocCount: number;
  avgSeverityMix: number; // mean Score B per week
  embeddingCentroid?: number[]; // mean embedding vector (1536-dim)
  computedAt: string;
}

export const BASELINE_CONFIGS: BaselineConfig[] = [
  {
    id: 'biden_2024',
    label: 'Biden Administration (2024)',
    from: '2024-01-01',
    to: '2025-01-19',
    description: 'Full year of Biden administration including lame-duck period',
    isDefault: true,
  },
  {
    id: 'biden_2021',
    label: 'Biden First Year (2021)',
    from: '2021-01-20',
    to: '2022-01-19',
    description: 'First year of Biden administration — active governance baseline',
    isDefault: false,
  },
  {
    id: 'obama_2013',
    label: 'Obama Second Term Start (2013)',
    from: '2013-01-20',
    to: '2014-01-19',
    description: 'First year of Obama second term — stable governance reference',
    isDefault: false,
  },
];

export async function computeBaseline(config: BaselineConfig): Promise<CategoryBaseline[]>;
export async function getBaseline(
  baselineId: string,
  category: string,
): Promise<CategoryBaseline | null>;
```

**Backfill strategy**: The Federal Register API has full historical data back to 1994. Create a `lib/cron/backfill-baseline.ts` script that:

1. Fetches documents from the FR API for each category's signal queries during baseline periods
2. Runs `scoreDocument()` on each (using the same keyword dictionaries)
3. Computes weekly aggregates
4. Computes and stores baseline statistics

**Schema change** — add `baselines` table:

```sql
CREATE TABLE baselines (
  id SERIAL PRIMARY KEY,
  baseline_id VARCHAR(50) NOT NULL,
  category VARCHAR(50) NOT NULL,
  avg_weekly_severity REAL NOT NULL,
  stddev_weekly_severity REAL NOT NULL,
  avg_weekly_doc_count REAL NOT NULL,
  avg_severity_mix REAL NOT NULL,
  embedding_centroid vector(1536),
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(baseline_id, category)
);
```

**Files touched**:

- Create: `lib/services/baseline-service.ts`
- Create: `lib/cron/backfill-baseline.ts`
- Create: `drizzle/0009_baselines.sql`
- Modify: `lib/db/schema.ts`

### 4.2 Semantic Drift with Noise Floor

**Priority**: Medium-high
**Estimated scope**: ~150 lines new

**What exists**: `embedding-service.ts` has `cosineSimilarity()`. Documents get embedded via `document-embedder.ts`. No centroid computation or drift measurement.

**What to build**:

Create `lib/services/semantic-drift-service.ts`:

```typescript
export interface SemanticDriftResult {
  category: string;
  weekOf: string;
  baselineId: string;

  // Raw measurement
  rawCosineDrift: number; // 1 - cosineSimilarity(weekCentroid, baselineCentroid)

  // Calibrated measurement
  noiseFloor: number; // stddev of week-to-week drift during baseline period
  normalizedDrift: number; // rawCosineDrift / noiseFloor (in units of "normal variation")
  interpretation: string; // e.g., "2.8× normal variation for this category"
}

export async function computeWeekCentroid(
  category: string,
  weekOf: string,
): Promise<number[] | null>;

export async function computeSemanticDrift(
  category: string,
  weekOf: string,
  baselineId?: string,
): Promise<SemanticDriftResult | null>;
```

**Noise floor computation**: During baseline computation (4.1), compute the cosine distance between consecutive weeks' centroids. The standard deviation of these distances is the noise floor for that category. Store in `baselines` table (add `drift_noise_floor REAL` column).

**Reporting**: Instead of raw "drift = 0.12", report "This week's language shift is 2.8× normal variation for this category." This is immediately interpretable without domain expertise.

**Files touched**:

- Create: `lib/services/semantic-drift-service.ts`
- Modify: `lib/services/baseline-service.ts` (compute noise floor during baseline)
- Modify: `drizzle/0009_baselines.sql` (add drift_noise_floor column)

---

## Phase 5: Infrastructure Convergence Redesign

**Goal**: Replace binary convergence with graduated, multiplicative scoring.

### 5.1 Multiplicative Convergence Score

**Priority**: Medium
**Estimated scope**: ~100 lines modified

**What exists**: `infrastructure-analysis.ts` counts matches per theme, marks themes active/inactive at threshold, produces convergence as `none` / `emerging` / `convergent`.

**What to change**:

Modify `infrastructure-analysis.ts`:

```typescript
// Replace binary active/inactive with intensity score per theme
export interface InfrastructureThemeResult {
  // ... existing fields ...
  intensity: number; // NEW: (capture_matches × 4) + (drift_matches × 2) + (warning_matches × 1)
  // Note: infrastructure keywords don't have tiers currently.
  // For now, use matchCount as intensity. Future: add tiers to infra keywords.
}

// Replace ConvergenceLevel
export type ConvergenceLevel = 'none' | 'emerging' | 'active' | 'entrenched';

// Multiplicative convergence score
function computeConvergenceScore(themes: InfrastructureThemeResult[]): number {
  const intensities = themes.map((t) => t.intensity);
  const activeIntensities = intensities.filter((i) => i > 0);

  if (activeIntensities.length < 2) return 0;

  // Product of active theme intensities (normalized)
  return activeIntensities.reduce((product, i) => product * i, 1);
}

function getConvergenceLevel(score: number, activeCount: number): ConvergenceLevel {
  if (activeCount === 0) return 'none';
  if (activeCount === 1) return 'emerging';
  if (score >= 50) return 'entrenched'; // thresholds to be calibrated
  return 'active';
}
```

**Files touched**:

- Modify: `lib/services/infrastructure-analysis.ts`
- Modify: `lib/types/infrastructure.ts` (add `intensity`, update `ConvergenceLevel`)

---

## Phase 6: Rhetoric → Action Temporal Analysis

**Goal**: Add lag analysis to detect when rhetoric is being operationalized.

### 6.1 Cross-Correlation Lag Analysis

**Priority**: Medium
**Estimated scope**: ~200 lines new

**What exists**: `intent-service.ts` scores rhetoric and action keywords per policy area. `intent-snapshot-store.ts` saves snapshots. No temporal lag analysis.

**What to build**:

Create `lib/services/rhetoric-lag-service.ts`:

```typescript
export interface LagAnalysisResult {
  policyArea: PolicyArea;
  maxCorrelation: number; // peak cross-correlation value
  lagWeeks: number; // weeks of lag at peak (rhetoric leads action)
  interpretation: string; // "Rhetoric leads action by ~3 weeks in Rule of Law"
  correlationByLag: Array<{
    lag: number; // 0 to 12
    correlation: number;
  }>;
}

export async function computeRhetoricActionLag(
  policyArea: PolicyArea,
  options?: { maxLagWeeks?: number; from?: string; to?: string },
): Promise<LagAnalysisResult>;
```

This requires storing weekly rhetoric scores and action scores in the database. Add to `weekly_aggregates` or create a separate `intent_weekly` table.

**Files touched**:

- Create: `lib/services/rhetoric-lag-service.ts`
- Modify: `lib/cron/snapshot.ts` (store weekly intent scores)
- Create: `pages/api/intent/lag-analysis.ts`

---

## Phase 7: Project 2025 Comparison

**Goal**: Build retrieval + LLM judge pipeline for matching government actions to P2025 proposals.

### 7.1 P2025 Proposal Extraction & Storage

**Priority**: Medium (can start in parallel with Phases 1–4)
**Estimated scope**: ~300 lines new

**What to build**:

Create `lib/data/p2025/` directory:

```typescript
// lib/data/p2025/proposals.ts
export interface P2025Proposal {
  id: string; // e.g., 'p2025-opm-001'
  chapter: string;
  targetAgency: string;
  dashboardCategory: string; // maps to our 11 categories
  policyArea: PolicyArea;
  severity: 'low' | 'medium' | 'high' | 'extreme';
  text: string; // the proposal text
  summary: string; // one-sentence summary
  status: 'not_started' | 'in_progress' | 'implemented' | 'exceeded' | 'abandoned';
}
```

**Schema change** — add tables:

```sql
CREATE TABLE p2025_proposals (
  id VARCHAR(50) PRIMARY KEY,
  chapter VARCHAR(100) NOT NULL,
  target_agency VARCHAR(100),
  dashboard_category VARCHAR(50),
  policy_area VARCHAR(50),
  severity VARCHAR(20) NOT NULL,
  text TEXT NOT NULL,
  summary TEXT NOT NULL,
  embedding vector(1536),
  status VARCHAR(20) NOT NULL DEFAULT 'not_started',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE p2025_matches (
  id SERIAL PRIMARY KEY,
  proposal_id VARCHAR(50) REFERENCES p2025_proposals(id),
  document_id INTEGER REFERENCES documents(id),
  cosine_similarity REAL NOT NULL,
  llm_classification VARCHAR(20),   -- not_related, loosely_related, implements, exceeds
  llm_confidence REAL,
  llm_reasoning TEXT,
  human_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  human_classification VARCHAR(20),
  matched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
```

### 7.2 Retrieval + LLM Judge Pipeline

**Priority**: Medium
**Estimated scope**: ~200 lines new

Create `lib/services/p2025-matcher.ts`:

```typescript
export async function matchDocumentToProposals(
  documentId: number,
  options?: { topK?: number; similarityThreshold?: number },
): Promise<P2025Match[]>;

// Step 1: Embedding retrieval (threshold ~0.5, retrieve top 10)
// Step 2: LLM judge classifies each candidate
// Step 3: Store results with human_reviewed = false
```

LLM judge prompt:

```
You are comparing a government action to a Project 2025 policy proposal.

PROPOSAL: ${proposal.text}
GOVERNMENT DOCUMENT: ${document.title} — ${document.content}

Classify the relationship:
- NOT_RELATED: No meaningful connection
- LOOSELY_RELATED: Same policy area but different specific action
- IMPLEMENTS: The government action directly implements this proposal
- EXCEEDS: The government action goes beyond what the proposal suggested

Respond with: classification, confidence (0-1), and brief reasoning.
```

**Files touched**:

- Create: `lib/data/p2025/proposals.ts`
- Create: `lib/services/p2025-matcher.ts`
- Create: `lib/ai/prompts/p2025-judge.ts`
- Create: `drizzle/0010_p2025.sql`
- Modify: `lib/db/schema.ts`

---

## Phase 8: Historical Validation

**Goal**: Backtest the system against known historical periods to calibrate and establish credibility.

### 8.1 First Trump Term Validation (2017–2018)

**Priority**: High (do after Phase 1 is complete, before public launch)
**Estimated scope**: ~200 lines new (mostly scripts)

**What to build**:

Create `lib/validation/` directory:

```typescript
// lib/validation/historical-backtest.ts
export interface BacktestResult {
  period: string;
  category: string;
  weeklyScores: WeeklyAggregate[];
  peakWeek: string;
  peakScore: number;
  knownEvents: string[]; // human-annotated events in this period
  detectedEvents: string[]; // events the system flagged
  missedEvents: string[]; // known events the system didn't flag
  falseAlarms: string[]; // flags that don't correspond to known events
}

export async function runBacktest(
  from: string,
  to: string,
  knownEvents: Array<{ date: string; category: string; description: string }>,
): Promise<BacktestResult[]>;
```

**Known events to test against (2017–2018)**:

- Travel ban executive orders (Jan 2017, Mar 2017) → military, civil_liberties
- James Comey firing (May 2017) → rule_of_law, igs
- Jeff Sessions recusal pressure → rule_of_law
- DACA rescission (Sep 2017) → civil_liberties
- Government shutdown (Jan 2018) → fiscal
- Family separation policy (Spring 2018) → civil_liberties, detention

**Validation questions**:

1. Would the system have detected these events in the correct categories?
2. What false alarms would it have produced?
3. Are the severity levels proportionate to the actual institutional impact?

**Files touched**:

- Create: `lib/validation/historical-backtest.ts`
- Create: `lib/validation/known-events.ts`
- Create: `lib/cron/run-backtest.ts`

---

## Phase 9: Methodology-as-Code (OSS Launch Preparation)

**Goal**: Make all methodology artifacts first-class, versionable, testable code.

### 9.1 Extract Methodology to Standalone Files

**Priority**: High (before OSS launch)
**Estimated scope**: ~100 lines refactoring

Move methodology artifacts to a dedicated directory structure:

```
lib/methodology/
  keyword-dictionaries/
    civil-service.ts
    fiscal.ts
    courts.ts
    ...
  suppression-rules/
    courts.ts
    infrastructure.ts
    ...
  severity-config.ts          // weights: { capture: 4, drift: 2, warning: 1 }
  volume-thresholds.ts
  document-class-multipliers.ts
  convergence-config.ts
  baseline-configs.ts
  scoring-formulas.ts         // the actual math, documented
```

Each file should have a header comment explaining the rationale and linking to the design review.

**Feature flags** (environment variables):

```
ENABLE_SUPPRESSION_RULES=true
SCORING_WEIGHTS=4,2,1
DECAY_HALF_LIFE_WEEKS=8
SEMANTIC_DRIFT_ENABLED=true
P2025_MATCHING_ENABLED=false
```

### 9.2 Synthetic Test Fixtures

**Priority**: High
**Estimated scope**: ~200 lines

Create `__tests__/fixtures/scoring/` with test documents:

```typescript
// __tests__/fixtures/scoring/false-positives.ts
export const FALSE_POSITIVE_CASES = [
  {
    name: 'Historical discussion of court packing',
    document: {
      title: 'FDR and the 1937 Court-Packing Plan: Lessons for Today',
      summary: "A historical analysis of Roosevelt's attempt to expand the Supreme Court...",
      type: 'press_release',
    },
    category: 'courts',
    expectedSuppressed: ['court packing'],
    expectedStatus: 'Stable',
  },
  {
    name: 'Routine RICO prosecution',
    document: {
      title: 'Federal Grand Jury Returns RICO Indictment in Drug Trafficking Case',
      summary:
        'A federal grand jury returned a RICO indictment against members of a drug trafficking organization...',
      type: 'notice',
    },
    category: 'criminalization_opposition',
    expectedSuppressed: ['RICO charge'],
    expectedStatus: 'Stable',
  },
  // ... more cases
];

// __tests__/fixtures/scoring/true-positives.ts
export const TRUE_POSITIVE_CASES = [
  {
    name: 'Actual IG firing',
    document: {
      title: 'President Removes Five Inspectors General',
      summary:
        'The White House announced the removal of five Senate-confirmed inspectors general...',
      type: 'notice',
    },
    category: 'igs',
    expectedMatches: ['inspector general removed', 'mass ig removal'],
    expectedMinStatus: 'Drift',
  },
  // ... more cases
];
```

### 9.3 Regression Test Pattern

```typescript
// __tests__/lib/services/document-scorer.test.ts
import { FALSE_POSITIVE_CASES, TRUE_POSITIVE_CASES } from '../../fixtures/scoring';

describe('Document Scorer - False Positive Prevention', () => {
  for (const tc of FALSE_POSITIVE_CASES) {
    it(`suppresses: ${tc.name}`, () => {
      const result = scoreDocument(tc.document, tc.category);
      for (const keyword of tc.expectedSuppressed) {
        expect(result.suppressedMatches.map((m) => m.keyword)).toContain(keyword);
      }
    });
  }
});

describe('Document Scorer - True Positive Detection', () => {
  for (const tc of TRUE_POSITIVE_CASES) {
    it(`detects: ${tc.name}`, () => {
      const result = scoreDocument(tc.document, tc.category);
      for (const keyword of tc.expectedMatches) {
        expect(
          result.captureMatches
            .concat(result.driftMatches, result.warningMatches)
            .map((m) => m.keyword),
        ).toContain(keyword);
      }
    });
  }
});
```

### 9.4 Per-Document Score Explanation API

**Priority**: Medium-high (developers will want this immediately)
**Estimated scope**: ~80 lines

Create `pages/api/explain/document.ts`:

```typescript
// GET /api/explain/document?id=123
// Returns: full DocumentScore including matched keywords, suppressed matches,
//          document class, multiplier, contribution to weekly score
```

Create `pages/api/explain/week.ts`:

```typescript
// GET /api/explain/week?category=courts&week=2025-02-03
// Returns: WeeklyAggregate with top contributing documents,
//          dominant keywords, AI vs keyword comparison
```

---

## Phase 10: UI Presentation Layer

**Goal**: Four-layer interface (public → analyst → methods → export).

### 10.1 Experimental Badges

**Priority**: High (before any sharing)
**Estimated scope**: ~50 lines

Add to every status display:

- Badge: "Experimental" / "Calibrating" / "Validated" per category
- Tooltip: "This assessment uses automated keyword analysis. Methodology is under active development."
- Link: "How this works →" pointing to methodology explanation

### 10.2 Score Explanation Drill-Down

**Priority**: Medium
**Estimated scope**: ~200 lines (React components)

For each category card, add expandable sections:

- **What triggered this status**: list of matched keywords with document links
- **What was suppressed**: list of suppressed matches with reasons
- **AI reviewer notes**: the AI's skeptical assessment (if available)
- **How we could be wrong**: counter-evidence list
- **Methodology**: link to the relevant config files

### 10.3 Data Export

**Priority**: Medium (important for OSS dev audience)

Add `pages/api/export/` routes:

- `GET /api/export/scores?category=X&from=Y&to=Z&format=csv` — per-document scores
- `GET /api/export/weekly?format=json` — weekly aggregates
- `GET /api/export/methodology` — current keyword dictionaries, weights, thresholds as JSON

---

## Implementation Sequence

Organized for Claude Code planning mode. Each phase produces a working, testable increment.

### Sprint 1 (Foundation)

1. **1.1** Per-document scoring engine + schema migration
2. **1.2** Context suppression framework
3. **1.3** Document class modifiers
4. **9.2** Synthetic test fixtures (write tests alongside the scorer)
5. **9.3** Regression test pattern

**Deliverable**: Every document gets a numerical score with context-aware suppression. All scoring decisions are auditable. Tests prove false positives are suppressed and true positives are detected.

### Sprint 2 (AI Redesign)

6. **2.1** AI assessment as skeptic (prompt redesign + disagreement handling)
7. **2.2** Human review queue (API only)

**Deliverable**: AI can downgrade keyword alerts. Disagreements are flagged. Keyword engine remains authoritative ceiling.

### Sprint 3 (Aggregation)

8. **3.1** Weekly aggregation engine + schema
9. **3.2** Four cumulative views
10. **4.1** Baseline service + configs (start backfill)

**Deliverable**: Numerical weekly and cumulative scores. Baseline computation running.

### Sprint 4 (Calibration)

11. **4.2** Semantic drift with noise floor
12. **5.1** Multiplicative convergence
13. **8.1** Historical validation (first Trump term)

**Deliverable**: Semantic drift reported as multiples of normal variation. Convergence scoring graduated. Backtest results available for calibration.

### Sprint 5 (OSS Launch Prep)

14. **9.1** Methodology extraction to standalone files
15. **9.4** Score explanation APIs
16. **10.1** Experimental badges
17. **10.2** Score explanation drill-down UI
18. **10.3** Data export APIs

**Deliverable**: System is transparent, inspectable, and ready for dev community sharing.

### Sprint 6+ (Future)

19. **6.1** Rhetoric → action lag analysis
20. **7.1** P2025 proposal extraction
21. **7.2** P2025 retrieval + LLM judge pipeline
22. Dual reading-level AI-generated summaries (10th grade + college graduate)
23. Legislative tracking (GovInfo Congressional Record API)
24. External validation index integration (V-Dem, Freedom House, Bright Line Watch)

---

## Additional Keyword Recommendations

Add to `assessment-rules.ts` (from review):

**civilService**: `political commissar`, `loyalty pledge`, `ideological screening`, `burrowing in`
**fiscal**: `continuing resolution`, `government shutdown`, `debt ceiling`
**courts**: `standing denied`, `mootness`, `justiciability`
**infoAvailability**: `climate data removed`, `scientific advisory board disbanded`, `CDC guidance removed`
**elections**: `election monitor expelled`, `observer access denied`, `preclearance`

---

## Configuration Defaults

```typescript
// lib/methodology/scoring-formulas.ts
export const SCORING_CONFIG = {
  weights: {
    capture: 4, // first capture match
    captureAdditional: 2, // second capture match
    captureSubsequent: 1, // third+ capture matches
    drift: 2,
    warning: 1,
  },
  decayHalfLifeWeeks: 8,
  convergenceThresholds: {
    emerging: 1, // 1 theme active
    active: 2, // 2+ themes, score < 50
    entrenched: 50, // convergence score >= 50
  },
  semanticDrift: {
    anomalyThresholdMultiple: 2.0, // 2× noise floor = flag
  },
  p2025: {
    retrievalThreshold: 0.5, // cosine similarity for candidate retrieval
    topK: 10,
  },
};
```

---

## Risk Reminders

1. **Frame outputs as risk signals, not verdicts.** "Signals indicate elevated risk in judicial compliance" not "Courts are being captured."
2. **The keyword engine is the ceiling; AI can only downgrade.** This prevents the AI from escalating based on hallucinated patterns.
3. **Every scoring decision must be auditable.** Store matched keywords, suppressed keywords, document class, multiplier, AI reasoning.
4. **Historical validation before public launch.** The backtest against 2017-2018 is not optional — it's what separates "interesting prototype" from "trustworthy tool."
5. **Methodology is code.** Version it, test it, make it reviewable. "This project treats methodology as code. Assumptions are versioned, reviewable, and testable."
