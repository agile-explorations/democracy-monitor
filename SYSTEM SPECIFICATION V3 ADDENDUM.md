# Democracy Monitor â€” Specification Addendum (V3)

## Document Purpose

This addendum extends the V3 specification (all phases now complete) with two new capabilities:

1. **Data resilience and source health monitoring** â€” addressing the systemic risk that authoritarian consolidation degrades the very government data sources this system depends on, making data disappearance itself a critical signal.
2. **Feedback learning loops** â€” enabling the system to learn from human review decisions and AI disagreements, proposing methodology improvements that humans approve and version-control.

This addendum is sequenced for implementation with Claude Code.

**Note on UI**: This specification identifies where UI components are needed but does not detail their design or implementation. A separate UI specification (in progress) covers all presentation layer work.

---

## Motivation

The entire Democracy Monitor architecture assumes the availability of government data: Federal Register API responses, RSS feeds from GAO/SCOTUS/DoD, White House press releases, and government website uptime. If the system is measuring movement toward authoritarianism, it must account for the possibility that:

1. Government sources publish less data, or less reliably
2. APIs change schemas, degrade response quality, or go offline
3. RSS feeds go silent â€” not temporarily, but permanently
4. Government websites block scrapers or remove content
5. FOIA compliance declines, reducing the public record

**Missing data is itself a signal â€” possibly the most important one the system can report.** A week where the pipeline ingests 15 documents instead of the usual 60â€“80 is more alarming than any single keyword match, because it's a meta-signal about the integrity of every other assessment.

This addendum specifies three layers of response:

| Layer                           | Question                                                     | When                          |
| ------------------------------- | ------------------------------------------------------------ | ----------------------------- |
| **Source Health Monitoring**    | Are our data sources working?                                | Every snapshot run            |
| **Confidence Degradation**      | How reliable are our assessments given available data?       | Every assessment              |
| **Alternative Source Fallback** | Where else can we look?                                      | When primary sources degrade  |
| **Feedback Learning**           | What has the system gotten wrong, and how should it improve? | On human review, periodically |

---

## Phase 10: Source Health Monitoring

**Goal**: Track the operational health of every data source over time and surface degradation prominently.

### 10.1 Source Health Tracker

**Priority**: High â€” should ship before public launch
**Estimated scope**: ~250 lines new, ~80 lines modified

**What exists**: `uptime-service.ts` and `site_uptime` table track government website availability (site reachability: is the URL up?). `feed-fetcher.ts` fetches category feeds but doesn't record success/failure metadata. `snapshot.ts` logs errors to console but doesn't persist source health.

**Relationship to uptime-service**: Source health is a _superset_ of uptime. `uptime-service.ts` answers "is the site reachable?" while source health answers "is the source producing expected data?" A site can be reachable (uptime = healthy) but silent (source health = silent). Source health should _layer on top of_ uptime data, not replace it. The `site_uptime` table remains the ground truth for reachability; `source_health` adds volume tracking, schema validation, and canary monitoring.

**What to build**:

Create `lib/services/source-health-service.ts`:

```typescript
export interface SourceHealthCheck {
  sourceId: string; // unique key: e.g., 'federal_register', 'gao_rss', 'scotus_rss'
  sourceName: string;
  sourceType: 'api' | 'rss' | 'html' | 'json';
  category: string; // which dashboard category depends on this source

  // Check results
  status: 'healthy' | 'degraded' | 'unavailable' | 'silent';
  httpStatus?: number;
  responseTimeMs?: number;
  documentCount: number; // items returned this check
  errorMessage?: string;

  // Historical context
  expectedDocCount: number; // rolling 4-week average for this source
  countRatio: number; // documentCount / expectedDocCount
  consecutiveFailures: number; // how many checks in a row have failed
  lastSuccessAt?: string;

  checkedAt: string;
}

export interface SourceHealthSummary {
  totalSources: number;
  healthySources: number;
  degradedSources: number;
  unavailableSources: number;
  silentSources: number;
  overallHealth: 'normal' | 'degraded' | 'critical';
  dataAvailabilityScore: number; // 0.0 to 1.0
  alerts: SourceHealthAlert[];
  checkedAt: string;
}

export interface SourceHealthAlert {
  sourceId: string;
  sourceName: string;
  alertType:
    | 'source_down'
    | 'source_silent'
    | 'volume_drop'
    | 'schema_change'
    | 'response_degraded';
  severity: 'warning' | 'elevated' | 'critical';
  message: string;
  daysSinceHealthy?: number;
  detectedAt: string;
}

export async function checkSourceHealth(
  category: string,
  fetchResults: FetchResult[],
): Promise<SourceHealthCheck[]>;

export async function computeSourceHealthSummary(): Promise<SourceHealthSummary>;

export async function getSourceHealthHistory(
  sourceId: string,
  options?: { from?: string; to?: string },
): Promise<SourceHealthCheck[]>;
```

**Prerequisite â€” sourceId on signals**: Each signal in `lib/data/categories.ts` currently lacks a stable identifier. Add an `id` field to the signal type (e.g., `'federal_register_api'`, `'gao_rss'`, `'scotus_opinions'`). This ID is the `sourceId` used throughout source health tracking. Add IDs to all existing signals before implementing source health.

**Source status definitions**:

- `healthy`: Responded normally, returned expected volume of documents
- `degraded`: Responded but with reduced volume (<50% of expected), high latency (>5s), or partial errors
- `unavailable`: Failed to respond (HTTP error, timeout, DNS failure)
- `silent`: Responded successfully but returned zero new documents for 2+ consecutive checks when documents are expected

**"Silent" is the most insidious state** â€” the API returns 200 OK but nothing new is being published. This requires comparing against historical volume baselines.

**Cold-start strategy**: The `expectedDocCount` field requires historical data that won't exist on first deploy. Use `expectedMinWeeklyDocs` from canary config (see Configuration Defaults) as the initial baseline. After 4 weeks of data collection, switch to the rolling average. During the cold-start period, only `unavailable` status (HTTP failures) should generate alerts; `silent` and `degraded` require baseline data and should be suppressed until week 5.

**Schema change** â€” add `source_health` table (SQL shown for documentation; implementation uses Drizzle ORM in `lib/db/schema.ts`):

```sql
CREATE TABLE source_health (
  id SERIAL PRIMARY KEY,
  source_id VARCHAR(100) NOT NULL,
  source_name VARCHAR(255) NOT NULL,
  source_type VARCHAR(20) NOT NULL,
  category VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  http_status INTEGER,
  response_time_ms INTEGER,
  document_count INTEGER NOT NULL DEFAULT 0,
  expected_doc_count REAL,
  count_ratio REAL,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_success_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_source_health_source_time ON source_health (source_id, checked_at DESC);
CREATE INDEX idx_source_health_status ON source_health (status, checked_at DESC);
```

**Integration with snapshot.ts**: `fetchCategoryFeeds()` currently returns `FeedItem[]` with no metadata. Rather than breaking its signature (used widely), create a wrapper function `fetchCategoryFeedsWithMetadata()` that calls `fetchCategoryFeeds()` internally and additionally captures per-source fetch metadata (response time, HTTP status, item count, errors). Use the wrapper in `snapshot.ts`. After all categories are processed, call `computeSourceHealthSummary()` and store it. If overall health is `degraded` or `critical`, emit alerts.

**Canary sources**: Rather than maintaining a separate `canary-sources.ts` file that can drift from signal definitions, add health configuration inline on signals in `lib/data/categories.ts`:

```typescript
// In the Signal type definition:
export interface Signal {
  id: string;                    // stable identifier for health tracking
  // ... existing fields ...
  health?: {
    isCanary: boolean;           // always expected to produce data
    expectedFrequency: 'daily' | 'weekly' | 'weekly_during_term';
    maxSilentDays: number;
    expectedMinWeeklyDocs: number;
  };
}

// Example usage in categories.ts:
{
  id: 'federal_register_api',
  label: 'Federal Register',
  // ... existing fields ...
  health: {
    isCanary: true,
    expectedFrequency: 'daily',
    maxSilentDays: 3,
    expectedMinWeeklyDocs: 20,
  },
}
```

If a canary source goes silent beyond its `maxSilentDays`, this generates a high-severity alert independent of any keyword analysis. The absence of the expected signal is itself the alarm. Non-canary signals (those without `health` config or with `isCanary: false`) are still tracked for health but don't trigger canary alerts.

**Files touched**:

- Create: `lib/services/source-health-service.ts`
- Modify: `lib/data/categories.ts` (add `id` and `health` config to signals)
- Modify: `lib/types/` (add `id` and `health?` to Signal type)
- Modify: `lib/db/schema.ts` (add `sourceHealth` table via Drizzle)
- Modify: `lib/cron/snapshot.ts` (use `fetchCategoryFeedsWithMetadata()`, compute health summary)
- Create: `lib/services/feed-fetcher-metadata.ts` (wrapper returning items + fetch metadata)
- Create: `drizzle/NNNN_source_health.sql`
- Create: `pages/api/health/sources.ts`

### 10.2 Confidence Degradation from Source Loss

**Priority**: High
**Estimated scope**: ~100 lines modified

**What exists**: `confidence-scoring.ts` has `calculateDataCoverage()` which factors in item count and AI agreement. `EnhancedAssessment` has `dataCoverage` and `dataCoverageFactors`.

**What to change**:

Extend `calculateDataCoverage()` to incorporate source health:

```typescript
export function calculateDataCoverage(
  items: ContentItem[],
  keywordResult: AssessmentResult,
  aiStatus?: StatusLevel,
  sourceHealth?: SourceHealthSummary, // NEW parameter
): { confidence: number; factors: Record<string, number> } {
  // ... existing logic ...

  // NEW: Source availability factor
  if (sourceHealth) {
    factors.sourceAvailability = sourceHealth.dataAvailabilityScore;

    // If source health is critical, cap confidence regardless of other factors
    // Use CRITICAL_CONFIDENCE_CAP from scoring-config.ts (value: 0.3)
    if (sourceHealth.overallHealth === 'critical') {
      return {
        confidence: Math.min(CRITICAL_CONFIDENCE_CAP, baseConfidence * factors.sourceAvailability),
        factors,
      };
    }

    // If degraded, apply multiplicative penalty
    if (sourceHealth.overallHealth === 'degraded') {
      baseConfidence *= sourceHealth.dataAvailabilityScore;
    }
  }

  // ...
}
```

**UI impact**: When confidence drops due to source degradation, assessments should display a prominent notice:

> "Data availability reduced â€” 3 of 8 sources are unavailable this week. This assessment is based on incomplete data and may not reflect the full picture."
>
> _(Rendered with a warning-level status indicator; see UI specification for treatment.)_

This notice should appear _above_ the status level, not below it. Reduced data reliability is more important than the assessment itself.

**Files touched**:

- Modify: `lib/services/confidence-scoring.ts` (add source health factor)
- Modify: `lib/services/ai-assessment-service.ts` (pass source health to confidence calculation)

### 10.3 Source Health Dashboard Display

**Priority**: High
**Estimated scope**: ~150 lines (React component)

**UI needed** (see separate UI specification):

- Summary bar showing source health counts (healthy/degraded/unavailable/silent)
- Per-source expandable detail: status badge, last successful check, volume vs expected, response time trend
- Historical availability chart: percentage of sources healthy over time
- Source alert display when canary sources go silent

This panel should be **more prominent than keyword-based assessments** when source health is degraded.

**Backend support** (this spec):

- Create: `pages/api/health/sources.ts` â€” returns `SourceHealthSummary` + per-source history
- Create: `pages/api/health/sources/[sourceId].ts` â€” returns history for a single source

---

## Phase 11: Alternative Source Integration

**Goal**: Define and implement fallback data sources that are outside government control, activated when primary sources degrade.

### 11.1 Source Priority Framework

**Priority**: Medium â€” design now, implement incrementally
**Estimated scope**: ~50 lines (configuration)

Define a tiered source priority model:

```typescript
export interface SourceTier {
  tier: number;
  label: string;
  description: string;
  trustLevel: 'primary' | 'secondary' | 'supplementary';
  examples: string[];
}

export const SOURCE_TIERS: SourceTier[] = [
  {
    tier: 1,
    label: 'Official Government Publications',
    description: 'Direct government publications with legal force',
    trustLevel: 'primary',
    examples: ['Federal Register API', 'GAO Reports', 'SCOTUS Opinions'],
  },
  {
    tier: 2,
    label: 'Congressional & Judicial Records',
    description: 'Published by branches with independent authority',
    trustLevel: 'primary',
    examples: ['GovInfo Congressional Record', 'PACER/CourtListener', 'Committee transcripts'],
  },
  {
    tier: 3,
    label: 'State & Civil Society Filings',
    description: 'Litigation and reports generated outside federal executive control',
    trustLevel: 'secondary',
    examples: [
      'State AG litigation trackers',
      'ACLU dockets',
      'Brennan Center reports',
      'CREW filings',
    ],
  },
  {
    tier: 4,
    label: 'Media & International Sources',
    description: 'Reporting-based sources, independently generated',
    trustLevel: 'supplementary',
    examples: ['GDELT', 'AP/Reuters', 'BBC', 'international press'],
  },
];
```

**When to escalate**: If Tier 1 source health drops below 70% availability for 2+ consecutive weeks, the system should:

1. Alert: "Primary government data sources are degraded. Expanding monitoring to alternative sources."
2. Increase polling frequency for Tier 2â€“3 sources
3. Display Tier 2â€“3 data alongside (not replacing) Tier 1 data, clearly labeled by source tier

**Files touched**:

- Create: `lib/data/source-tiers.ts`

### 11.2 Court Filing Integration (Tier 2)

**Priority**: Medium
**Estimated scope**: ~200 lines new

**Rationale**: Court filings challenging government actions are generated by plaintiffs, not the government. Even if the executive branch stops publishing, litigation against executive overreach continues to produce a public record.

**What to build**:

Create `lib/services/court-filing-service.ts`:

```typescript
export interface CourtFiling {
  caseNumber: string;
  caseName: string;
  court: string;
  filingDate: string;
  filingType: 'complaint' | 'motion' | 'order' | 'opinion' | 'injunction';
  summary?: string;
  url: string;
  plaintiffType: 'state_ag' | 'civil_society' | 'individual' | 'congressional' | 'other';
  relevantCategories: string[]; // mapped to dashboard categories
}

export async function fetchRecentFilings(options?: {
  from?: string;
  courts?: string[];
}): Promise<CourtFiling[]>;
```

**Data sources**:

- **CourtListener API** (free, covers federal courts): https://www.courtlistener.com/api/
- **RECAP Archive** (PACER documents made public): integrated via CourtListener
- Filtered to cases involving federal agencies, executive orders, constitutional challenges

**Files touched**:

- Create: `lib/services/court-filing-service.ts`
- Create: `lib/parsers/courtlistener-parser.ts`
- Modify: `lib/data/categories.ts` (add court filing signals to relevant categories)

### 11.3 State Attorney General Tracker (Tier 3)

**Priority**: Medium-low
**Estimated scope**: ~150 lines new

**Rationale**: State AGs challenging federal actions generate documents entirely outside federal executive control. Multi-state lawsuits against executive overreach are a strong signal of institutional pushback.

**What to build**:

Create `lib/services/state-ag-service.ts`:

```typescript
export interface StateAGAction {
  state: string;
  actionType: 'lawsuit' | 'investigation' | 'opinion' | 'coalition';
  targetAgency?: string;
  summary: string;
  filingDate: string;
  url: string;
  coalitionSize?: number; // number of states joining
  relevantCategories: string[];
}
```

**Data approach**: Initially, monitor a curated list of state AG press release RSS feeds and litigation trackers. Many state AG offices publish RSS feeds. Supplement with GDELT media coverage of state AG actions.

**Files touched**:

- Create: `lib/services/state-ag-service.ts`
- Create: `lib/data/state-ag-sources.ts`

### 11.4 FOIA Litigation as Transparency Proxy (Tier 3)

**Priority**: Medium-low
**Estimated scope**: ~100 lines new

**Rationale**: FOIA denial rates and FOIA lawsuits are themselves public records (filed in federal court). A spike in FOIA litigation is a measurable proxy for declining transparency â€” and it's data the executive branch cannot suppress because it's generated by plaintiffs.

**What to build**:

Track FOIA-related litigation volume via CourtListener (filtered to FOIA/5 USC 552 cases). Compute:

- Weekly FOIA lawsuit filing rate
- Comparison against baseline filing rate
- Trend direction (increasing litigation = decreasing transparency)

Feed results into the `infoAvailability` category as supplementary evidence.

**Files touched**:

- Modify: `lib/services/court-filing-service.ts` (add FOIA-specific query)
- Modify: `lib/data/categories.ts` (add FOIA litigation signal to `infoAvailability`)

---

## Phase 12: Data Disappearance as First-Class Signal

**Goal**: Promote data availability from "one category among eleven" to a system-wide meta-layer that affects all assessments.

### 12.1 Meta-Assessment: "Can We See?"

**Priority**: High
**Estimated scope**: ~150 lines new

**What exists**: `infoAvailability` is one of 11 categories, tracked with the same keyword methodology as the others. Source uptime is checked by `uptime-service.ts`.

**What to change**:

Create `lib/services/meta-assessment-service.ts`:

```typescript
export interface MetaAssessment {
  // Overall: can we trust what the system is telling us?
  dataIntegrity: 'high' | 'moderate' | 'low' | 'critical';
  integrityScore: number; // 0.0 to 1.0

  // Components
  sourceAvailability: number; // fraction of sources responding
  volumeNormality: number; // current volume / baseline volume
  coverageBreadth: number; // fraction of categories with adequate data
  canaryStatus: 'all_ok' | 'some_silent' | 'critical_silent';

  // Derived signals
  transparencyTrend: 'improving' | 'stable' | 'declining' | 'rapidly_declining';
  weekOverWeekVolumeChange: number; // percentage

  // Human-readable
  summary: string;
  alerts: string[];
  recommendation: string; // e.g., "Assessments should be interpreted with caution"
}

export async function computeMetaAssessment(): Promise<MetaAssessment>;
```

**UI needed** (see separate UI specification): The meta-assessment should appear at the **top** of the dashboard, above all category assessments. The UI spec should define banner treatments for each `dataIntegrity` level (`high`, `moderate`, `low`, `critical`), with the critical state being the most visually prominent element on the page. Key principle: when data disappears, the system shouldn't quietly show "Stable" â€” it should loudly announce that it can't see.

**Files touched**:

- Create: `lib/services/meta-assessment-service.ts`
- Modify: `lib/cron/snapshot.ts` (compute and store meta-assessment)
- Create: `pages/api/health/meta.ts`

### 12.2 Absence-Aware Assessment Logic

**Priority**: High
**Estimated scope**: ~60 lines modified

**What to change in assessment-service.ts**:

Currently, when there are no items, the system returns:

```typescript
status: 'Warning',
reason: 'Not enough information to make an assessment'
```

This is too quiet. Modify to distinguish between:

1. **Insufficient data (routine)**: Few items fetched, sources are healthy â†’ current behavior is fine
2. **Insufficient data (suspicious)**: Few items fetched AND sources are degraded/silent â†’ escalate

```typescript
// In analyzeContent() or enhancedAssessment():
if (itemCount < 3 && sourceHealth?.overallHealth !== 'normal') {
  return {
    status: 'Warning',
    reason:
      `Data sources for this category are ${sourceHealth.overallHealth}. ` +
      `Only ${itemCount} document${itemCount === 1 ? '' : 's'} available from ` +
      `${sourceHealth.healthySources} of ${sourceHealth.totalSources} sources. ` +
      `This assessment may not reflect actual conditions.`,
    matches: [],
    detail: {
      ...detail,
      insufficientData: true,
      dataSourceDegraded: true,
      sourceHealthSummary: sourceHealth,
    },
  };
}
```

**Files touched**:

- Modify: `lib/services/assessment-service.ts` (absence-aware logic)
- Modify: `lib/services/ai-assessment-service.ts` (pass source health into assessment)

---

## Phase 13: Feedback Learning Loops

**Goal**: Enable the system to learn from human review decisions and AI disagreements, proposing methodology improvements that humans approve and version-control.

**Design constraint**: The system must never silently change its own methodology. Every recommendation is explicit, reviewable, and reversible. The loop is: **system proposes â†’ human approves â†’ code changes â†’ tests run â†’ version bumps.**

### 13.1 Feedback Store

**Priority**: High
**Estimated scope**: ~150 lines new

**What exists**: The V3 review queue (`review-queue.ts`) stores human decisions when AI and keywords disagree. The `alerts` table records flagged assessments. But these are write-only â€” nothing reads them back to improve the system.

**What to build**:

Create `lib/services/feedback-store.ts`:

```typescript
export interface FeedbackRecord {
  id: number;
  feedbackType:
    | 'review_decision'
    | 'ai_disagreement'
    | 'false_positive_report'
    | 'missed_event_report';

  // Context
  category: string;
  weekOf: string;
  documentIds?: number[];

  // What happened
  keywordStatus: StatusLevel;
  aiRecommendedStatus?: StatusLevel;
  humanFinalStatus?: StatusLevel;
  humanReasoning?: string;
  reviewer?: string;

  // What was wrong
  falsePositiveKeywords?: string[]; // keywords that fired incorrectly
  missingKeywords?: string[]; // keywords that should have fired
  suppressionSuggestions?: string[]; // context terms that should suppress a keyword
  tierChangeSuggestions?: Array<{
    keyword: string;
    currentTier: 'capture' | 'drift' | 'warning';
    suggestedTier: 'capture' | 'drift' | 'warning' | 'remove';
    reason: string;
  }>;

  createdAt: string;
  processedAt?: string; // when a recommendation was generated from this
}

export async function recordFeedback(
  feedback: Omit<FeedbackRecord, 'id' | 'createdAt'>,
): Promise<void>;
export async function getUnprocessedFeedback(): Promise<FeedbackRecord[]>;
export async function markProcessed(ids: number[]): Promise<void>;
```

**Schema change** â€” add `feedback` table (SQL shown for documentation; implementation uses Drizzle ORM in `lib/db/schema.ts`):

```sql
CREATE TABLE feedback (
  id SERIAL PRIMARY KEY,
  feedback_type VARCHAR(50) NOT NULL,
  category VARCHAR(50) NOT NULL,
  week_of DATE,
  document_ids JSONB,
  keyword_status VARCHAR(20),
  ai_recommended_status VARCHAR(20),
  human_final_status VARCHAR(20),
  human_reasoning TEXT,
  reviewer VARCHAR(100),
  false_positive_keywords JSONB,
  missing_keywords JSONB,
  suppression_suggestions JSONB,
  tier_change_suggestions JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_feedback_unprocessed ON feedback (processed_at) WHERE processed_at IS NULL;
CREATE INDEX idx_feedback_category ON feedback (category, created_at DESC);
```

