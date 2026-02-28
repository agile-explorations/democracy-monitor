# Democracy Monitor Ã¢â‚¬â€ Specification Addendum (V3)

## Document Purpose

This addendum extends the V3 specification (all phases now complete) with two new capabilities:

1. **Data resilience and source health monitoring** Ã¢â‚¬â€ addressing the systemic risk that authoritarian consolidation degrades the very government data sources this system depends on, making data disappearance itself a critical signal.
2. **Feedback learning loops** Ã¢â‚¬â€ enabling the system to learn from human review decisions and AI disagreements, proposing methodology improvements that humans approve and version-control.

This addendum is sequenced for implementation with Claude Code.

**Note on UI**: This specification identifies where UI components are needed but does not detail their design or implementation. A separate UI specification (in progress) covers all presentation layer work.

---

## Motivation

The entire Democracy Monitor architecture assumes the availability of government data: Federal Register API responses, RSS feeds from GAO/SCOTUS/DoD, White House press releases, and government website uptime. If the system is measuring movement toward authoritarianism, it must account for the possibility that:

1. Government sources publish less data, or less reliably
2. APIs change schemas, degrade response quality, or go offline
3. RSS feeds go silent Ã¢â‚¬â€ not temporarily, but permanently
4. Government websites block scrapers or remove content
5. FOIA compliance declines, reducing the public record

**Missing data is itself a signal Ã¢â‚¬â€ possibly the most important one the system can report.** A week where the pipeline ingests 15 documents instead of the usual 60Ã¢â‚¬â€œ80 is more alarming than any single keyword match, because it's a meta-signal about the integrity of every other assessment.

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

**Priority**: High Ã¢â‚¬â€ should ship before public launch
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

**Prerequisite Ã¢â‚¬â€ sourceId on signals**: Each signal in `lib/data/categories.ts` currently lacks a stable identifier. Add an `id` field to the signal type (e.g., `'federal_register_api'`, `'gao_rss'`, `'scotus_opinions'`). This ID is the `sourceId` used throughout source health tracking. Add IDs to all existing signals before implementing source health.

**Source status definitions**:

- `healthy`: Responded normally, returned expected volume of documents
- `degraded`: Responded but with reduced volume (<50% of expected), high latency (>5s), or partial errors
- `unavailable`: Failed to respond (HTTP error, timeout, DNS failure)
- `silent`: Responded successfully but returned zero new documents for 2+ consecutive checks when documents are expected

**"Silent" is the most insidious state** Ã¢â‚¬â€ the API returns 200 OK but nothing new is being published. This requires comparing against historical volume baselines.

**Cold-start strategy**: The `expectedDocCount` field requires historical data that won't exist on first deploy. Use `expectedMinWeeklyDocs` from canary config (see Configuration Defaults) as the initial baseline. After 4 weeks of data collection, switch to the rolling average. During the cold-start period, only `unavailable` status (HTTP failures) should generate alerts; `silent` and `degraded` require baseline data and should be suppressed until week 5.

**Schema change** Ã¢â‚¬â€ add `source_health` table (SQL shown for documentation; implementation uses Drizzle ORM in `lib/db/schema.ts`):

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

> "Data availability reduced Ã¢â‚¬â€ 3 of 8 sources are unavailable this week. This assessment is based on incomplete data and may not reflect the full picture."
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

- Create: `pages/api/health/sources.ts` Ã¢â‚¬â€ returns `SourceHealthSummary` + per-source history
- Create: `pages/api/health/sources/[sourceId].ts` Ã¢â‚¬â€ returns history for a single source

---

## Phase 11: Alternative Source Integration

**Goal**: Define and implement fallback data sources that are outside government control, activated when primary sources degrade.

### 11.1 Source Priority Framework

**Priority**: Medium Ã¢â‚¬â€ design now, implement incrementally
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
2. Increase polling frequency for Tier 2Ã¢â‚¬â€œ3 sources
3. Display Tier 2Ã¢â‚¬â€œ3 data alongside (not replacing) Tier 1 data, clearly labeled by source tier

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

**Rationale**: FOIA denial rates and FOIA lawsuits are themselves public records (filed in federal court). A spike in FOIA litigation is a measurable proxy for declining transparency Ã¢â‚¬â€ and it's data the executive branch cannot suppress because it's generated by plaintiffs.

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

**UI needed** (see separate UI specification): The meta-assessment should appear at the **top** of the dashboard, above all category assessments. The UI spec should define banner treatments for each `dataIntegrity` level (`high`, `moderate`, `low`, `critical`), with the critical state being the most visually prominent element on the page. Key principle: when data disappears, the system shouldn't quietly show "Stable" Ã¢â‚¬â€ it should loudly announce that it can't see.

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

1. **Insufficient data (routine)**: Few items fetched, sources are healthy Ã¢â€ â€™ current behavior is fine
2. **Insufficient data (suspicious)**: Few items fetched AND sources are degraded/silent Ã¢â€ â€™ escalate

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

**Design constraint**: The system must never silently change its own methodology. Every recommendation is explicit, reviewable, and reversible. The loop is: **system proposes Ã¢â€ â€™ human approves Ã¢â€ â€™ code changes Ã¢â€ â€™ tests run Ã¢â€ â€™ version bumps.**

### 13.1 Feedback Store

**Priority**: High
**Estimated scope**: ~150 lines new

**What exists**: The V3 review queue (`review-queue.ts`) stores human decisions when AI and keywords disagree. The `alerts` table records flagged assessments. But these are write-only Ã¢â‚¬â€ nothing reads them back to improve the system.

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

**Schema change** Ã¢â‚¬â€ add `feedback` table (SQL shown for documentation; implementation uses Drizzle ORM in `lib/db/schema.ts`):

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

**Priority**: High Ã¢â‚¬â€ highest-ROI form of learning
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

  // Origin â€” which subsystem generated this proposal
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
2. For each false-positive keyword, look up the source documents via `feedback.documentIds` Ã¢â€ â€™ `documents` table (joined by ID). If `documentIds` is empty, fall back to querying documents by `category + weekOf` from the `documents` table.
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

This closes the loop: false positive Ã¢â€ â€™ feedback Ã¢â€ â€™ proposal Ã¢â€ â€™ approval Ã¢â€ â€™ suppression rule Ã¢â€ â€™ regression test. The existing `document-scorer.test.ts` iterates `FALSE_POSITIVE_CASES` dynamically, so new entries are automatically tested.

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

**API endpoint**: `GET /api/methodology/keyword-health` Ã¢â‚¬â€ returns the report. Useful for OSS contributors evaluating dictionary quality.

**UI needed** (see separate UI specification): A methodology health page showing noisy keywords, dormant keywords, and tier change recommendations. This is an internal/contributor-facing tool, not a public dashboard element.

**Files touched**:

- Create: `lib/services/keyword-health-service.ts`
- Create: `pages/api/methodology/keyword-health.ts`

### 13.4 AI Prompt Learning Corpus

**Priority**: Medium-low
**Estimated scope**: ~80 lines new

**Rationale**: When a human reviewer disagrees with _both_ the keyword engine and the AI, that's the most valuable signal Ã¢â‚¬â€ neither automated layer got it right. Accumulating these cases creates a corpus for periodic AI prompt refinement.

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

**Usage pattern**: This is not automated Ã¢â‚¬â€ it's a quarterly review tool. Run `generatePromptImprovementReport()` with accumulated cases, review the AI's analysis of its own failures, and manually update the assessment prompt in `lib/ai/prompts/assessment.ts`.

**Files touched**:

- Create: `lib/services/prompt-learning-service.ts`
- Create: `pages/api/methodology/prompt-learning.ts`

### 13.5 Novel Threat Detection

**Priority**: Medium
**Estimated scope**: ~200 lines new

**Rationale**: Sections 13.1â€“13.4 address known-unknown problems: the system fired on something it shouldn't have, or a human corrected an assessment. But the deepest blind spot is unknown-unknowns â€” threats the keyword dictionaries were never designed to detect. If the administration adopts a novel strategy (e.g., "nationalizing federal elections"), no existing keyword will catch it, no false positive will flag it, and no human reviewer will see it â€” because there's nothing to review.

Two mechanisms address this, working in concert.

**Prerequisite â€” Baseline centroids**: `embedding-service.ts` has `computeCentroid()` and `cosineSimilarity()`, but no baseline centroids are persisted per category. Before novelty detection can work, implement: (a) a `category_baselines` table (or column in existing schema) storing centroid vectors and noise floors per category per baseline period, and (b) a one-time baseline computation job that processes existing document embeddings to establish centroids. This is a prerequisite item within the novelty detection sprint.

**Mechanism A â€” Semantic Novelty Detection**:

The system computes per-category embedding centroids via `computeCentroid()` in `embedding-service.ts`. Extend this to persist baseline centroids and identify _which specific documents_ are driving drift â€” the documents farthest from the baseline centroid that also scored zero on keywords.

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
  keywordScore: number; // should be 0 or very low â€” that's the point

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
4. Surface documents where `normalizedNovelty >= MIN_NOVELTY_MULTIPLE` (default 2.0 â€” more than 2Ã— normal variation from baseline, yet invisible to keywords). Store `MIN_NOVELTY_MULTIPLE` in `lib/methodology/scoring-config.ts` alongside other thresholds.
5. These are the documents most likely to represent novel threat patterns

**Mechanism B â€” AI Document Triage**:

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

**Integration with snapshot.ts**: Run novelty detection weekly as part of the snapshot cycle, after document scoring and embedding. Only runs for categories where semantic drift exceeds `NOVELTY_DRIFT_TRIGGER` (default 1.5Ã— noise floor, stored in `scoring-config.ts`) â€” no point scanning for novel documents when the language hasn't changed.

**Files touched**:

- Create: `lib/services/novelty-detector.ts`
- Create: `lib/ai/prompts/novelty-triage.ts`
- Modify: `lib/cron/snapshot.ts` (run novelty detection when drift is elevated)
- Create: `pages/api/methodology/novelty.ts`

### 13.6 Rhetoric-to-Keyword Pipeline

**Priority**: Medium
**Estimated scope**: ~150 lines new

**Rationale**: The rhetoric tracking system (V3 Phase 6) already detects emerging language patterns in White House briefings, GDELT media coverage, and other rhetoric sources. When a new phrase appears frequently in rhetoric but has no corresponding action keyword, that's a gap the system can identify proactively â€” before any government action documents appear.

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

1. Scan the `intentStatements` table for rhetoric-type statements from the past 4â€“8 weeks
2. Extract high-frequency phrases and check against two dictionaries:
   - `ACTION_KEYWORDS` in `lib/data/intent-keywords.ts` (keyed by PolicyArea â€” 5 areas)
   - Category keywords in `lib/data/assessment-rules.ts` (keyed by dashboard category â€” 11 categories)
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

**Cadence**: Run weekly alongside the snapshot cycle, or monthly as a separate cron job. The pipeline should be lightweight â€” it's primarily string matching and frequency counting against existing data.

**Files touched**:

- Create: `lib/services/rhetoric-keyword-pipeline.ts`
- Modify: `lib/cron/generate-proposals.ts` (add rhetoric gap detection to proposal generation)
- Create: `pages/api/methodology/rhetoric-gaps.ts`

### 13.7 Expert Keyword Contribution API

**Priority**: Medium â€” should ship before broader public launch
**Estimated scope**: ~200 lines new

**Rationale**: The feedback loop now has four automated proposal sources: suppression learning (13.2), novelty detection (13.5), rhetoric pipeline (13.6), and keyword health recommendations (13.3). But the people most likely to spot keyword deficiencies â€” constitutional lawyers, political scientists, journalists covering democratic erosion â€” are the least likely to engage through a code contribution workflow. There is no structured way for a domain expert to say "you should be tracking X" without submitting a GitHub pull request.

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
  reasoning: string; // required â€” minimum 50 characters
  evidenceUrls?: string[]; // links to documents, articles, court filings
  relatedDocumentIds?: number[]; // if referencing documents already in the system

  // Batch context
  batchLabel?: string; // e.g., "Election federalization keywords" â€” groups related submissions
  batchSize: number; // number of keywords in this submission

  // Status â€” derived from linked SuppressionProposal records, not independently managed
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
   - Would it have fired on any documents in the past 4 weeks? (backtest and include results with the proposal). **Note**: Backtesting is best-effort â€” if the `documents` table has <4 weeks of data, return `backtestCoverage: 'N of 4 weeks available'` rather than silently returning zero matches.