**Integration with existing review queue**: When `resolveReview()` is called (V3 Phase 3.2), automatically create a `FeedbackRecord` from the review decision. If the human sided with the AI's downgrade, extract the false-positive keywords. If the human overrode both keyword engine and AI, flag for special attention.

**Note**: The current `resolveReview()` signature only accepts `{ finalStatus, reason, reviewer }`. To populate `FeedbackRecord` fields like `falsePositiveKeywords`, `missingKeywords`, and `tierChangeSuggestions`, the review resolution interface must be extended. Update `resolveReview()` to accept an optional `feedback` parameter:

```typescript
export async function resolveReview(
  alertId: number,
  decision: {
    finalStatus: StatusLevel;
    reason: string;
    reviewer: string;
    feedback?: {
      falsePositiveKeywords?: string[];
      missingKeywords?: string[];
      suppressionSuggestions?: string[];
      tierChangeSuggestions?: TierChangeSuggestion[];
    };
  },
): Promise<void>;
```

**Prerequisite**: The review resolution UI (or API) must expose these fields. The `pages/api/reviews.ts` endpoint (from V3 Phase 3.2) needs a corresponding update to accept feedback in the request body.

**Files touched**:

- Create: `lib/services/feedback-store.ts`
- Modify: `lib/db/schema.ts` (add `feedback` table via Drizzle)
- Modify: `lib/services/review-queue.ts` (extend `resolveReview()` signature, emit feedback on resolution)
- Modify: `pages/api/reviews.ts` (accept feedback fields in request body)
- Create: `drizzle/NNNN_feedback.sql`

### 13.2 Suppression Rule Learning

**Priority**: High â€” highest-ROI form of learning
**Estimated scope**: ~200 lines new

**Rationale**: When a human reviewer downgrades an assessment because a keyword match was a false positive, that decision contains a concrete, extractable lesson. The system should propose a suppression rule that would have prevented the false positive.

**What to build**:

Create `lib/services/suppression-learner.ts`:

```typescript
export interface SuppressionProposal {
  id: number;
  proposalType: 'new_rule' | 'extend_rule' | 'new_negation';

  // What triggered this proposal
  sourceRecordIds: number[]; // feedback records that led to this
  occurrenceCount: number; // how many times this pattern appeared

  // The proposal
  keyword: string;
  category: string;
  suggestedRule: {
    suppress_if_any?: string[];
    downweight_if_any?: string[];
    negate_if_any?: string[];
  };
  rationale: string; // human-readable explanation

  // Example documents where this would have applied
  exampleDocuments: Array<{
    title: string;
    url?: string;
    wouldHaveSuppressed: boolean;
  }>;

  // Origin — which subsystem generated this proposal
  proposalSource:
    | 'suppression_learning'
    | 'novelty_detection'
    | 'rhetoric_pipeline'
    | 'expert_submission'
    | 'keyword_health';
  sourceSubmissionId?: number; // links to expert_submissions.id when proposalSource = 'expert_submission'

  // Status
  status: 'proposed' | 'approved' | 'rejected' | 'implemented';
  reviewedBy?: string;
  reviewedAt?: string;
  implementedInVersion?: string;

  createdAt: string;
}

export async function generateSuppressionProposals(): Promise<SuppressionProposal[]>;
export async function getPendingProposals(): Promise<SuppressionProposal[]>;
export async function reviewProposal(
  id: number,
  decision: { status: 'approved' | 'rejected'; reviewer: string; notes?: string },
): Promise<void>;
```

**How `generateSuppressionProposals()` works**:

1. Read unprocessed feedback where `falsePositiveKeywords` is non-empty
2. For each false-positive keyword, look up the source documents via `feedback.documentIds` â†’ `documents` table (joined by ID). If `documentIds` is empty, fall back to querying documents by `category + weekOf` from the `documents` table.
3. Extract co-occurring terms from those documents (title + summary text)
4. Identify terms that appear in the false-positive documents but are unlikely to appear in genuine threat documents
5. Propose a suppression rule: `suppress_if_any: [co-occurring terms]`
6. Validate the proposal against existing true-positive test fixtures to ensure it wouldn't suppress genuine detections
7. Store as a proposal with `status: 'proposed'`

**AI-assisted extraction** (optional enhancement): If an AI provider is available, use it to analyze the false-positive documents and propose context terms:

```
These documents triggered the keyword "${keyword}" but were determined to be
false positives by a human reviewer. For each document, identify 2-3 terms
that indicate this is not a genuine institutional threat (e.g., historical
discussion, routine legal proceeding, academic analysis). These terms will
be used as suppression rules.
```

**Regression test generation**: When a proposal is approved, automatically append a test case to the existing fixture file `__tests__/fixtures/scoring/false-positives.ts` (which already contains `FALSE_POSITIVE_CASES` used by `document-scorer.test.ts`):

```typescript
// Appended to FALSE_POSITIVE_CASES in __tests__/fixtures/scoring/false-positives.ts
// Auto-generated from approved proposal #42
{
  name: 'Auto: RICO charge in drug trafficking context (from feedback 2025-03-15)',
  item: {
    title: originalDocument.title,
    summary: originalDocument.summary,
    type: originalDocument.type,
  },
  category: proposal.category,
  suppressedKeyword: proposal.keyword,
}
```

This closes the loop: false positive â†’ feedback â†’ proposal â†’ approval â†’ suppression rule â†’ regression test. The existing `document-scorer.test.ts` iterates `FALSE_POSITIVE_CASES` dynamically, so new entries are automatically tested.

**Files touched**:

- Create: `lib/services/suppression-learner.ts`
- Create: `lib/cron/generate-proposals.ts` (periodic job, weekly or monthly)
- Create: `pages/api/proposals.ts` (list/review proposals)
- Modify: `lib/db/schema.ts` (add `suppression_proposals` table via Drizzle)
- Create: `drizzle/NNNN_suppression_proposals.sql`

### 13.3 Keyword Health Dashboard

**Priority**: Medium
**Estimated scope**: ~150 lines new (service + API)

**Rationale**: Over time, the system accumulates data about which keywords are useful and which are noisy. Surfacing this as a "keyword health" report helps maintainers prioritize dictionary improvements.

**What to build**:

Create `lib/services/keyword-health-service.ts`:

```typescript
export interface KeywordHealthReport {
  generatedAt: string;
  reportPeriod: { from: string; to: string };

  // Keywords that fire frequently but never contribute to genuine concerns
  noisyKeywords: Array<{
    keyword: string;
    category: string;
    tier: 'capture' | 'drift' | 'warning';
    fireCount: number;
    suppressedCount: number;
    contributedToElevatedStatus: number; // times this keyword was part of a Drift/Capture assessment that wasn't downgraded
    noiseRatio: number; // suppressedCount / fireCount
    recommendation: string; // e.g., "Consider adding suppression rules or demoting to warning tier"
  }>;

  // Keywords that have never fired (may indicate gaps or overly specific terms)
  dormantKeywords: Array<{
    keyword: string;
    category: string;
    tier: 'capture' | 'drift' | 'warning';
    weeksSinceFired: number;
    recommendation: string;
  }>;

  // Tier change recommendations based on accumulated evidence
  tierChangeRecommendations: Array<{
    keyword: string;
    category: string;
    currentTier: 'capture' | 'drift' | 'warning';
    recommendedTier: 'capture' | 'drift' | 'warning';
    evidence: string;
  }>;

  // Volume threshold recommendations based on empirical distributions
  volumeThresholdRecommendations: Array<{
    category: string;
    currentThresholds: { warning: number; drift: number; capture: number };
    recommendedThresholds: { warning: number; drift: number; capture: number };
    basis: string; // e.g., "Based on 95th/99th percentile of baseline period"
  }>;
}

export async function generateKeywordHealthReport(options?: {
  from?: string;
  to?: string;
}): Promise<KeywordHealthReport>;
```