3. Each keyword creates a `SuppressionProposal` record (from 13.2) tagged with `proposalSource: 'expert_submission'` and linked back to the submission ID via `sourceSubmissionId`
4. If the submission contains multiple keywords with a `batchLabel`, the review queue displays them as a coherent set rather than isolated proposals
5. Human reviewer approves/rejects through the same pipeline â€” approved keywords get regression tests auto-generated
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
- Optional but tracked: `submitterIdentity` is an honor-system text field initially. **Future enhancement**: GitHub OAuth for identity verification (the project has no authentication layer yet â€” adding OAuth is a separate effort). Authenticated submissions would be prioritized in the review queue.
- Bulk pattern detection: if a single submitter or IP submits 100+ keywords in a week, flag for review before processing

**Schema change** â€” add `expert_submissions` table (SQL shown for documentation; implementation uses Drizzle ORM in `lib/db/schema.ts`):

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

## Phase 14: `indices` Category Rename and External Indices Cross-Reference

**Goal**: Resolve the naming confusion around the `indices` category, preserve its legitimate executive power volume tracking under a proper key, and build the external democracy indices cross-reference that the key name originally implied but was never implemented.

### 14.1 Problem Statement

The codebase has a category with key `indices`, title "Executive Power Volume," that tracks the pace and volume of presidential actions and regulations through Federal Register keyword scanning. Despite its key name suggesting external democracy measurement indices (V-Dem, Freedom House, Bright Line Watch), the category has nothing to do with external indices — it monitors executive action volume, which is a legitimate and distinct concern.

This creates three problems:

1. **The key is misleading.** Anyone reading the code or spec assumes `indices` refers to external democracy indices. It doesn't.
2. **External indices integration was never built.** V3 Sprint 6+ item 25 ("External validation index integration") was marked DONE, but what was built was executive power volume tracking under a confusing name — not actual integration of V-Dem, Freedom House, or Bright Line Watch data.
3. **Executive power volume overlaps with but is distinct from `rulemaking`.** The `rulemaking` category (key: `rulemaking`, title: "Independent Agency Rules") tracks whether the president can control independent agency rulemaking. Executive power volume tracks the overall pace of presidential actions. These are related but measure different things — agency capture vs. action tempo.

### 14.2 Rename `indices` to `executiveActions`

**Priority**: High — should happen before or during baseline calibration
**Estimated scope**: ~50 lines modified (rename across codebase)

Rename the category throughout the codebase:

- **Key**: `indices` → `executiveActions`
- **Title**: "Executive Power Volume" → "Executive Action Volume" (minor clarification)
- **Description**: Review and update to clearly describe what this category measures: pace and volume of executive orders, presidential memoranda, proclamations, and other unilateral executive actions

**Files to modify**:

- `lib/data/categories.ts` (category key and metadata)
- `lib/data/assessment-rules.ts` (keyword dictionary key)
- `lib/db/schema.ts` (any hardcoded category references)
- Database migration: update existing `category` column values in `document_scores`, `weekly_aggregates`, `source_health`, and any other tables that store category as a string
- `lib/data/suppression-rules.ts` (if any rules reference `indices`)
- Any test fixtures referencing `indices`
- UI components referencing `indices`

**Migration**:

```sql
-- Rename category in all tables that store it
UPDATE document_scores SET category = 'executiveActions' WHERE category = 'indices';
UPDATE weekly_aggregates SET category = 'executiveActions' WHERE category = 'indices';
UPDATE source_health SET category = 'executiveActions' WHERE category = 'indices';
UPDATE feedback SET category = 'executiveActions' WHERE category = 'indices';
-- ... repeat for any other tables with category columns
```

### 14.3 Clarify Category Boundaries

After the rename, the "Executive Power" group in the UI has two clearly distinct categories:

| Category                 | Key                | What It Measures                                        | Example Signals                                                      |
| ------------------------ | ------------------ | ------------------------------------------------------- | -------------------------------------------------------------------- |
| Executive Action Volume  | `executiveActions` | Pace and volume of presidential actions                 | Executive order frequency, midnight regulations, proclamation surges |
| Independent Agency Rules | `rulemaking`       | Presidential control over independent agency rulemaking | Agency rule reversals, deference changes, regulatory capture         |

These should remain separate. A president can issue many executive orders (high `executiveActions` scores) without interfering with independent agencies (low `rulemaking` scores), and vice versa. Collapsing them would lose signal.

### 14.4 Baseline Review Implications

The Biden 2022 baseline review items previously flagged under `indices` (e.g., Colombia NATO ally designation, Uvalde proclamation) should be **re-evaluated** with the corrected understanding. These are presidential actions — they may be exactly what the `executiveActions` category is designed to detect. A proclamation is a presidential action regardless of its content. The question is whether the keyword dictionaries for this category are well-calibrated to distinguish between routine presidential actions (proclamations, designations) and actions that signal executive power consolidation (emergency declarations used to bypass Congress, mass executive orders reversing prior policy).

During baseline calibration:

- Routine presidential actions (designations, commemorations, proclamations) should be **warning** tier at most, with suppression rules for purely ceremonial actions
- Executive power consolidation signals (executive order volume spikes, emergency authority invocations, unilateral policy changes) should be **drift** or **capture** tier

### 14.5 External Democracy Indices as Cross-Reference Layer

**Priority**: Medium — valuable for credibility but not blocking for launch
**Estimated scope**: ~200 lines new

**Rationale**: External democracy indices (V-Dem, Freedom House, Bright Line Watch, Economist Democracy Index) provide methodologically independent assessments of democratic health through expert surveys. Displaying them alongside the system's automated documentary analysis serves as corroboration when they agree and transparent disclosure when they diverge.

This is a new capability, not a replacement for anything that currently exists. It should function as an independent validation layer, similar in concept to the infrastructure convergence overlay — a cross-cutting view that enriches the primary analysis.

**Data sources and cadence**:

| Index                              | Publisher                   | Cadence                 | Data Availability                            |
| ---------------------------------- | --------------------------- | ----------------------- | -------------------------------------------- |
| V-Dem                              | University of Gothenburg    | Annual (March/April)    | Free dataset download, country-level scores  |
| Freedom House                      | Freedom House               | Annual (February/March) | Free, "Freedom in the World" country scores  |
| Bright Line Watch                  | Academic consortium         | Quarterly               | Survey results published on website          |
| Economist Democracy Index          | Economist Intelligence Unit | Annual (February)       | Summary scores public, full report paywalled |
| Century Foundation Democracy Meter | Century Foundation          | Infrequent              | 23 subquestion scores                        |

**What to build**:

Create `lib/services/external-indices-service.ts`:

```typescript
export interface ExternalIndexScore {
  indexId: string; // 'vdem', 'freedom_house', 'bright_line', 'eiu', 'century'
  indexName: string;
  publisher: string;
  reportYear: number; // the year the report covers (not publication date)
  publishedAt: string; // when the report was published

  // Scores
  overallScore?: number; // normalized 0-100 where available
  categoryScores?: Array<{
    category: string; // the index's own category name
    score: number;
    mappedCategory?: string; // our category this maps to, if applicable
  }>;

  // Context
  yearOverYearChange?: number; // delta from prior year
  direction: 'improving' | 'stable' | 'declining' | 'unknown';
  narrative?: string; // summary of key findings for the US
  sourceUrl: string;

  importedAt: string;
}

export async function getLatestScores(): Promise<ExternalIndexScore[]>;

export async function getScoreHistory(
  indexId: string,
  options?: { from?: number; to?: number }, // report years
): Promise<ExternalIndexScore[]>;

export async function importIndexScore(
  score: Omit<ExternalIndexScore, 'importedAt'>,
): Promise<void>;
```

**Schema change** — add `external_indices` table:

```sql
CREATE TABLE external_indices (
  id SERIAL PRIMARY KEY,
  index_id VARCHAR(50) NOT NULL,
  index_name VARCHAR(255) NOT NULL,
  publisher VARCHAR(255) NOT NULL,
  report_year INTEGER NOT NULL,
  published_at DATE,
  overall_score REAL,
  category_scores JSONB,
  year_over_year_change REAL,
  direction VARCHAR(20),
  narrative TEXT,
  source_url TEXT NOT NULL,
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(index_id, report_year)
);
```

**Data import**: External index scores are imported manually via CLI when new reports are published. This is a low-frequency operation (a few times per year):

```
pnpm import-index --index=vdem --year=2025 --score=72.3 --direction=declining --url=https://...
```

**Category mapping**: Where possible, map external index subcategories to the system's categories:

| External Subcategory       | Source Index      | Maps To        |
| -------------------------- | ----------------- | -------------- |
| Judicial independence      | V-Dem             | `courts`       |
| Freedom of expression      | Freedom House     | `mediaFreedom` |
| Checks on executive power  | Bright Line Watch | `rulemaking`   |
| Civil service independence | V-Dem             | `civilService` |
| Electoral integrity        | Freedom House     | `elections`    |

These mappings are approximate and should be labeled as such. They enable per-category corroboration: "Our `courts` category shows elevated risk. V-Dem's judicial independence indicator also declined in their most recent report."

**Baseline data**: Import relevant scores for the 2022 reporting period from each index. This provides the cross-reference baseline: "During the Biden 2022 baseline period, V-Dem scored the US at X, Freedom House at Y."

**UI needed** (see separate UI specification): External indices comparison panel, distinct from standard category cards. Displays sparse periodic data (annual/quarterly) alongside continuous weekly system data, with narrative context and per-category corroboration. The framing: "Democracy Monitor analyzes the documentary record. These independent indices assess democratic health through expert surveys. Here's how they compare."

**Files touched**:

- Create: `lib/services/external-indices-service.ts`
- Create: `lib/data/index-category-mappings.ts`
- Modify: `lib/db/schema.ts` (add `externalIndices` table)
- Create: `drizzle/NNNN_external_indices.sql`
- Create: `scripts/import-index.ts` (CLI import tool)
- Create: `pages/api/indices.ts` (read-only API for external index scores)

---

## Phase 15: Presidential Cycle-Aware Baselines

**Goal**: Account for systematic document volume and severity patterns that vary by year-in-presidential-cycle (Year 1 transition surge, Year 2 steady state, Year 3 peak regulatory, Year 4 lame duck/midnight regulations), so the system doesn't generate false signals from predictable cyclical dynamics.

### 15.1 Problem Statement

Presidential terms produce systematically different document patterns depending on the year within the cycle:

- **Year 1**: Executive order surges, agency leadership turnover, day-one policy reversals. Categories most affected: `executiveActions`, `civilService`, `rulemaking`.
- **Year 2 (midterm)**: Agencies settled in, steady-state regulatory output, some election-related activity. The most representative "normal governance" year.
- **Year 3**: Peak regulatory activity — agencies at full operational capacity.
- **Year 4**: "Midnight regulations" if lame duck, reduced activity during reelection campaign, possible pardon surges.

The primary baseline is Biden 2022 (Year 2, midterm). Comparing Trump 2025 (Year 1) against a Year 2 baseline will overstate deviations in categories where Year 1 is inherently noisier. This is not a false positive in the keyword sense (the documents are scored correctly), but a false signal in the comparison — the deviation reflects cycle position, not democratic erosion.

### 15.2 Design Approach: Cycle-Position Annotations, Not Separate Baselines

Building four separate year-position baselines per administration would require 12+ baseline periods with only 52 weeks of data each, resulting in statistically thin reference points. Instead, the system keeps Biden 2022 as the primary baseline and computes **cycle-position adjustment factors** from empirical data.

**What this means in practice**:

1. The `baselines` table stores metadata about each baseline's cycle position
2. The system computes per-category ratios between same-administration years at different cycle positions (Biden 2021 / Biden 2022, Biden 2023 / Biden 2022, etc.)
3. When comparing the current period against the primary baseline, and the cycle positions don't match, the UI displays a cycle-position annotation
4. Volume thresholds in `assessByVolume()` are adjusted by the cycle-position ratio rather than using fixed constants