**API endpoint**: `GET /api/methodology/keyword-health` â€” returns the report. Useful for OSS contributors evaluating dictionary quality.

**UI needed** (see separate UI specification): A methodology health page showing noisy keywords, dormant keywords, and tier change recommendations. This is an internal/contributor-facing tool, not a public dashboard element.

**Files touched**:

- Create: `lib/services/keyword-health-service.ts`
- Create: `pages/api/methodology/keyword-health.ts`

### 13.4 AI Prompt Learning Corpus

**Priority**: Medium-low
**Estimated scope**: ~80 lines new

**Rationale**: When a human reviewer disagrees with _both_ the keyword engine and the AI, that's the most valuable signal â€” neither automated layer got it right. Accumulating these cases creates a corpus for periodic AI prompt refinement.

**What to build**:

Create `lib/services/prompt-learning-service.ts`:

```typescript
export interface PromptLearningCase {
  id: number;
  category: string;
  weekOf: string;

  // What the systems said
  keywordStatus: StatusLevel;
  aiStatus: StatusLevel;
  humanStatus: StatusLevel;

  // The disagreement
  disagreementType:
    | 'human_overrode_both'
    | 'human_overrode_keywords_agreed_ai'
    | 'human_overrode_ai_agreed_keywords';

  // Context
  documentSummaries: string[];
  matchedKeywords: string[];
  aiReasoning: string;
  humanReasoning: string;

  createdAt: string;
}

export async function extractLearningCases(options?: {
  from?: string;
  to?: string;
}): Promise<PromptLearningCase[]>;

export async function generatePromptImprovementReport(cases: PromptLearningCase[]): Promise<string>; // AI-generated analysis of what the prompt misses
```

**Usage pattern**: This is not automated â€” it's a quarterly review tool. Run `generatePromptImprovementReport()` with accumulated cases, review the AI's analysis of its own failures, and manually update the assessment prompt in `lib/ai/prompts/assessment.ts`.

**Files touched**:

- Create: `lib/services/prompt-learning-service.ts`
- Create: `pages/api/methodology/prompt-learning.ts`

### 13.5 Novel Threat Detection

**Priority**: Medium
**Estimated scope**: ~200 lines new

**Rationale**: Sections 13.1–13.4 address known-unknown problems: the system fired on something it shouldn't have, or a human corrected an assessment. But the deepest blind spot is unknown-unknowns — threats the keyword dictionaries were never designed to detect. If the administration adopts a novel strategy (e.g., "nationalizing federal elections"), no existing keyword will catch it, no false positive will flag it, and no human reviewer will see it — because there's nothing to review.

Two mechanisms address this, working in concert.

**Prerequisite — Baseline centroids**: `embedding-service.ts` has `computeCentroid()` and `cosineSimilarity()`, but no baseline centroids are persisted per category. Before novelty detection can work, implement: (a) a `category_baselines` table (or column in existing schema) storing centroid vectors and noise floors per category per baseline period, and (b) a one-time baseline computation job that processes existing document embeddings to establish centroids. This is a prerequisite item within the novelty detection sprint.

**Mechanism A — Semantic Novelty Detection**:

The system computes per-category embedding centroids via `computeCentroid()` in `embedding-service.ts`. Extend this to persist baseline centroids and identify _which specific documents_ are driving drift — the documents farthest from the baseline centroid that also scored zero on keywords.

Create `lib/services/novelty-detector.ts`:

```typescript
export interface NoveltyCandidate {
  documentId: number;
  title: string;
  url?: string;
  category: string;
  publishedAt?: string;

  // Why this was flagged
  distanceFromCentroid: number; // cosine distance from baseline centroid
  normalizedNovelty: number; // distance / noise floor (in units of normal variation)
  keywordScore: number; // should be 0 or very low — that's the point

  // AI-suggested keywords (populated by Mechanism B)
  suggestedKeywords?: string[];
  suggestedTier?: 'capture' | 'drift' | 'warning';
  aiRationale?: string;
}

export interface NoveltyReport {
  category: string;
  weekOf: string;
  candidateCount: number;
  candidates: NoveltyCandidate[]; // sorted by normalizedNovelty, descending
  generatedAt: string;
}

export async function detectNovelDocuments(
  category: string,
  weekOf: string,
  options?: { topK?: number; minNoveltyMultiple?: number },
): Promise<NoveltyReport>;

export async function detectNovelDocumentsAllCategories(
  weekOf: string,
): Promise<Record<string, NoveltyReport>>;
```

**How it works**:

1. For each category, retrieve all documents from the current week that scored 0 (or below a low threshold) on keyword matching
2. Compute each document's cosine distance from the baseline centroid for that category
3. Normalize by the noise floor (from baseline computation)
4. Surface documents where `normalizedNovelty >= MIN_NOVELTY_MULTIPLE` (default 2.0 — more than 2× normal variation from baseline, yet invisible to keywords). Store `MIN_NOVELTY_MULTIPLE` in `lib/methodology/scoring-config.ts` alongside other thresholds.
5. These are the documents most likely to represent novel threat patterns

**Mechanism B — AI Document Triage**:

Take the novelty candidates from Mechanism A and ask an AI to evaluate them for institutional relevance and propose keywords:

```
You are reviewing government documents that our automated keyword system
did not flag, but which are linguistically unusual for their category.
Your job is to determine whether any represent novel threats to democratic
institutions that our keyword dictionaries should be updated to detect.

CATEGORY: ${categoryTitle}
CURRENT KEYWORDS (for reference): ${existingKeywords}

UNFLAGGED DOCUMENTS (sorted by linguistic novelty):
${candidateSummaries}

For each document that represents a genuine institutional concern:
1. ASSESSMENT: Why this document matters for democratic monitoring
2. SUGGESTED_KEYWORDS: 1-3 specific phrases that would detect similar
   documents in the future
3. SUGGESTED_TIER: capture, drift, or warning
4. RATIONALE: Why this tier is appropriate

For documents that are linguistically unusual but not institutionally
concerning, briefly note why they can be ignored.

Respond in JSON format.
```

**Output**: Keyword proposals fed into the existing proposal queue (13.2). Each proposal is tagged with `proposalSource: 'novelty_detection'` to distinguish it from suppression-learning proposals.

**Integration with snapshot.ts**: Run novelty detection weekly as part of the snapshot cycle, after document scoring and embedding. Only runs for categories where semantic drift exceeds `NOVELTY_DRIFT_TRIGGER` (default 1.5× noise floor, stored in `scoring-config.ts`) — no point scanning for novel documents when the language hasn't changed.

**Files touched**:

- Create: `lib/services/novelty-detector.ts`
- Create: `lib/ai/prompts/novelty-triage.ts`
- Modify: `lib/cron/snapshot.ts` (run novelty detection when drift is elevated)
- Create: `pages/api/methodology/novelty.ts`

### 13.6 Rhetoric-to-Keyword Pipeline

**Priority**: Medium
**Estimated scope**: ~150 lines new

**Rationale**: The rhetoric tracking system (V3 Phase 6) already detects emerging language patterns in White House briefings, GDELT media coverage, and other rhetoric sources. When a new phrase appears frequently in rhetoric but has no corresponding action keyword, that's a gap the system can identify proactively — before any government action documents appear.

This turns rhetoric tracking from a parallel analytical layer into an early-warning system for keyword dictionary gaps.

**What to build**:

Create `lib/services/rhetoric-keyword-pipeline.ts`:

```typescript
export interface RhetoricKeywordGap {
  // The rhetoric signal
  phrase: string;
  policyArea: PolicyArea;
  firstDetectedAt: string;
  weeklyFrequency: number; // appearances per week in rhetoric sources
  trendDirection: 'emerging' | 'stable' | 'declining';
  weeksActive: number;

  // The gap
  matchingActionKeywords: string[]; // existing action keywords that overlap (may be empty)
  matchingCategoryKeywords: string[]; // existing category keywords that overlap (may be empty)
  gapType: 'no_action_keyword' | 'no_category_keyword' | 'both';

  // Proposed additions
  suggestedKeywords: Array<{
    keyword: string;
    targetCategory: string;
    suggestedTier: 'capture' | 'drift' | 'warning';
    rationale: string;
  }>;
}

export async function detectRhetoricKeywordGaps(options?: {
  minWeeksActive?: number;
  minWeeklyFrequency?: number;
}): Promise<RhetoricKeywordGap[]>;
```

**How it works**:

1. Scan the `intentStatements` table for rhetoric-type statements from the past 4–8 weeks
2. Extract high-frequency phrases and check against two dictionaries:
   - `ACTION_KEYWORDS` in `lib/data/intent-keywords.ts` (keyed by PolicyArea — 5 areas)
   - Category keywords in `lib/data/assessment-rules.ts` (keyed by dashboard category — 11 categories)
3. The `gapType` field records which dictionary is missing coverage: `'no_action_keyword'` (missing from intent-keywords), `'no_category_keyword'` (missing from assessment-rules), or `'both'`
4. Filter to phrases that have been active for >= 2 weeks (not just a one-time mention)
5. For each gap, propose corresponding keywords for the relevant dashboard categories
6. Feed proposals into the existing proposal queue (13.2), tagged with `proposalSource: 'rhetoric_pipeline'`

**Example**: "Nationalize elections" starts appearing in White House briefings and GDELT media coverage. The rhetoric tracker picks it up under the `elections` policy area. The pipeline checks: does any keyword in `elections` category or `ACTION_KEYWORDS.elections` match this phrase? No. It proposes:

- Add `nationalize elections` to `elections` category at `drift` tier
- Add `federal election authority` to `elections` category at `drift` tier
- Add `national election control` to `elections` category at `capture` tier

These proposals go to the review queue. A human approves, the keywords are added, and regression tests are generated.

**AI-assisted gap analysis** (optional enhancement): When the pipeline detects a rhetoric phrase with no keyword match, optionally ask an AI to suggest the most effective keyword formulations:

```
The phrase "${phrase}" has appeared ${frequency} times in government rhetoric
over the past ${weeks} weeks but has no corresponding keywords in our
monitoring system. Suggest 2-4 keyword phrases that would detect government
*actions* (not just rhetoric) related to this concept. For each, suggest
whether it belongs in the capture, drift, or warning tier.
```

**Cadence**: Run weekly alongside the snapshot cycle, or monthly as a separate cron job. The pipeline should be lightweight — it's primarily string matching and frequency counting against existing data.

**Files touched**:

- Create: `lib/services/rhetoric-keyword-pipeline.ts`
- Modify: `lib/cron/generate-proposals.ts` (add rhetoric gap detection to proposal generation)
- Create: `pages/api/methodology/rhetoric-gaps.ts`

### 13.7 Expert Keyword Contribution API

**Priority**: Medium — should ship before broader public launch
**Estimated scope**: ~200 lines new

**Rationale**: The feedback loop now has four automated proposal sources: suppression learning (13.2), novelty detection (13.5), rhetoric pipeline (13.6), and keyword health recommendations (13.3). But the people most likely to spot keyword deficiencies — constitutional lawyers, political scientists, journalists covering democratic erosion — are the least likely to engage through a code contribution workflow. There is no structured way for a domain expert to say "you should be tracking X" without submitting a GitHub pull request.

This section adds a lightweight submission path that routes expert input through the same proposal review pipeline as automated proposals.

**What to build**:

Create `lib/services/expert-submission-service.ts`:

```typescript
export interface ExpertKeywordSubmission {
  id: number;

  // Who
  submittedBy: string; // display name or handle
  submitterIdentity?: string; // GitHub username if authenticated
  submitterCredentials?: string; // optional: "constitutional law professor", "FOIA reporter"

  // What
  submissionType:
    | 'add_keyword'
    | 'change_tier'
    | 'add_suppression'
    | 'add_category_signal'
    | 'general';
  keywords: Array<{
    keyword: string;
    targetCategory: string;
    suggestedTier: 'capture' | 'drift' | 'warning';
    rationale: string;
  }>;

  // Why
  reasoning: string; // required — minimum 50 characters
  evidenceUrls?: string[]; // links to documents, articles, court filings
  relatedDocumentIds?: number[]; // if referencing documents already in the system

  // Batch context
  batchLabel?: string; // e.g., "Election federalization keywords" — groups related submissions
  batchSize: number; // number of keywords in this submission

  // Status — derived from linked SuppressionProposal records, not independently managed
  // Computed: all proposals approved = 'accepted', some = 'partially_accepted', all rejected = 'rejected'
  // 'submitted' = proposals created but not yet reviewed, 'under_review' = at least one proposal under review
  status: 'submitted' | 'under_review' | 'accepted' | 'partially_accepted' | 'rejected';

  submittedAt: string;
}

export async function submitExpertKeywords(
  submission: Omit<ExpertKeywordSubmission, 'id' | 'submittedAt' | 'status' | 'batchSize'>,
): Promise<{ submissionId: number; proposalIds: number[] }>;

export async function getSubmissions(options?: {
  status?: string;
  submittedBy?: string;
  from?: string;
  to?: string;
}): Promise<ExpertKeywordSubmission[]>;
```

**How it works**:

1. Expert submits one or more keyword proposals via API (or future UI form)
2. Each keyword in the submission is validated:
   - Does the keyword already exist in the target category? (reject duplicates)
   - Does it conflict with an existing suppression rule? (flag for reviewer)
   - Would it have fired on any documents in the past 4 weeks? (backtest and include results with the proposal). **Note**: Backtesting is best-effort — if the `documents` table has <4 weeks of data, return `backtestCoverage: 'N of 4 weeks available'` rather than silently returning zero matches.
3. Each keyword creates a `SuppressionProposal` record (from 13.2) tagged with `proposalSource: 'expert_submission'` and linked back to the submission ID via `sourceSubmissionId`
4. If the submission contains multiple keywords with a `batchLabel`, the review queue displays them as a coherent set rather than isolated proposals
5. Human reviewer approves/rejects through the same pipeline — approved keywords get regression tests auto-generated
6. The `expert_submissions` table tracks submission-level metadata (who, credentials, batch context); individual keyword review status is derived from the linked `SuppressionProposal` records. The submission status is computed: all proposals approved = `'accepted'`, some approved = `'partially_accepted'`, all rejected = `'rejected'`.

**API endpoint**: `POST /api/methodology/submit-keywords`

```typescript
// Request body
{
  submittedBy: "Jane Smith",
  submitterCredentials: "Election law researcher, Brennan Center",
  submissionType: "add_keyword",
  keywords: [
    {
      keyword: "nationalize elections",
      targetCategory: "elections",
      suggestedTier: "drift",
      rationale: "Administration rhetoric about federalizing election administration has no corresponding monitoring keyword"
    },
    {
      keyword: "federal election authority",
      targetCategory: "elections",
      suggestedTier: "drift",
      rationale: "Proposed consolidation of election oversight under federal executive control"
    },
    {
      keyword: "national election commission",
      targetCategory: "elections",
      suggestedTier: "capture",
      rationale: "Would represent replacement of bipartisan EAC with executive-controlled body"
    }
  ],
  batchLabel: "Election federalization keywords",
  reasoning: "The administration has begun publicly discussing nationalizing federal election administration, replacing the bipartisan Election Assistance Commission with a federal authority under executive control. This represents a novel threat vector not covered by existing election category keywords.",
  evidenceUrls: [
    "https://example.com/article-about-election-nationalization"
  ]
}

// Response
{
  submissionId: 42,
  proposalIds: [156, 157, 158],
  backtestResults: {
    "nationalize elections": { wouldHaveFired: 3, documents: [...] },
    "federal election authority": { wouldHaveFired: 0, documents: [] },
    "national election commission": { wouldHaveFired: 0, documents: [] }
  }
}
```