**What this does NOT do**: The system does not automatically correct or normalize scores. It annotates the comparison and adjusts volume thresholds. The raw severity comparison against the primary baseline is always displayed — the cycle annotation provides context, not a correction. The user sees both.

### 15.3 Schema Changes

Extend the `baselines` table to include cycle-position metadata:

```sql
-- Add cycle-position metadata to baselines table
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS cycle_year INTEGER;
  -- 1, 2, 3, or 4 (year within presidential term)
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS administration VARCHAR(50);
  -- e.g., 'biden', 'obama', 'trump_2'
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS calendar_year INTEGER;
  -- e.g., 2022
```

Create a `cycle_adjustment_factors` table:

```sql
CREATE TABLE IF NOT EXISTS cycle_adjustment_factors (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  cycle_year INTEGER NOT NULL,           -- 1, 2, 3, or 4
  reference_cycle_year INTEGER NOT NULL, -- the primary baseline's cycle year (2 for Biden 2022)

  -- Ratios: cycle_year metrics / reference_cycle_year metrics
  severity_ratio REAL NOT NULL,          -- avg severity in Year N / avg severity in Year 2
  volume_ratio REAL NOT NULL,            -- avg doc count in Year N / avg doc count in Year 2
  severity_stddev_ratio REAL,            -- stddev in Year N / stddev in Year 2

  -- Source data
  source_baselines JSONB NOT NULL,       -- which baseline_ids contributed to this ratio
  sample_size INTEGER NOT NULL,          -- how many administrations contributed (1 or 2)
  confidence VARCHAR(20) NOT NULL,       -- 'low' (N=1), 'moderate' (N=2), 'high' (N=3+)

  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CONSTRAINT uq_cycle_adj_category_years UNIQUE (category, cycle_year, reference_cycle_year)
);
```

### 15.4 Cycle Adjustment Factor Computation

Create `lib/services/cycle-adjustment-service.ts`:

```typescript
export interface CycleAdjustmentFactor {
  category: string;
  cycleYear: number; // the year being adjusted for
  referenceCycleYear: number; // the primary baseline's cycle year

  severityRatio: number; // e.g., 2.1 means Year 1 has 2.1× the severity of Year 2
  volumeRatio: number; // e.g., 1.8 means Year 1 has 1.8× the document volume
  severityStddevRatio: number | null;

  sourceBaselines: string[]; // e.g., ['biden_2021', 'obama_2013']
  sampleSize: number;
  confidence: 'low' | 'moderate' | 'high';
}

export async function computeCycleAdjustmentFactors(
  primaryBaselineId: string, // e.g., 'biden_2022'
  primaryCycleYear: number, // e.g., 2
  comparisonBaselines: Array<{
    baselineId: string; // e.g., 'biden_2021'
    cycleYear: number; // e.g., 1
  }>,
): Promise<CycleAdjustmentFactor[]>;

export async function getCycleAdjustment(
  category: string,
  currentCycleYear: number,
  primaryBaselineCycleYear: number,
): Promise<CycleAdjustmentFactor | null>;

// Pre-load all factors for a given cycle year pair — used by snapshot.ts
// to avoid per-category DB calls during assessment runs
export async function loadCycleAdjustmentFactors(
  currentCycleYear: number,
  primaryBaselineCycleYear: number,
): Promise<Map<string, CycleAdjustmentFactor>>;
```

**How `computeCycleAdjustmentFactors()` works**:

1. Load weekly aggregates for the primary baseline period (Biden 2022) and each comparison baseline (Biden 2021, Obama 2013, etc.)
2. For each category, compute the ratio: comparison baseline avg severity / primary baseline avg severity
3. Do the same for document volume and severity standard deviation
4. If multiple baselines share the same cycle year (e.g., Biden 2021 and Obama 2013 are both Year 1), average their ratios and set `sampleSize = 2`, `confidence = 'moderate'`
5. Store the factors in `cycle_adjustment_factors`

**Example output** for `executiveActions`, Year 1 vs. Year 2:

```
{
  category: 'executiveActions',
  cycleYear: 1,
  referenceCycleYear: 2,
  severityRatio: 2.1,        // Year 1 has 2.1× the severity of Year 2
  volumeRatio: 1.8,          // Year 1 has 1.8× the document volume
  sourceBaselines: ['biden_2021', 'obama_2013'],
  sampleSize: 2,
  confidence: 'moderate'
}
```

### 15.5 Integration with Volume Assessment

The current `assessByVolume()` uses hardcoded volume thresholds to determine when document count alone triggers a status change. These thresholds should become cycle-relative.

**Current behavior** (simplified):

```typescript
// Hardcoded: if doc count exceeds threshold, flag as elevated
if (documentCount > VOLUME_THRESHOLD) {
  status = 'Drift';
}
```

**Cycle-aware behavior**:

```typescript
// Pre-load all adjustment factors once per assessment run (not per category)
const cycleFactors = await loadCycleAdjustmentFactors(currentCycleYear, primaryBaselineCycleYear);
// Returns Map<category, CycleAdjustmentFactor>

// Then in assessByVolume() — no async call, just a map lookup
const adjustment = cycleFactors.get(category);
const adjustedThreshold = adjustment ? VOLUME_THRESHOLD * adjustment.volumeRatio : VOLUME_THRESHOLD;

if (documentCount > adjustedThreshold) {
  status = 'Drift';
}
```

**Implementation note**: `assessByVolume()` is currently synchronous. Rather than making it async (which would ripple through all callers), pre-load all cycle adjustment factors at the start of each assessment run in `snapshot.ts` and pass them as a `Map<string, CycleAdjustmentFactor>` parameter. This avoids N database calls per snapshot (one per category) and keeps the assessment function signatures clean.

This means: if Year 1 typically has 1.8× the document volume of Year 2, the volume threshold for triggering Drift during Year 1 is 1.8× higher. The system expects more documents during a transition year and doesn't flag the volume increase itself as concerning.

**Important**: This adjustment applies only to volume-based assessment, not to keyword severity scoring. If a document matches capture-tier keywords, it scores the same regardless of cycle year. The cycle adjustment prevents _volume alone_ from generating false signals — it doesn't suppress keyword-driven severity.

### 15.6 UI Annotations

When the current period's cycle year doesn't match the primary baseline's cycle year, the UI displays an annotation on category detail pages and comparison panels.

**On the trend chart (category detail page)**:

```
⊘ Cycle context: Comparing Year 1 (transition) against a Year 2 (midterm)
  baseline. First years typically show 1.8× document volume and 2.1× severity
  in this category. Based on Biden 2021 and Obama 2013 data (N=2).
```

**On the category card (landing page)**, in Detailed mode only:

```
  Current: 12.4    Baseline avg: 3.2
  (3.9× baseline · cycle-adjusted: 1.9×)
```

The raw comparison (3.9×) is always shown. The cycle-adjusted comparison (1.9×) is shown alongside it in parentheses as additional context, not as a replacement. The adjustment is transparent: the user can see both numbers and the basis for the adjustment.

**When adjustment confidence is low** (N=1, only one comparison administration available):

```
⊘ Cycle context: Comparing Year 1 against a Year 2 baseline. Limited data
  (Biden 2021 only) suggests first years show ~2.1× severity in this category.
  Treat this adjustment with caution.
```

### 15.7 What the System Does NOT Do

1. **Does not automatically select a year-matched baseline as primary.** The primary baseline remains Biden 2022 (steady-state governance). Year-matched baselines (Biden 2021, Obama 2013) are comparison references, not replacements.
2. **Does not normalize or correct displayed scores.** The cycle-adjusted ratio is shown alongside the raw ratio, not instead of it. Users see the unadjusted comparison and the cycle context together.
3. **Does not apply cycle adjustments to keyword severity scoring.** A capture-tier keyword match produces the same severity score in Year 1 and Year 2. Only volume thresholds are adjusted.
4. **Does not require all four cycle years to function.** If only Year 1 and Year 2 data are available (Biden 2021 and Biden 2022), the system computes adjustment factors for Year 1 only. Year 3 and Year 4 comparisons display: "No cycle adjustment data available for Year 3."

**Files touched**:

- Modify: `lib/db/schema.ts` (extend `baselines` table, add `cycleAdjustmentFactors` table)
- Create: `drizzle/NNNN_cycle_adjustment.sql`
- Create: `lib/services/cycle-adjustment-service.ts`
- Modify: `lib/services/assessment-service.ts` (cycle-aware volume thresholds in `assessByVolume()`)
- Modify: `lib/methodology/scoring-config.ts` (cycle year computation function, inauguration date constant)

**Note on cycle year computation**: The current cycle year must be computed from the current date and the inauguration cycle (January 20 every four years), not stored as a manually-edited constant. Add a `getCurrentCycleYear(date?: Date): number` function to `scoring-config.ts` that calculates the year-in-term (1–4) from the inauguration schedule. Example: any date from Jan 20 2025 to Jan 19 2026 returns `1`; Jan 20 2026 to Jan 19 2027 returns `2`.

---

## Implementation Sequence

Each sprint targets 250-350 lines of new/modified code, following the project's established sprint process (analysis -> propose -> approve -> implement -> review -> commit).

### Sprint A (Source Health â€” Schema & Tracker)

1. Add `id` field to Signal type and all signals in `lib/data/categories.ts`
2. Add `health` config (canary flags, expected frequency, min weekly docs) to key signals
3. **10.1** Source health service â€” `checkSourceHealth()`, status classification logic
4. `source_health` Drizzle schema + migration
5. `fetchCategoryFeedsWithMetadata()` wrapper in `lib/services/feed-fetcher-metadata.ts`

**Deliverable**: Source health checks run and persist. Each signal has a stable ID and optional health config. Feed fetching captures metadata without breaking existing callers.

### Sprint B (Source Health â€” Integration & Confidence)

1. Integrate source health into `snapshot.ts` (call wrapper, store health checks)
2. **10.2** Confidence degradation â€” extend `calculateDataCoverage()` with source health factor
3. Add `CRITICAL_CONFIDENCE_CAP` to `lib/methodology/scoring-config.ts`
4. Pass source health into `ai-assessment-service.ts`
5. Cold-start logic: suppress silent/degraded alerts during first 4 weeks

**Deliverable**: Every snapshot run records source health. Assessments automatically degrade confidence when sources are unavailable. Cold-start period handled gracefully.

### Sprint C (Meta-Assessment & Absence-Aware Logic)

1. **12.1** Meta-assessment service â€” `computeMetaAssessment()`, transparency trend computation
2. **12.2** Absence-aware assessment logic in `assessment-service.ts`
3. Store meta-assessment in snapshot cycle
4. **10.3** Source health API endpoints (`/api/health/sources`, `/api/health/sources/[sourceId]`)
5. Meta-assessment API endpoint (`/api/health/meta`)

**UI needed** (see separate UI specification): Source health panel, data integrity banner, historical availability chart.

**Deliverable**: Meta-assessment computed every snapshot. APIs serve source health and meta-assessment data. Absence of data in degraded-source context triggers appropriate warnings.

### Sprint D (Feedback Store & Review Integration)

1. **13.1** Feedback store â€” `feedback` Drizzle schema + migration
2. `feedback-store.ts` â€” `recordFeedback()`, `getUnprocessedFeedback()`, `markProcessed()`
3. Extend `resolveReview()` signature to accept optional feedback fields
4. Update `pages/api/reviews.ts` to accept feedback in request body
5. Auto-create `FeedbackRecord` from review decisions

**Prerequisite**: `pages/api/reviews.ts` must exist (V3 Phase 3.2). If not yet implemented, create a minimal version.

**Deliverable**: Human review decisions are captured as structured feedback with false-positive keywords, missing keywords, and tier change suggestions.

### Sprint E (Suppression Learning & Keyword Health)

1. **13.2** Suppression rule learner â€” `generateSuppressionProposals()`
2. Proposal validation against true-positive test fixtures
3. Auto-append approved proposals to `__tests__/fixtures/scoring/false-positives.ts`
4. `suppression_proposals` Drizzle schema + migration (include `proposal_source` and `source_submission_id` columns)
5. **13.3** Keyword health report service â€” `generateKeywordHealthReport()`

**Deliverable**: System generates suppression rule proposals from feedback. Approved proposals auto-generate regression tests. Keyword health reports identify noisy/dormant keywords.