**Abuse prevention**:

- Rate limiting: 10 submissions per IP per day, 50 keywords per submission. **Implementation note**: The existing `lib/utils/rate-limit.ts` is designed for outbound API call throttling. Inbound rate limiting for this public endpoint requires either adapting it for inbound use or adding Next.js API middleware. Use IP-based in-memory tracking initially; Redis-backed if available.
- Required fields: `reasoning` (minimum 50 characters), at least one keyword with rationale
- Optional but tracked: `submitterIdentity` is an honor-system text field initially. **Future enhancement**: GitHub OAuth for identity verification (the project has no authentication layer yet — adding OAuth is a separate effort). Authenticated submissions would be prioritized in the review queue.
- Bulk pattern detection: if a single submitter or IP submits 100+ keywords in a week, flag for review before processing

**Schema change** — add `expert_submissions` table (SQL shown for documentation; implementation uses Drizzle ORM in `lib/db/schema.ts`):

```sql
CREATE TABLE expert_submissions (
  id SERIAL PRIMARY KEY,
  submitted_by VARCHAR(255) NOT NULL,
  submitter_identity VARCHAR(255),
  submitter_credentials TEXT,
  submission_type VARCHAR(50) NOT NULL,
  keywords JSONB NOT NULL,
  reasoning TEXT NOT NULL,
  evidence_urls JSONB,
  related_document_ids JSONB,
  batch_label VARCHAR(255),
  batch_size INTEGER NOT NULL DEFAULT 1,
  -- status is derived from linked suppression_proposals records; stored as denormalized cache
  status VARCHAR(30) NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_expert_submissions_status ON expert_submissions (status, submitted_at DESC);
CREATE INDEX idx_expert_submissions_submitter ON expert_submissions (submitter_identity);
```

**UI needed** (see separate UI specification): A public-facing submission form that collects keyword proposals with reasoning and evidence. No authentication required initially (future: GitHub OAuth). The review queue (already specified in 13.2) should display expert submissions with their batch context, submitter credentials, and backtest results.

**Files touched**:

- Create: `lib/services/expert-submission-service.ts`
- Create: `pages/api/methodology/submit-keywords.ts`
- Modify: `lib/db/schema.ts` (add `expertSubmissions` table via Drizzle)
- Create: `drizzle/NNNN_expert_submissions.sql`

---

## Implementation Sequence

Each sprint targets 250-350 lines of new/modified code, following the project's established sprint process (analysis -> propose -> approve -> implement -> review -> commit).

### Sprint A (Source Health — Schema & Tracker)

1. Add `id` field to Signal type and all signals in `lib/data/categories.ts`
2. Add `health` config (canary flags, expected frequency, min weekly docs) to key signals
3. **10.1** Source health service — `checkSourceHealth()`, status classification logic
4. `source_health` Drizzle schema + migration
5. `fetchCategoryFeedsWithMetadata()` wrapper in `lib/services/feed-fetcher-metadata.ts`

**Deliverable**: Source health checks run and persist. Each signal has a stable ID and optional health config. Feed fetching captures metadata without breaking existing callers.

### Sprint B (Source Health — Integration & Confidence)

1. Integrate source health into `snapshot.ts` (call wrapper, store health checks)
2. **10.2** Confidence degradation — extend `calculateDataCoverage()` with source health factor
3. Add `CRITICAL_CONFIDENCE_CAP` to `lib/methodology/scoring-config.ts`
4. Pass source health into `ai-assessment-service.ts`
5. Cold-start logic: suppress silent/degraded alerts during first 4 weeks

**Deliverable**: Every snapshot run records source health. Assessments automatically degrade confidence when sources are unavailable. Cold-start period handled gracefully.

### Sprint C (Meta-Assessment & Absence-Aware Logic)

1. **12.1** Meta-assessment service — `computeMetaAssessment()`, transparency trend computation
2. **12.2** Absence-aware assessment logic in `assessment-service.ts`
3. Store meta-assessment in snapshot cycle
4. **10.3** Source health API endpoints (`/api/health/sources`, `/api/health/sources/[sourceId]`)
5. Meta-assessment API endpoint (`/api/health/meta`)

**UI needed** (see separate UI specification): Source health panel, data integrity banner, historical availability chart.

**Deliverable**: Meta-assessment computed every snapshot. APIs serve source health and meta-assessment data. Absence of data in degraded-source context triggers appropriate warnings.

### Sprint D (Feedback Store & Review Integration)

1. **13.1** Feedback store — `feedback` Drizzle schema + migration
2. `feedback-store.ts` — `recordFeedback()`, `getUnprocessedFeedback()`, `markProcessed()`
3. Extend `resolveReview()` signature to accept optional feedback fields
4. Update `pages/api/reviews.ts` to accept feedback in request body
5. Auto-create `FeedbackRecord` from review decisions

**Prerequisite**: `pages/api/reviews.ts` must exist (V3 Phase 3.2). If not yet implemented, create a minimal version.

**Deliverable**: Human review decisions are captured as structured feedback with false-positive keywords, missing keywords, and tier change suggestions.

### Sprint E (Suppression Learning & Keyword Health)

1. **13.2** Suppression rule learner — `generateSuppressionProposals()`
2. Proposal validation against true-positive test fixtures
3. Auto-append approved proposals to `__tests__/fixtures/scoring/false-positives.ts`
4. `suppression_proposals` Drizzle schema + migration (include `proposal_source` and `source_submission_id` columns)
5. **13.3** Keyword health report service — `generateKeywordHealthReport()`

**Deliverable**: System generates suppression rule proposals from feedback. Approved proposals auto-generate regression tests. Keyword health reports identify noisy/dormant keywords.

### Sprint F (Novel Threat Detection)

1. **13.5** Baseline centroid computation and storage — `category_baselines` table, one-time computation job
2. Novelty detector — `detectNovelDocuments()`, `detectNovelDocumentsAllCategories()`
3. AI triage prompt — `lib/ai/prompts/novelty-triage.ts`
4. Add `MIN_NOVELTY_MULTIPLE` and `NOVELTY_DRIFT_TRIGGER` to `scoring-config.ts`
5. Integration with `snapshot.ts` (run novelty detection when drift is elevated)

**Deliverable**: Semantically novel documents that evade keyword detection are surfaced for review. Baseline centroids are persisted per category. AI triage proposes keywords for novel threats.

### Sprint G (Feedback APIs, Prompt Learning & Rhetoric Pipeline)

1. **13.4** AI prompt learning corpus — `extractLearningCases()`, `generatePromptImprovementReport()`
2. Proposal review API (`/api/proposals`) — list, approve, reject
3. Keyword health API (`/api/methodology/keyword-health`)
4. Prompt learning API (`/api/methodology/prompt-learning`)
5. Cron job: `generate-proposals.ts` (weekly/monthly)
6. **13.6** Rhetoric-to-keyword pipeline — `rhetoric-keyword-pipeline.ts`

**UI needed** (see separate UI specification): Proposal review interface, keyword health dashboard.

**Deliverable**: APIs serve all feedback learning data. Rhetoric patterns proactively generate keyword proposals for emerging threats. Contributors can review system-generated methodology proposals.

### Sprint H (Expert Keyword Contribution)

1. **13.7** Expert submission service — `expert-submission-service.ts`
2. `expert_submissions` Drizzle schema + migration
3. Backtest engine for submitted keywords (best-effort, reports coverage gaps)
4. Inbound rate limiting middleware for public endpoint
5. API endpoint: `POST /api/methodology/submit-keywords`

**UI needed** (see separate UI specification): Public-facing keyword submission form.

**Deliverable**: Domain experts can submit keyword proposals through a structured API. Submissions are backtested, rate-limited, and routed through the same proposal review pipeline as automated proposals.

### Sprint I (Alternative Sources — Research & Framework)

**Note**: This is a research spike. Phase 11 depends on external APIs (CourtListener, state AG feeds) whose availability, rate limits, and data quality must be validated before committing to implementation.

1. **Research**: Evaluate CourtListener API — authentication, rate limits, data coverage, response format
2. **Research**: Survey state AG RSS feeds — availability, update frequency, content quality
3. **Research**: Assess FOIA litigation data availability via CourtListener
4. **11.1** Source priority framework — `lib/data/source-tiers.ts` (configuration only)
5. Write parsers/service stubs based on research findings

**Deliverable**: Documented assessment of external API feasibility. Source tier configuration defined. Stubs ready for implementation.

### Sprint J (Alternative Sources — Implementation)

1. **11.2** Court filing integration (CourtListener) — `court-filing-service.ts` + parser
2. **11.4** FOIA litigation tracking (filtered CourtListener query)
3. **11.3** State AG tracker (if research validates feasibility)
4. Add alternative source signals to relevant categories in `categories.ts`
5. Expand GDELT integration for international press coverage (if not complete)

**Deliverable**: System has fallback data sources outside government control. Court filings and FOIA litigation supplement government publications.

---

## Configuration Defaults

Canary source configuration lives inline on signals in `lib/data/categories.ts` (see 10.1 above). The values below are reference defaults:

| Source               | `maxSilentDays`   | `expectedMinWeeklyDocs` | Notes                        |
| -------------------- | ----------------- | ----------------------- | ---------------------------- |
| Federal Register API | 3 (business days) | 20                      | Publishes every business day |
| GAO Reports RSS      | 14                | 2                       | Weekly publication cadence   |
| SCOTUS Opinions RSS  | 14                | 0                       | Varies by term schedule      |

Health thresholds and confidence caps live in `lib/methodology/scoring-config.ts` (per project convention â€” all scoring constants in one place):

```typescript
// In lib/methodology/scoring-config.ts
export const HEALTH_THRESHOLDS = {
  degradedVolumeRatio: 0.5, // <50% of expected volume = degraded
  silentCheckCount: 2, // 2 consecutive zero-document checks = silent
  criticalSourceFraction: 0.5, // >50% sources unavailable = critical
  responseTimeWarningMs: 5000,
};

export const CRITICAL_CONFIDENCE_CAP = 0.3; // max confidence when source health is critical

// Novelty detection thresholds (Phase 13.5)
export const MIN_NOVELTY_MULTIPLE = 2.0; // documents must be 2x noise floor to flag
export const NOVELTY_DRIFT_TRIGGER = 1.5; // category drift must exceed 1.5x noise floor to scan
```

---

## Risk Reminders (Addendum-Specific)

### Data Resilience

1. **Missing data â‰  "Stable".** The system must never show "Stable" simply because it received no documents and therefore had no keyword matches. Absence of data in a context of source degradation is a warning, not a reassurance.

2. **Alternative sources have different biases.** Court filings skew toward contested actions (no one sues over routine governance). Media sources skew toward newsworthy events. When relying on Tier 2â€“4 sources, the system should note that the evidence base has shifted and interpret accordingly.

3. **Source health is the most honest thing you can show.** When the system cannot see clearly, saying so is more valuable than any assessment it could produce. Epistemic humility under uncertainty is a credibility asset, not a weakness.

4. **Data degradation may be gradual.** The most dangerous scenario isn't a sudden blackout â€” it's a slow decline where each week has 5% fewer documents than the last, and no single week triggers an alert. The trend line on source health is as important as any individual check. The `transparencyTrend` field in the meta-assessment is designed to catch this.

5. **Minimize the source asymmetry.** Baselines should use the same source mix as the current-period backfill to ensure apples-to-apples comparison. The `backfill-baseline.ts` script must fetch Federal Register documents, White House briefing room archive, and GDELT historical data — not Federal Register alone. RSS feeds (GAO, SCOTUS, DoD) genuinely lack historical archives; those remain FR-only for baseline periods. For older baselines (Obama 2013), the White House archive may use a different URL structure (obama.whitehouse.archives.gov) and should be marked unavailable rather than silently omitted — the seed data should record which sources contributed to each baseline period. When a source is unavailable for a baseline period, the baseline statistics should note the reduced source coverage so the UI can display "Baseline computed from Federal Register + GDELT only (White House archive unavailable for this period)."

### Feedback Learning

6. **The system must never silently change its own methodology.** Every suppression rule proposal, keyword tier change, and threshold adjustment must be explicitly proposed, human-reviewed, and version-controlled. Automated learning proposes; humans decide.

7. **Feedback data can be gamed.** If the review process is open to bad-faith actors, they could systematically downgrade genuine alerts to teach the system to suppress real signals. Reviewer identity should be tracked, and bulk pattern changes from a single reviewer should be flagged.

8. **Suppression rule proposals must be validated against true positives.** Before any proposed rule is approved, it must be tested against the existing true-positive test fixtures to confirm it wouldn't suppress genuine detections. This is automated in the proposal generation pipeline.

9. **Dormant keywords aren't necessarily bad keywords.** A keyword that has never fired may be correctly waiting for an event that hasn't happened yet. The keyword health report should distinguish between "never fires because overly specific" and "hasn't fired yet because the scenario hasn't occurred." The latter should be retained.

10. **Learning is slow and that's fine.** The system should improve its methodology over months, not days. Rapid automated changes to keyword dictionaries or suppression rules risk introducing systematic blind spots. A quarterly review cadence for methodology changes is more appropriate than continuous deployment.

11. **Expert submissions require the same validation as automated proposals.** Domain expertise does not bypass the quality gate. Every expert-submitted keyword must be backtested against historical documents, validated against true-positive fixtures, and reviewed before implementation. Credentials add context for reviewers but do not auto-approve proposals.

### Backfill & Seed Data

12. **Backfill must use the AI Skeptic, not keyword-only assessment.** The `backfill.ts` script currently constructs minimal `EnhancedAssessment` objects with keyword-only results and empty evidence arrays. This must be changed to call `enhancedAssessment()` (the same pipeline used by `snapshot.ts`) so that backfilled data includes per-keyword AI verdicts (`genuine_concern`, `false_positive`, `ambiguous`), recommended status, confidence scores, and structured evidence. The cost is modest (~$2-6 for a full T2 backfill at ~600 AI calls). Without AI review in the backfill, the initial seed data will contain unreviewed false positives that propagate into baseline statistics and UI displays. A `--skip-ai` flag should be available for fast re-scoring runs after keyword tuning.

13. **Human review of backfill data should be AI-assisted, not exhaustive.** Rather than requiring a human to eyeball every keyword match in thousands of documents, the review pipeline should generate a targeted report showing only items where the AI Skeptic flagged disagreements: keywords it assessed as `false_positive` or `ambiguous`, assessments where it recommended a status downgrade, and assessments where its confidence was below 0.7. The human reviews these flagged items and records approve/override decisions. This mirrors the eventual admin review queue workflow but operates via CLI tooling during the initial seed data generation phase.

14. **Seed data is deterministic and version-controlled.** The JSON fixtures in `lib/seed/fixtures/` are committed to the repository. New deployments run `pnpm seed:import` to load them — no API keys or external calls required. This means the fixture data must be curated (reviewed and keyword-tuned) before committing, and any keyword dictionary changes that affect scoring require re-generating and re-committing the fixtures.