### Sprint F (Novel Threat Detection)

1. **13.5** Baseline centroid computation and storage â€” `category_baselines` table, one-time computation job
2. Novelty detector â€” `detectNovelDocuments()`, `detectNovelDocumentsAllCategories()`
3. AI triage prompt â€” `lib/ai/prompts/novelty-triage.ts`
4. Add `MIN_NOVELTY_MULTIPLE` and `NOVELTY_DRIFT_TRIGGER` to `scoring-config.ts`
5. Integration with `snapshot.ts` (run novelty detection when drift is elevated)

**Deliverable**: Semantically novel documents that evade keyword detection are surfaced for review. Baseline centroids are persisted per category. AI triage proposes keywords for novel threats.

### Sprint G (Feedback APIs, Prompt Learning & Rhetoric Pipeline)

1. **13.4** AI prompt learning corpus â€” `extractLearningCases()`, `generatePromptImprovementReport()`
2. Proposal review API (`/api/proposals`) â€” list, approve, reject
3. Keyword health API (`/api/methodology/keyword-health`)
4. Prompt learning API (`/api/methodology/prompt-learning`)
5. Cron job: `generate-proposals.ts` (weekly/monthly)
6. **13.6** Rhetoric-to-keyword pipeline â€” `rhetoric-keyword-pipeline.ts`

**UI needed** (see separate UI specification): Proposal review interface, keyword health dashboard.

**Deliverable**: APIs serve all feedback learning data. Rhetoric patterns proactively generate keyword proposals for emerging threats. Contributors can review system-generated methodology proposals.

### Sprint H (Expert Keyword Contribution)

1. **13.7** Expert submission service â€” `expert-submission-service.ts`
2. `expert_submissions` Drizzle schema + migration
3. Backtest engine for submitted keywords (best-effort, reports coverage gaps)
4. Inbound rate limiting middleware for public endpoint
5. API endpoint: `POST /api/methodology/submit-keywords`

**UI needed** (see separate UI specification): Public-facing keyword submission form.

**Deliverable**: Domain experts can submit keyword proposals through a structured API. Submissions are backtested, rate-limited, and routed through the same proposal review pipeline as automated proposals.

### Sprint I (Alternative Sources â€” Research & Framework)

**Note**: This is a research spike. Phase 11 depends on external APIs (CourtListener, state AG feeds) whose availability, rate limits, and data quality must be validated before committing to implementation.

1. **Research**: Evaluate CourtListener API â€” authentication, rate limits, data coverage, response format
2. **Research**: Survey state AG RSS feeds â€” availability, update frequency, content quality
3. **Research**: Assess FOIA litigation data availability via CourtListener
4. **11.1** Source priority framework â€” `lib/data/source-tiers.ts` (configuration only)
5. Write parsers/service stubs based on research findings

**Deliverable**: Documented assessment of external API feasibility. Source tier configuration defined. Stubs ready for implementation.

### Sprint J (Alternative Sources â€” Implementation)

1. **11.2** Court filing integration (CourtListener) â€” `court-filing-service.ts` + parser
2. **11.4** FOIA litigation tracking (filtered CourtListener query)
3. **11.3** State AG tracker (if research validates feasibility)
4. Add alternative source signals to relevant categories in `categories.ts`
5. Expand GDELT integration for international press coverage (if not complete)

**Deliverable**: System has fallback data sources outside government control. Court filings and FOIA litigation supplement government publications.

### Sprint K (Category Rename & External Indices)

1. **14.2** Rename `indices` to `executiveActions` — category key, assessment rules, database migration, test fixtures, UI references
2. **14.4** Re-evaluate baseline review items for `executiveActions` with corrected understanding
3. **14.5** External indices service — `external-indices-service.ts`, `index-category-mappings.ts`
4. `external_indices` Drizzle schema + migration
5. CLI import tool — `scripts/import-index.ts`
6. Import baseline data: V-Dem 2022, Freedom House 2023 (covers 2022), Bright Line Watch 2022 surveys, EIU 2022
7. Read-only API endpoint: `GET /api/indices`

**Note**: Step 1 (rename) should happen early, ideally before or during baseline calibration, so that all baseline data is stored under the correct category key. Steps 3–7 can follow later.

**UI needed** (see separate UI specification): External indices comparison panel, distinct from standard category cards. Displays sparse periodic data alongside continuous weekly system data, with narrative context and per-category corroboration where index subcategories map to system categories.

**Deliverable**: `indices` renamed to `executiveActions` throughout the codebase and database. External democracy indices imported as periodic cross-reference data. System has 11 keyword-scored categories (with a correctly named executive actions category) plus external indices as a separate validation layer.

### Sprint L (Cycle-Aware Baselines)

**Prerequisite**: At least two baselines at different cycle positions must be computed (e.g., Biden 2022 as Year 2 primary, Biden 2021 as Year 1 comparison).

**Migration timing**: The schema changes in step 1 (adding `cycle_year`, `administration`, `calendar_year` to `baselines`) should ideally land in the sprint that creates the Biden 2021 and Obama 2013 baselines, so those baselines are created with cycle metadata from the start. If that sprint has already completed without the columns, Sprint L must include a backfill UPDATE for all existing baseline rows:

```sql
UPDATE baselines SET cycle_year = 2, administration = 'biden', calendar_year = 2022
  WHERE baseline_id = 'biden_2022';
UPDATE baselines SET cycle_year = 1, administration = 'biden', calendar_year = 2021
  WHERE baseline_id = 'biden_2021';
UPDATE baselines SET cycle_year = 1, administration = 'obama', calendar_year = 2013
  WHERE baseline_id = 'obama_2013';
```

1. **15.3** Schema changes — extend `baselines` table with `cycle_year`, `administration`, `calendar_year` columns; create `cycle_adjustment_factors` table; backfill existing baselines
2. **15.4** Cycle adjustment service — `cycle-adjustment-service.ts`, `computeCycleAdjustmentFactors()`, `loadCycleAdjustmentFactors()`
3. Compute initial adjustment factors from Biden 2021 / Biden 2022 ratios per category
4. **15.5** Integrate cycle-aware volume thresholds into `assessByVolume()` in `assessment-service.ts` (pre-loaded factors passed as parameter, no async signature change)
5. Add `getCurrentCycleYear()` to `scoring-config.ts` (computed from inauguration dates)

**Note**: This sprint does not touch the UI — cycle annotations (§15.6) should be implemented in the UI specification's Phase 2, item 14 (trend chart with baseline band) for the category detail annotation, and Phase 1, item 2 (CategoryCard component) for the cycle-adjusted ratio on landing page cards in Detailed mode.

**Deliverable**: Volume thresholds are cycle-relative. Year 1 periods are not falsely flagged for volume increases that are predictable transition dynamics. Adjustment factors are stored with sample size and confidence, making the basis for the adjustment transparent and auditable.

---

## Configuration Defaults

Canary source configuration lives inline on signals in `lib/data/categories.ts` (see 10.1 above). The values below are reference defaults:

| Source               | `maxSilentDays`   | `expectedMinWeeklyDocs` | Notes                        |
| -------------------- | ----------------- | ----------------------- | ---------------------------- |
| Federal Register API | 3 (business days) | 20                      | Publishes every business day |
| GAO Reports RSS      | 14                | 2                       | Weekly publication cadence   |
| SCOTUS Opinions RSS  | 14                | 0                       | Varies by term schedule      |

Health thresholds and confidence caps live in `lib/methodology/scoring-config.ts` (per project convention Ã¢â‚¬â€ all scoring constants in one place):

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

1. **Missing data Ã¢â€°Â  "Stable".** The system must never show "Stable" simply because it received no documents and therefore had no keyword matches. Absence of data in a context of source degradation is a warning, not a reassurance.

2. **Alternative sources have different biases.** Court filings skew toward contested actions (no one sues over routine governance). Media sources skew toward newsworthy events. When relying on Tier 2Ã¢â‚¬â€œ4 sources, the system should note that the evidence base has shifted and interpret accordingly.

3. **Source health is the most honest thing you can show.** When the system cannot see clearly, saying so is more valuable than any assessment it could produce. Epistemic humility under uncertainty is a credibility asset, not a weakness.

4. **Data degradation may be gradual.** The most dangerous scenario isn't a sudden blackout Ã¢â‚¬â€ it's a slow decline where each week has 5% fewer documents than the last, and no single week triggers an alert. The trend line on source health is as important as any individual check. The `transparencyTrend` field in the meta-assessment is designed to catch this.

5. **Minimize the source asymmetry.** Baselines should use the same source mix as the current-period backfill to ensure apples-to-apples comparison. The `backfill-baseline.ts` script must fetch Federal Register documents, White House briefing room archive, and GDELT historical data â€” not Federal Register alone. RSS feeds (GAO, SCOTUS, DoD) genuinely lack historical archives; those remain FR-only for baseline periods. For older baselines (Obama 2013), the White House archive may use a different URL structure (obama.whitehouse.archives.gov) and should be marked unavailable rather than silently omitted â€” the seed data should record which sources contributed to each baseline period. When a source is unavailable for a baseline period, the baseline statistics should note the reduced source coverage so the UI can display "Baseline computed from Federal Register + GDELT only (White House archive unavailable for this period)."

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

14. **Seed data is deterministic and version-controlled.** The JSON fixtures in `lib/seed/fixtures/` are committed to the repository. New deployments run `pnpm seed:import` to load them â€” no API keys or external calls required. This means the fixture data must be curated (reviewed and keyword-tuned) before committing, and any keyword dictionary changes that affect scoring require re-generating and re-committing the fixtures.

### Category Architecture

15. **Not every data type fits the keyword scoring pipeline.** When a data source's fundamental nature doesn't match the methodology, the correct response is to reclassify it, not to force it through an ill-fitting pipeline. External democracy indices cannot be detected by scanning government documents for keywords. Categories should be periodically evaluated for this kind of architectural mismatch.

16. **Category keys must accurately describe what they measure.** The `indices` naming confusion demonstrates that misleading keys propagate misunderstandings across the team and into specifications. When renaming categories, update every reference (code, database, tests, specs, UI) in a single atomic change to prevent partial renames.

17. **Related categories should remain distinct when they measure different things.** `executiveActions` (presidential action volume/tempo) and `rulemaking` (independent agency capture) are related but measure different phenomena. A president can issue many executive orders without interfering with independent agencies. Collapsing related-but-distinct categories loses signal.

18. **External indices are corroboration, not ground truth.** External democracy indices are valuable precisely because they are methodologically independent — expert surveys vs. automated document analysis. Agreement strengthens both. Disagreement is informative, not a defect. The UI should present them as "here's what independent experts found" alongside "here's what the documentary record shows," never as a score to be averaged with the system's own assessments.

19. **Sparse data requires different presentation.** External indices publish annually or quarterly. Displaying them alongside weekly keyword scores requires a UI that handles mixed cadences gracefully — showing the most recent external score as a reference point, not interpolating between annual data points to create a false impression of weekly resolution.

### Presidential Cycle

20. **Cycle-position adjustment is context, not correction.** The raw comparison against the primary baseline is always displayed. The cycle-adjusted ratio is shown alongside it as additional context. Users see both numbers and the basis for the adjustment. The system never silently normalizes away a deviation — it explains why the deviation might be expected.

21. **Volume adjustment does not apply to keyword severity.** A capture-tier keyword match produces the same severity score regardless of cycle year. Only volume-based thresholds (document count triggers) are adjusted. If an executive order matches "mass IG removal" in Year 1 or Year 3, the severity is identical. The cycle adjustment prevents _volume alone_ from generating false signals during predictable surges.

22. **Low-confidence adjustments must be labeled as such.** With N=1 for most cycle-year comparisons (only one prior administration at that cycle position), the adjustment factors are estimates, not robust statistics. The UI must display the sample size and confidence level. "Based on Biden 2021 only (N=1)" is an honest statement that helps users calibrate their trust in the adjustment.

23. **Cycle-position data improves over time.** Each new administration adds another data point to the cycle-position ratios. After two full presidential terms of data collection, the system will have N=2 or N=3 for each cycle year, producing more reliable adjustment factors. The architecture should accommodate growing sample sizes gracefully — the `cycle_adjustment_factors` table stores provenance so factors can be recomputed as new baselines are added.
