# Democracy Monitor — Signal Gap Remediation Specification

## Document Purpose

This specification addresses the detection gaps identified in the Signal Gap Analysis (2026-02-19). After backfilling the Trump 2025 period (January 20, 2025 through mid-February 2026), the dashboard showed nearly all categories as Stable despite major known events including mass IG firings, DOGE government access, USAID closure, civil servant purges, court order defiance, and impoundment of congressionally-appropriated funds.

The root cause is not scoring or calibration — it is signal routing and detection scope. The system is optimized for formal regulatory documentation (Type A erosion) but weak on operational hollowing (Type B) and nearly blind to non-compliance/refusal (Type C). This specification defines the changes required to close those gaps.

**Relationship to existing specifications**: This document is a peer to the V3 Addendum, not a replacement. The V3 Addendum's Phases 10–15 remain valid. This specification adds Phases 16–20, with new sprints (numbered R1–R4 to avoid conflicts with the existing ROADMAP.md sprint sequence) added to the Implementation Sequence.

**Review history**: Initial draft reviewed by Claude Code (codebase-aware) on 2026-02-19. Ten issues identified and incorporated into this revision. Key corrections: InsufficientData handled at display layer only; document class multiplier changes limited to new additions only; administration-specific keywords use separate overlay file; topic classifier gap addressed for cross-feed coverage. Subsequently, FR API search syntax was tested and confirmed to support pipe `|` for OR, quoted phrases, grouping, and negation — signal queries revised to use consolidated pipe-OR syntax, and a pre-existing AND-instead-of-OR bug in existing signal queries was identified and added to Sprint R1. GDELT DOC 2.0 API investigation revealed `sourcecountry:US` filter that eliminates international noise — added to Sprint R1 as a one-line-per-query fix.

---

## Erosion Type Framework

All changes in this specification are organized around a three-type framework for democratic erosion:

| Type       | Description                                                                                                                                  | Example                                                                                        | Current Detection                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Type A** | Formal institutional override — executive actions that change rules, statutes, or institutional authority through documented legal processes | Executive order nullifying statutory limits; Schedule F reclassification via OPM rulemaking    | **Strong** — keyword dictionaries are calibrated for this     |
| **Type B** | Operational hollowing — personnel purges, agency defunding, operational shutdowns that degrade institutions without formal rule changes      | Mass firing of career staff; USAID closure; DOGE accessing agency systems                      | **Weak** — keywords assume formal language; actions bypass FR |
| **Type C** | Non-compliance/refusal — ignoring court orders, withholding appropriated funds, obstructing oversight without formal legal justification     | Court order defiance; impoundment without invoking Impoundment Control Act; refusing IG access | **Nearly blind** — produces no documents in monitored sources |

The phases below are sequenced to address the most tractable gaps first (expanding what the system sees within existing sources) before tackling architectural changes (how documents flow through the pipeline).

---

## Phase 16: Insufficient Data Display Fix

**Goal**: Stop conflating "we don't have enough data to assess" with "we detected something concerning."

**Priority**: Immediate — this is a credibility issue on the current dashboard.

### 16.1 Problem

The current assessment logic returns `Warning` status when fewer than `MIN_ITEMS_FOR_STABLE` (3) documents are available for a week, with an `insufficientData: true` flag in the detail JSON. The UI renders this as a Warning badge — the same visual treatment as a genuine keyword-driven warning. The result: `hatch` shows 19 Warning weeks and `military` shows 43 Warning weeks that are entirely statistical artifacts, while categories with genuine events show Stable.

### 16.2 Changes — Display Layer Only

The fix is purely in the UI. No changes to the type system, assessment pipeline, status ordering, AI Skeptic, or stored data.

In every UI component that renders a status badge, check `detail.insufficientData` before rendering:

```typescript
// In CategoryCard, StatusBadge, or equivalent UI components
if (assessment.detail?.insufficientData) {
  // Render gray "— No Data" badge instead of yellow "⚠ Warning"
  return <StatusBadge variant="insufficient" label="No Data" />;
}
// Otherwise render normal status badge
return <StatusBadge variant={assessment.status} />;
```

The sparkline component should render `InsufficientData` weeks as gaps or dashed segments rather than data points, to visually distinguish "we couldn't assess" from "we assessed and found nothing."

**Why display-layer only**: Adding `InsufficientData` to the `StatusLevel` type union would affect 15+ files that import it, require changes to status ordering logic (`statusIndex()`, `statusDistance()`, `clampToCeiling()`, `resolveDowngrade()`), create inconsistency between old stored data (`status='Warning'`) and new data, and require handling in the AI Skeptic pipeline. The display-layer fix achieves the same user-facing result with ~20 lines of UI changes and zero pipeline risk.

### 16.3 Scope

- Modify: UI status badge component (~10 lines — check `insufficientData` flag, render distinct badge)
- Modify: Sparkline component (~10 lines — render gaps for insufficient-data weeks)
- No changes to: type system, assessment service, AI service, status ordering, stored data, baseline fixtures

**Estimated scope**: ~20 lines changed across 2 files.

**Tests**: Component tests verifying that `insufficientData: true` renders "No Data" badge instead of Warning badge.

---

## Phase 17: Presidential Documents Feed

**Goal**: Bring executive orders, presidential memoranda, and proclamations into the category assessment pipeline as first-class documents.

**Priority**: P0 — executive orders are a primary mechanism for the actions the system is designed to detect, and they already exist in the Federal Register.

### 17.1 Problem

Executive orders and presidential memoranda are published in the Federal Register under document type `PRESDOCU` (Presidential Documents). The current signal queries use `term=` and `agency=` filters but do not include `type=PRESDOCU`. This means executive orders about government restructuring, spending directives, regulatory freezes, and military authorities are only captured if their text happens to match a category's term-based query. Many don't — an EO titled "Establishing the Department of Government Efficiency" contains none of the terms in any current signal query.

### 17.2 Changes

Add presidential document signal queries to relevant categories in `lib/data/categories.ts`.

**FR API Search Syntax** (confirmed via testing 2026-02-19):

- Space-separated terms = implicit AND (`impoundment rescission` → requires both terms)
- Pipe `|` = OR (`impoundment | rescission` → either term)
- Quoted phrases = adjacent words (`"schedule f"` → exact phrase, not "schedule" AND "f")
- All operators combine with type filters (`conditions[type][]=PRESDOCU&conditions[term]="civil service" | workforce | restructuring`)
- Negation with `-` works (`impoundment -rescission`)

```typescript
// New signals per category — consolidated using pipe-OR syntax
const PRESIDENTIAL_DOC_SIGNALS = [
  {
    id: 'fr_presdoc_civilservice',
    category: 'civilService',
    url: '...?conditions[type][]=PRESDOCU&conditions[term]=workforce | personnel | "civil service" | restructuring | "government employee"',
  },
  {
    id: 'fr_presdoc_fiscal',
    category: 'fiscal',
    url: '...?conditions[type][]=PRESDOCU&conditions[term]=appropriation | spending | budget | impoundment | rescission | funding',
  },
  {
    id: 'fr_presdoc_executive',
    category: 'executiveActions',
    url: '...?conditions[type][]=PRESDOCU',
    // All presidential documents are relevant to executive action volume — no term filter
  },
  {
    id: 'fr_presdoc_military',
    category: 'military',
    url: '...?conditions[type][]=PRESDOCU&conditions[term]="national emergency" | military | defense | "national guard" | insurrection | IEEPA',
  },
  {
    id: 'fr_presdoc_rulemaking',
    category: 'rulemaking',
    url: '...?conditions[type][]=PRESDOCU&conditions[term]=regulatory | rulemaking | deregulation | "independent agency"',
  },
  {
    id: 'fr_presdoc_oversight',
    category: 'igs',
    url: '...?conditions[type][]=PRESDOCU&conditions[term]="inspector general" | oversight | accountability | watchdog',
  },
  {
    id: 'fr_presdoc_courts',
    category: 'courts',
    url: '...?conditions[type][]=PRESDOCU&conditions[term]=judicial | court | jurisdiction | "judge nomination"',
  },
];
```

These documents flow through the existing category assessment pipeline — keyword matching against `assessment-rules.ts`, AI Skeptic review, severity scoring. No changes to the scoring engine required.

### 17.3 Document Class Multiplier

Presidential documents should carry appropriate document class multipliers. Add new presidential document classes to `scoring-config.ts` without changing any existing multiplier values:

```typescript
DOCUMENT_CLASS_MULTIPLIERS: {
  // Existing values — DO NOT CHANGE (changing these is a breaking change
  // requiring re-scoring all documents and re-running all baselines)
  executive_order: 1.5,         // Current value — keep as-is
  final_rule: 1.3,              // Current value — keep as-is
  proposed_rule: 1.0,           // Current value — keep as-is
  notice: 0.5,                  // Current value — keep as-is

  // New presidential document classes — additions only
  presidential_memorandum: 1.8, // Direct presidential action, often substantive
  proclamation: 1.3,            // Often ceremonial but can be substantive
  presidential_notice: 1.5,     // Emergency declarations, trade actions
}
```

**Important**: The existing `executive_order: 1.5` multiplier already exists in `scoring-config.ts`. It is not being changed. Only `presidential_memorandum`, `proclamation`, and `presidential_notice` are new additions. If the existing multipliers need revisiting, that should be a separate change with its own baseline impact analysis.

The FR API returns a `type` field and `subtype` field that distinguish these. Map them to document classes during ingestion.

### 17.4 Scope

- Modify: `lib/data/categories.ts` (add presidential document signals to relevant categories)
- Modify: `lib/methodology/scoring-config.ts` (add new presidential document class multipliers — existing values unchanged)
- Modify: Document ingestion logic to map FR `type`/`subtype` to document class
- Test: Verify presidential documents flow through keyword matching and AI review
- Test: Verify new document class multipliers are applied correctly
- Test: Verify existing document class multipliers are unchanged

**Estimated scope**: ~80–100 lines changed. No architectural changes — this uses existing infrastructure.

### 17.5 Baseline Impact

Presidential documents will retroactively appear in baseline periods when re-run. This is correct behavior — the baselines should include presidential documents. Biden 2021 had a wave of day-one executive orders (rejoining Paris Agreement, revoking travel ban, DACA restoration) that should show up in `executiveActions` and other categories. This provides the year-in-cycle comparison data: "Biden Year 1 had X executive orders scoring Y severity; Trump Year 1 had Z executive orders scoring W severity."

Baselines should be re-run after this change. The cost is nominal.

---

## Phase 18: Keyword Dictionary Expansion for Operational Language

**Goal**: Add keywords that match the actual language used for informal, euphemistic, and operational government actions — the vocabulary of Type B erosion.

**Priority**: P0 — quick improvement to detection within existing document sources.

### 18.1 Design Principles

The keyword expansion must follow these rules:

1. **Structural terms over administration-specific terms.** "Reduction in force" is structural — any administration might use it. "Fork in the road" is administration-specific jargon that will be meaningless against baselines. Structural terms go in the permanent dictionaries. Administration-specific terms, if added, should be tagged with metadata indicating their temporal scope.

2. **Operational language enters at warning tier, not capture.** Euphemistic language is inherently ambiguous. "Agency restructuring" could be routine management or institutional hollowing. These terms should enter at warning tier and only escalate to drift if the AI Skeptic confirms concern based on full document context.

3. **Co-occurrence strengthens signal.** A single euphemistic keyword match is weak evidence. Multiple euphemistic matches in the same document, or euphemistic matches alongside formal keywords, should be treated as stronger signal. The existing severity scoring (additive across keyword matches) already handles this — more matches = higher severity.

4. **The AI Skeptic is the disambiguation layer.** The expanded keywords will produce more matches against routine documents. The AI Skeptic's role becomes more critical: "This document mentions 'agency restructuring' — is this a routine reorganization or a concerning institutional change?" The AI review must run on all expanded-keyword matches, not just high-severity ones.

### 18.2 Proposed Keyword Additions

#### civilService — Operational Hollowing Language

**Warning tier** (new):

- "reduction in force"
- "rif notification"
- "probationary employee termination"
- "return to office mandate"
- "telework policy revocation"
- "voluntary resignation program"
- "deferred resignation"
- "agency restructuring plan"
- "workforce reshaping"
- "hiring freeze"
- "position abolishment"
- "involuntary reassignment"

**Drift tier** (new):

- "mass resignation"
- "government efficiency initiative"
- "across-agency workforce reduction"
- "career position converted"
- "acting official extended"

**Rationale**: These terms describe the operational mechanisms of personnel actions that constitute Type B erosion. They are structural — any administration conducting mass workforce changes would use this language. "Reduction in force" is a specific legal term (5 CFR 351) with formal process requirements. "Probationary employee termination" is the mechanism used to circumvent RIF protections.

#### fiscal — Operational Spending Language

**Warning tier** (new):

- "spending freeze"
- "funding pause"
- "program termination"
- "operational halt"
- "budget execution review"
- "obligation pause"
- "grant suspension"
- "contract suspension"

**Drift tier** (new):

- "agency closure"
- "agency shutdown"
- "defunded program"
- "appropriations lapse"
- "suspended disbursements"
- "withheld allotment"

**Rationale**: The existing fiscal keywords assume formal Impoundment Control Act language. Many fiscal actions use operational terminology that avoids the legal terms. "Spending freeze" and "funding pause" are the language of operational withholding that may or may not constitute legal impoundment.

#### military — Domestic Deployment Language

**Warning tier** (new):

- "domestic deployment"
- "immigration enforcement military"
- "national guard deployment urban"
- "military support to civilian law enforcement"
- "title 10 activation"

**Drift tier** (new):

- "deploy to american cities"
- "military used for law enforcement"
- "national guard federalized for domestic"

**Rationale**: The existing military keywords focus on the most extreme formal invocations (Insurrection Act, martial law). The operational language of gradual military involvement in domestic affairs is lower-intensity but represents meaningful drift.

#### igs/oversight — Operational Removal Language

**Warning tier** (new):

- "ig reassigned"
- "acting ig appointed"
- "ig office staffing reduced"
- "oversight function transferred"
- "ig access restricted"

**Drift tier** (new):

- "ig dismissed"
- "ig fired without cause"
- "watchdog removed"
- "oversight office closed"
- "ig authority suspended"

**Rationale**: "Inspector general removed" is already capture tier, but the operational language used for IG removals in practice is different — "dismissed," "fired," or buried in personnel announcements. The existing keywords are correct for formal IG removal announcements but miss the operational vocabulary.

#### courts — Compliance Language

**Warning tier** (new):

- "compliance review pending"
- "seeking clarification of order"
- "motion to stay pending appeal"

**Drift tier** (new):

- "non-responsive to court order"
- "failed to comply by deadline"
- "incomplete compliance"
- "compliance report overdue"

**Rationale**: Court order defiance rarely uses the words "defied" or "refused." The operational language is procedural — motions for stays, requests for clarification, missed deadlines. These are the leading indicators of non-compliance that precede formal contempt proceedings.

### 18.3 Administration-Specific Terms

The following terms are specific to the current administration and should be stored in a **separate overlay file** rather than modifying the core keyword data structure. This avoids changing the `string[]` structure consumed by the keyword matching loop, suppression system, AI Skeptic prompt builder, export/import pipeline, and tests.

Create `lib/data/admin-specific-keywords.ts`:

```typescript
export interface AdminKeywordOverlay {
  administration: string; // e.g., 'trump_2'
  applicableFrom: string; // e.g., '2025-01-20'
  applicableTo?: string; // optional end date; absent = still active
  keywords: Record<
    string,
    {
      // keyed by category
      warning?: string[];
      drift?: string[];
      capture?: string[];
    }
  >;
}

export const ADMIN_OVERLAYS: AdminKeywordOverlay[] = [
  {
    administration: 'trump_2',
    applicableFrom: '2025-01-20',
    keywords: {
      civilService: {
        warning: ['doge', 'department of government efficiency', 'fork in the road'],
      },
      fiscal: {
        warning: ['doge spending review'],
      },
    },
  },
];
```

**How it works**: The keyword matching loop in `assessment-service.ts` merges the admin overlay keywords with the core `assessment-rules.ts` keywords at runtime, filtered by document publication date. The merge produces a flat `string[]` per tier per category — the rest of the matching logic is unchanged.

```typescript
// In assessment-service.ts, at the start of keyword matching
function getEffectiveKeywords(category: string, tier: string, documentDate: string): string[] {
  const core = ASSESSMENT_RULES[category]?.[tier] ?? [];
  const adminExtras = ADMIN_OVERLAYS.filter(
    (o) => documentDate >= o.applicableFrom && (!o.applicableTo || documentDate <= o.applicableTo),
  ).flatMap((o) => o.keywords[category]?.[tier] ?? []);
  return [...core, ...adminExtras];
}
```

This preserves the core `string[]` data structure in `assessment-rules.ts`, keeps administration-specific terms isolated and auditable, and requires ~20 lines of merge logic rather than restructuring the keyword data model.

These terms produce zero matches against pre-2025 baselines (correct behavior — the date filter excludes them) but catch administration-specific language in the current monitoring period.

### 18.4 Suppression Rule Updates

Expanded keywords will produce more routine-document matches. Anticipate and pre-create suppression rules for known false-positive patterns:

- "reduction in force" in OPM administrative guidance documents → suppress (routine HR process documentation)
- "hiring freeze" in annual budget justification documents → suppress (standard budget language)
- "agency restructuring" in OMB Circular A-11 submissions → suppress (routine budget formulation)
- "spending freeze" in continuing resolution notices → suppress (standard CR mechanics)

These can be refined through the existing suppression learning loop (Addendum §13.2) after the first review cycle.

### 18.5 Scope

- Modify: `lib/data/assessment-rules.ts` (add structural keywords per category as specified in §18.2)
- Create: `lib/data/admin-specific-keywords.ts` (administration-specific overlay with date filtering)
- Modify: `lib/services/assessment-service.ts` (~20 lines — `getEffectiveKeywords()` merge function)
- Create: Initial suppression rules for anticipated false positives
- Re-generate: All baselines from scratch after keyword additions (see §18.6)

**Estimated scope**: ~150–200 lines of keyword additions, ~20 lines for overlay merge logic, ~10 lines of suppression rules.

**Tests**:

- Unit tests for `getEffectiveKeywords()` — verify admin overlay merges correctly, date filtering works at boundaries
- Verify admin-specific keywords produce zero matches for documents dated before `applicableFrom`
- Verify core `assessment-rules.ts` structure is unchanged (still `string[]` per tier)

### 18.6 Full Baseline Regeneration

After adding keywords and signal queries, all four baselines must be **regenerated from scratch** — not re-scored against existing document corpora. The signal query changes (Phase 17 presidential documents, Phase 20 expanded queries) mean the baselines will pull _different documents_ than before. Biden 2021 with `type=PRESDOCU` signals will include Biden's day-one executive orders that the current baseline doesn't contain. That's a different corpus requiring fresh FR API fetches, not just different scoring of the same corpus.

**Regeneration sequence**:

1. Finalize all signal query and keyword changes (Phases 17, 18, 20)
2. Archive existing baseline fixtures (they represent the pre-remediation methodology and should be preserved, not deleted)
3. Regenerate all four baselines from scratch: fresh FR API fetches with new signal queries, new keywords, AI assessment
4. Run the cross-baseline validation report against the new baselines
5. Review and tune — same three-iteration pattern as the original Biden 2022 calibration, but likely faster since keyword dictionaries are already partially calibrated
6. Export new baseline fixtures
7. Run Trump 2025 backfill against the same finalized methodology

**Cost estimate**: ~$2–6 per baseline for AI assessment at expanded keyword volume (more documents entering the pipeline from new signal queries, more keyword matches from expanded dictionaries). Four baselines = ~$8–24 total.

**Acceptance criteria**: If expanded keywords produce more than 20 new alerts per baseline that the AI Skeptic doesn't suppress, the keywords are too broad and should be tightened before proceeding. The goal is: baselines under normal governance show low severity even with expanded keywords, because the AI Skeptic correctly identifies routine documents.

**Data management**: The `document_scores` table has a unique constraint on `url`. Regeneration should use upsert logic (`INSERT ON CONFLICT UPDATE`) rather than requiring a table wipe. Existing scored data is overwritten with new scores from the regenerated pipeline.

**Circular dependency**: Keywords need baseline calibration, but baselines need final keywords. Resolution: treat Sprint R2 as iterative — add keywords, regenerate baselines, review, tune if needed, regenerate again. This is the same iteration pattern that reduced Biden 2022 from 42 alerts to 8 across three iterations.

---

## Phase 19: Rhetoric-to-Category Cross-Feed

**Goal**: Route rhetoric documents (White House briefings, GDELT news articles) through the category keyword assessment engine in addition to the intent pipeline, so that events documented in news coverage but absent from the Federal Register produce signal in the relevant categories.

**Priority**: P1 — this is the most impactful architectural change but requires careful design to avoid turning the system into a media sentiment index.

### 19.1 The Core Design Constraint

The system's credibility claim is: "We analyze the government documentary record." If the dashboard shows `igs` at Capture status because CNN reported on IG firings (rather than because a government document announced IG removal), the system has become a news aggregator, not a document analysis tool.

The cross-feed must preserve the distinction between government-source evidence and news-source evidence. News coverage can amplify signal and fill gaps, but it cannot be the sole basis for a Capture or Drift assessment.

### 19.2 Evidence Source Classification

Add a `sourceType` classification to every document in the assessment pipeline:

```typescript
type EvidenceSource =
  | 'federal_register' // FR API documents (rules, notices, presidential docs)
  | 'government_report' // GAO, CRS, IG reports
  | 'government_announcement' // WH briefing room, press secretary statements
  | 'news_coverage' // GDELT, media articles
  | 'court_filing' // Future: PACER, court docket feeds
  | 'congressional'; // Future: Congressional Record, committee reports
```

Each source type carries an evidence weight:

```typescript
const EVIDENCE_WEIGHTS: Record<EvidenceSource, number> = {
  federal_register: 1.0, // Full weight — primary authoritative source
  government_report: 0.9, // Near-full weight — official but interpretive
  government_announcement: 0.7, // Reduced — official but may be rhetorical
  news_coverage: 0.3, // Heavily reduced — secondary, interpretive
  court_filing: 0.9, // Future
  congressional: 0.8, // Future
};
```

A keyword match in a GDELT article produces 0.3× the severity of the same match in a Federal Register document. This means news coverage contributes to the severity score but cannot dominate it.

### 19.3 Status Escalation Rules

News-only evidence has a ceiling on how far it can escalate a category's status:

| Evidence Composition      | Maximum Status         |
| ------------------------- | ---------------------- |
| Government documents only | Capture (no ceiling)   |
| Government + news         | Capture (no ceiling)   |
| News only, high volume    | Warning                |
| News only, low volume     | Stable (no escalation) |

**Implementation**: After computing the weighted severity for a week, check whether any government-source documents contributed. If the severity exceeds the Warning threshold but all contributing documents are `news_coverage`, cap the status at Warning and add a flag:

```typescript
{
  status: 'Warning',
  newsOnly: true,
  annotation: 'News coverage suggests activity in this category. No confirming government documents found.',
  newsDocumentCount: 14,
  governmentDocumentCount: 0,
}
```

The UI renders this distinctly — a Warning badge with an explanatory note. This is itself a useful signal: "News is reporting on events that should produce government documents, but we're not finding any."

### 19.4 Pipeline Changes

**Prerequisite — data integrity fix**: All 9 non-zero scored documents from the Trump 2025 backfill have `document_id = NULL` in the `document_scores` table — JOINs to the `documents` table fail. The cross-feed needs reliable document linking to track evidence source types per scored document. Fix the backfill script to populate `document_id` correctly, and backfill NULL values for existing records, before implementing the cross-feed.

Currently:

```
WH briefings  → category='intent' → Intent pipeline only
GDELT articles → category='intent' → Intent pipeline only
```

After this change:

```
WH briefings  → category='intent' → Intent pipeline (unchanged)
               → ALSO: classify by topic → keyword match per category
                        → severity × 0.7 weight → category assessment

GDELT articles → category='intent' → Intent pipeline (unchanged)
                → ALSO: classify by topic → keyword match per category
                         → severity × 0.3 weight → category assessment
```

**Topic classification — addressing the mapping gap**: The existing `POLICY_AREA_CATEGORIES` mapping in `lib/data/category-topics.ts` only covers 6 of 11 categories: `courts`, `igs`, `elections`, `mediaFreedom`, `rulemaking`, and `executiveActions`. Five categories are unmapped: `civilService`, `fiscal`, `military`, `hatch`, and `infoAvailability`. These are the categories with the worst signal gaps — the exact ones the cross-feed is meant to help.

The `classifyByTopic()` function referenced in the original draft does not exist. What exists is `classifyPolicyAreaWithScore()` in `lib/services/intent-data-service.ts`, which classifies into the 5 policy areas.

**Solution**: Build a lightweight signal-term topic classifier that routes rhetoric documents to categories based on each category's signal query terms (from `categories.ts`), not the 5 policy areas. If a rhetoric document's title or content contains terms from civilService's signal queries ("federal workforce," "personnel management," "civil service," "agency restructuring"), it gets routed to civilService for keyword assessment. This reuses the signal query terms as a topic filter — they were designed to define each category's topical scope.

Create `lib/services/rhetoric-topic-classifier.ts`:

```typescript
import { CATEGORY_SIGNALS } from '@/lib/data/categories';

// Extract topic terms from each category's signal query URLs
// e.g., civilService signals contain 'civil+service', 'personnel+management', etc.
export function classifyRhetoricToCategories(title: string): string[] {
  const matchedCategories: string[] = [];
  for (const [category, signals] of Object.entries(CATEGORY_SIGNALS)) {
    const topicTerms = extractTermsFromSignalUrls(signals);
    if (topicTerms.some((term) => title.toLowerCase().includes(term))) {
      matchedCategories.push(category);
    }
  }
  return matchedCategories;
}
```

This covers all 11 categories because every category has signal definitions with topic-relevant terms. No manual mapping required — the signals _are_ the topic definitions.

**Implementation note**: `extractTermsFromSignalUrls()` must parse the pipe-OR syntax, quoted phrases, and negation operators now present in signal query URLs — not just split on `+`. Extract clean terms by stripping `|`, `"`, `-`, `(`, `)` and splitting on whitespace/pipes.

**Deduplication**: A rhetoric document that matches keywords in a category does NOT also create a separate `category='{cat}'` entry in the documents table. It remains `category='intent'` with an additional scoring record in `document_scores` that references the category it was scored against and its `sourceType`.

### 19.5 Backfill Implications

The 231,760 rhetoric documents from the Trump 2025 backfill should be re-scored through the category assessment pipeline after this change. This is a one-time re-processing step. The AI Skeptic should review all matches from rhetoric documents (not just high-severity ones) because news language is inherently more ambiguous than government document language.

Expected cost: At 0.3× evidence weight, most rhetoric keyword matches will produce low severity scores. The AI Skeptic will suppress many of them. The signal that survives — high-frequency keyword matches across many independent news sources — is likely genuine. Estimated processing: if the topic classifier routes ~5% of documents to categories (~11.5K docs), ~10% of those produce keyword matches (~1,150 docs), and the AI Skeptic reviews each match at gpt-4o-mini rates, the total cost is ~$1–2.

### 19.6 Scope

- **Prerequisite fix**: Backfill `document_scores.document_id` NULL values; fix backfill script to populate correctly going forward
- Create: `lib/types.ts` additions — `EvidenceSource` type, evidence weights
- Create: `lib/services/rhetoric-topic-classifier.ts` — signal-term-based topic classification covering all 11 categories
- Modify: `lib/services/assessment-service.ts` — apply evidence weight to severity scoring, add news-only status ceiling
- Modify: Backfill/snapshot pipeline — route rhetoric documents through category keyword matching after intent classification
- Modify: UI status badge component — render `newsOnly` flag distinctly
- Create: Migration adding `source_type` column to `document_scores` if not already present

**Estimated scope**: ~250–350 lines of new/modified code. This is the largest change in this specification.

**Tests**:

- Pure function tests for evidence weight application (verify 0.3× weight for news, 1.0× for FR)
- Unit tests verifying news-only ceiling enforcement (news-only evidence cannot produce Drift or Capture)
- Tests for `classifyRhetoricToCategories()` — verify rhetoric documents route to correct categories, verify all 11 categories are reachable
- Integration test: a rhetoric document matching a category keyword produces a `document_scores` record with correct `source_type`

### 19.7 What This Does NOT Do

1. **Does not merge rhetoric and category data models.** Rhetoric documents remain `category='intent'` in the documents table. The cross-feed creates scoring records, not new document entries.
2. **Does not replace the intent pipeline.** Policy area classification, rhetoric→action lag analysis, and the rhetoric page all continue to work from the intent pipeline. The cross-feed is additive.
3. **Does not allow news-only evidence to drive Capture or Drift status.** The status ceiling (§19.3) prevents this.
4. **Does not feed category keywords back into the intent pipeline.** The two pipelines remain separate. Category keywords score government actions; intent keywords score rhetoric. The cross-feed allows rhetoric documents to also be scored by category keywords, but intent keywords do not score government documents.

---

## Phase 20: Expanded Federal Register Signal Queries

**Goal**: Broaden the FR signal queries to capture documents that use operational language or fall outside the current narrow term filters.

**Priority**: P1 — should be implemented alongside or shortly after the keyword expansion (Phase 18).

### 20.1 Problem

The current FR signal queries are narrowly scoped. For example, `civilService` only queries for `term=schedule+f+civil+service` and `agency=personnel-management-office`. An executive order about "government efficiency" that restructures agency staffing won't match either query, even though it's directly relevant.

### 20.2 Existing Signal Query Audit — Pre-Existing AND Bug

**Critical finding**: The existing signal queries in `categories.ts` use space-separated terms, which the FR API treats as implicit AND. Many of these queries were almost certainly intended as OR queries. For example:

```
# Current fiscal query — returns only 15 documents (requires ALL 5 terms)
term=impoundment+rescission+deferral+withholding+appropriation

# Intended behavior — returns ~10,000 documents (any of these terms)
term=impoundment | rescission | deferral | withholding | appropriation
```

This is a **pre-existing detection gap** independent of the remediation work. Every multi-term signal query in `categories.ts` must be audited and converted to pipe-OR where the intent was "any of these terms."

**Audit checklist** (existing queries from `categories.ts`):

| Signal ID             | Current Query                                                    | Likely Intent                         | Fix                                                                                                  |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| fr_impoundment        | `impoundment rescission deferral withholding appropriation`      | Any fiscal term                       | `impoundment \| rescission \| deferral \| withholding \| appropriation`                              |
| fr_anti_deficiency    | `anti-deficiency apportionment obligation sequestration impound` | Any of these                          | `"anti-deficiency" \| apportionment \| obligation \| sequestration \| impound`                       |
| fr_schedule_f         | `schedule f civil service`                                       | "schedule f" in civil service context | `"schedule f"` (phrase only — adding `\| "civil service"` would pull thousands of routine documents) |
| fr_court_compliance   | `injunction compliance`                                          | Both terms together                   | Likely correct as AND — documents about injunction compliance                                        |
| fr_court_structure    | `court jurisdiction judicial reform`                             | Any court structure term              | `court \| jurisdiction \| "judicial reform"`                                                         |
| fr_national_emergency | `national emergency`                                             | The phrase                            | `"national emergency"` (phrase, not AND of two common words)                                         |
| fr_national_guard     | `national guard deployment`                                      | Guard deployment                      | `"national guard" deployment` (phrase + AND)                                                         |
| fr_oversight          | `oversight accountability watchdog`                              | Any oversight term                    | `oversight \| accountability \| watchdog`                                                            |
| fr_election_integrity | `election integrity interference voting rights ballot access`    | Any election term                     | `"election integrity" \| "election interference" \| "voting rights" \| "ballot access"`              |
| fr_election_admin     | `election commission certification recount polling place`        | Any admin term                        | `"election commission" \| "election certification" \| "election recount" \| "polling place"`         |

Each query should be reviewed for intent (was this AND or OR?) and converted accordingly. Multi-word terms that should be phrases need quoting (e.g., `"national emergency"` not `national emergency`).

### 20.3 New Signal Queries

All new queries use pipe-OR syntax with quoted phrases for multi-word terms.

#### civilService

| Signal ID        | Query                                                                                                 | Rationale                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| fr_opm           | `agency=personnel-management-office`                                                                  | Existing — keep (agency filter, not term query) |
| fr_schedule_f    | `term="schedule f"`                                                                                   | Existing — fix with phrase quoting              |
| fr_workforce     | `term="reduction in force" \| "federal workforce" \| "government employee" \| "personnel management"` | New — captures operational workforce actions    |
| fr_restructuring | `term="agency restructuring" \| "government reorganization" \| "workforce reshaping"`                 | New — captures structural changes               |

#### fiscal

| Signal ID          | Query                                                                                                          | Rationale                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| fr_impoundment     | `term=impoundment \| rescission \| deferral \| withholding \| appropriation`                                   | Existing — **fix from AND to OR**                     |
| fr_anti_deficiency | `term="anti-deficiency" \| apportionment \| obligation \| sequestration \| impound`                            | Existing — **fix from AND to OR, add phrase quoting** |
| fr_spending        | `term="spending freeze" \| "funding pause" \| "program termination" \| "agency closure" \| "grant suspension"` | New — captures operational fiscal actions             |

#### igs/oversight

| Signal ID            | Query                                                                    | Rationale                                         |
| -------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- |
| fr_inspector_general | `term="inspector general"`                                               | Existing — fix with phrase quoting                |
| fr_oversight         | `term=oversight \| accountability \| watchdog`                           | Existing — **fix from AND to OR**                 |
| fr_ig_personnel      | `term="inspector general" (removal \| vacancy \| acting \| appointment)` | New — targets IG personnel changes using grouping |

### 20.4 Query Calibration Process

Each new signal query must be validated against baseline periods before deployment:

1. Run the query against Biden 2022 date range
2. Count returned documents
3. If > 30 documents/week average, the query is too broad — add term filters
4. If < 1 document/week average, the query may be too narrow — broaden terms
5. Run keyword matching against returned documents — if > 50% match no keywords, the query is pulling irrelevant documents

This calibration prevents signal queries from flooding categories with documents that don't match any concern keywords (the problem that required tightening fiscal and elections queries during baseline calibration).

### 20.5 GDELT Query Improvements

**Problem**: The GDELT DOC 2.0 API queries in `rhetoric-fetcher.ts` do not use the `sourcecountry:` filter. This means all rhetoric documents include global news coverage — articles from Ethiopia, Hong Kong, Pakistan, Philippines, Nigeria, etc. The rhetoric gap analysis (Sprint 14.1) found that roughly half of the mediaFreedom gaps were international press freedom stories. The igs/courts gaps were dominated by a single syndicated international article appearing 47 times.

**Fix**: Add `sourcecountry:US` to all GDELT queries in `rhetoric-fetcher.ts`:

```typescript
// Current
const query = `("inspector general" OR "government oversight")`;

// Fixed
const query = `("inspector general" OR "government oversight") sourcecountry:US`;
```

This is a one-line fix per query that immediately improves rhetoric data quality for all future fetches.

**Additional GDELT capabilities worth noting** (confirmed via API documentation):

| Feature           | Syntax                             | Use Case                                                                                              |
| ----------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Country filter    | `sourcecountry:US`                 | **Immediate fix** — eliminates international noise                                                    |
| Proximity search  | `near20:"inspector general fired"` | Matches words within N words of each other — useful for multi-word concepts that aren't exact phrases |
| Repetition filter | `repeat3:"doge"`                   | Requires word to appear N+ times — filters for articles where topic is central, not passing mention   |
| Theme tags        | `theme:PROTEST`                    | GDELT's pre-tagged themes — could supplement keyword-based topic classification                       |

**Historical access note**: GDELT DOC 2.0 API supports arbitrary date ranges via `startdatetime`/`enddatetime` parameters — our DB contains GDELT data from 2017 onward, disproving the earlier assumption of a 3-month rolling window. The original concern (Sprint 20, Feb 2025) may have been based on testing without explicit date range parameters. Two approaches for the existing corpus:

1. **Post-hoc filtering**: If the stored rhetoric documents include source URL metadata, apply a domain-based country heuristic at the scoring stage (e.g., `.gov`, major US outlets → US; known international domains → exclude). This is imperfect but reduces noise.
2. **Accept the mixed corpus for historical data**: The existing 231K documents include international noise but the keyword matching step acts as a secondary filter — international articles about Ethiopian press freedom are unlikely to match US-specific assessment keywords like "press credentials revoked" or "FOIA denied."

For all future rhetoric fetches (snapshot pipeline, not backfill), apply `sourcecountry:US` immediately.

### 20.6 Scope

- Modify: `lib/data/categories.ts` (fix existing queries, add new signal definitions)
- Modify: `rhetoric-fetcher.ts` (add `sourcecountry:US` to all GDELT queries)
- Run: Calibration queries against baseline periods
- Re-run: Backfill for Trump 2025 with expanded signals

**Estimated scope**: ~40–60 lines of FR signal definitions, ~10 lines of GDELT query fixes. Calibration is a manual verification step.

---

## Implementation Sequence

Sprints are numbered R1–R4 (R for Remediation) to avoid conflicts with the existing ROADMAP.md sprint sequence (Sprints 15–26). These should be merged into the ROADMAP by displacing or reordering planned sprints 20–26.

### Sprint R1 (Immediate: Display Fix + Presidential Documents + Signal Query Audit + Data Integrity)

**Target**: Fix the most visible problems — misleading Warning badges, missing executive orders, crippled signal queries, and broken document linkage.

1. **16.2** Check `detail.insufficientData` in UI components, render "No Data" badge instead of Warning
2. **16.2** Update sparkline component to render gaps for insufficient-data weeks
3. **Prerequisite fix**: Backfill `document_scores.document_id` NULL values; fix backfill script to populate correctly
4. **20.2** Audit all existing signal queries in `categories.ts` — convert AND-intended-as-OR queries to pipe-OR syntax, add phrase quoting for multi-word terms (this is a pre-existing bug fix, not new functionality)
5. **20.5** Add `sourcecountry:US` to all GDELT queries in `rhetoric-fetcher.ts` (one-line fix per query, eliminates international noise for all future fetches)
6. **17.2** Add presidential document signal queries to `categories.ts` (using pipe-OR syntax and phrase quoting)
7. **17.3** Add new presidential document class multipliers to `scoring-config.ts` (existing values unchanged)
8. Map FR `type`/`subtype` to document classes during ingestion
9. **Verify oversight.gov status**: Test `html_oversight_gov` signal scraper against current site. If operational, verify the `oversightGovDown: 'drift'` rule in `assessment-rules.ts` and consider making it dynamic (check availability at runtime rather than hardcoded)

**Tests**:

- Component tests: `insufficientData: true` renders "No Data" badge
- Unit tests: new document class multipliers applied correctly; existing multipliers unchanged
- Integration test: presidential documents flow through keyword matching and AI review
- Verify corrected signal queries return expected document volumes (spot-check 2–3 queries against known counts from the API test)
- Verify GDELT queries include `sourcecountry:US` and return US-only articles

**Deliverable**: Dashboard no longer shows misleading Warning badges. Executive orders flow through category assessment. Existing signal queries return the intended document set instead of requiring all terms simultaneously. GDELT queries filtered to US sources. Document linkage is intact for future evidence tracking.

### Sprint R2 (Keyword Expansion + Signal Query Broadening + Full Baseline Regeneration)

**Prerequisite**: Sprint R1 complete (presidential documents in pipeline, existing signal queries fixed to pipe-OR, data integrity fixed).

1. **18.2** Add structural operational keywords to `assessment-rules.ts` (all categories per §18.2)
2. **18.3** Create `lib/data/admin-specific-keywords.ts` overlay file with date-filtered merge logic
3. **18.4** Create initial suppression rules for anticipated false positives
4. **20.3** Add new expanded FR signal queries to `categories.ts` (using pipe-OR syntax and phrase quoting)
5. **20.4** Calibrate all new signal queries against Biden 2022 date range
6. **18.6** Archive existing baseline fixtures as pre-remediation reference
7. **18.6** Regenerate all four baselines from scratch: fresh FR API fetches with all new signal queries and keywords, AI assessment
8. Run cross-baseline validation report against regenerated baselines
9. Review cycle: verify new keyword matches are genuine, tune suppressions
10. If >20 unsuppressed alerts per baseline, tighten keywords and regenerate again
11. Export new baseline fixtures
12. Run Trump 2025 backfill against finalized methodology

**Tests**:

- Unit tests: `getEffectiveKeywords()` merge logic, date filtering at boundaries
- Unit tests: admin-specific keywords produce zero matches for pre-2025 documents
- Verify core `assessment-rules.ts` remains `string[]` per tier (no structural changes)
- Cross-baseline validation: regenerated baselines produce comparable or lower alert counts than pre-remediation baselines

**Deliverable**: Keyword dictionaries cover Type B operational language. Signal queries pull documents using non-formal terminology. All baselines regenerated from scratch against the same methodology. The system can now detect events described in operational language within Federal Register and presidential documents.

### Sprint R3 (Rhetoric Cross-Feed)

**Prerequisite**: Sprint R2 complete (keywords and signals calibrated, baselines regenerated with finalized methodology).

1. **19.2** Implement `EvidenceSource` classification and evidence weights
2. **19.3** Implement news-only status ceiling in assessment logic
3. Create `lib/services/rhetoric-topic-classifier.ts` — signal-term-based classifier covering all 11 categories
4. **19.4** Modify backfill/snapshot pipeline to route rhetoric documents through category keyword matching
5. **19.5** Re-process Trump 2025 rhetoric documents through category assessment
6. Review cycle: verify news-coverage-driven signals are genuine, tune evidence weights if needed
7. Update UI to render `newsOnly` warnings distinctly

**Tests**:

- Pure function tests: evidence weight application (0.3× for news, 1.0× for FR, etc.)
- Unit tests: news-only ceiling enforcement (cannot produce Drift or Capture)
- Unit tests: `classifyRhetoricToCategories()` routes to correct categories, all 11 categories reachable
- Integration test: rhetoric document → topic classification → keyword match → weighted score → `document_scores` record with correct `source_type`

**Deliverable**: The 231K rhetoric documents now contribute to category assessments with appropriate source-type weighting. Events covered by news but absent from the Federal Register produce Warning-level signals with clear annotation. The system can now detect Type B and Type C erosion patterns that bypass formal documentation.

### Sprint R4 (Immigration Category — deferred)

**Prerequisite**: Sprints R1–R3 complete. The detection pipeline is fixed before adding new categories.

1. Define immigration signal queries for `categories.ts` (using established pattern — multiple term-specific queries)
2. Build keyword dictionary for `assessment-rules.ts` (capture, drift, warning tiers)
3. Calibrate against all four regenerated baselines
4. Backfill Trump 2025 immigration data
5. Review and tune

**Tests**:

- Keyword matching tests for new immigration dictionary
- Calibration verification: immigration category against baseline periods

**Deliverable**: Immigration monitoring is functional. This is a new category addition following established patterns, not an architectural change.

---

## Detection Scope Statement

After implementing Phases 16–20, the system's detection capabilities should be documented publicly:

> **What Democracy Monitor detects:**
>
> - Formal institutional changes published in the Federal Register (executive orders, rules, notices, presidential memoranda)
> - Operational government actions described in official documents (workforce changes, spending actions, oversight modifications)
> - Events reported in news coverage that correspond to government action keywords (shown as corroborating evidence, not primary)
>
> **What Democracy Monitor does not yet detect:**
>
> - Court filing details (compliance, contempt proceedings) — planned for Phase 11
> - Congressional actions (appropriations votes, committee investigations) — planned for Phase 11
> - State-level government actions
> - Actions that produce no documentary record of any kind
>
> **How to interpret the dashboard:**
>
> - **Stable** means: no concerning keywords matched in government documents this week
> - **Warning** means: keywords matched but context suggests routine activity, OR news coverage suggests activity without confirming government documents
> - **Drift/Capture** means: multiple concerning keyword matches confirmed by AI review in government documents
> - **No Data** (gray badge) means: too few documents were available to assess this category this week — this is not a warning, it means we couldn't measure

This statement should appear on the `/methodology` page and in the project README.

---

## Risk Reminders

### Signal Expansion

24. **Operational keywords are inherently ambiguous.** "Agency restructuring" appears in routine management documents and in documents describing institutional hollowing. The AI Skeptic must review all operational-keyword matches. Do not add operational terms at capture tier — they enter at warning tier and can only escalate through AI confirmation or co-occurrence with formal keywords.

25. **News coverage is evidence of reporting, not evidence of government action.** A GDELT article about IG firings is evidence that media reported on IG firings. It is not a government document announcing IG firings. The evidence weight system (§19.2) encodes this distinction. Never allow news-only evidence to drive Drift or Capture status.

26. **Administration-specific keywords have a shelf life.** "DOGE" and "fork in the road" are meaningful in 2025. They will be meaningless in 2029. The admin overlay file (§18.3) isolates these terms with date filtering, but the overlay should be reviewed at each administration transition and archived rather than deleted.

27. **Expanded signal queries need calibration against baselines before deployment.** A signal query that returns 200 documents per week overwhelms the keyword matching and AI review pipeline. Every new query must pass the calibration check (§20.3) before being added to production signals.

28. **The silence-as-signal pattern requires baseline publication rhythms.** Phase 12 (Data Disappearance as First-Class Signal) becomes more important after this expansion. If an agency that normally publishes 10 FR notices per week suddenly publishes zero, that absence is potentially more diagnostic than any keyword match. But absence detection requires established baselines of expected publication volume — which the four baseline periods now provide.

29. **Baseline regeneration after methodology changes is mandatory, not optional.** Every keyword addition and signal query change alters the baseline document corpus and severity landscape. Baselines must be regenerated from scratch (fresh FR API fetches, not re-scoring existing documents) so that the comparison reference reflects the same methodology as the current monitoring pipeline. Archived pre-remediation baselines are preserved for methodology comparison but are not valid comparison references for the remediated system.

30. **FR API supports full boolean search syntax.** Confirmed via testing: pipe `|` for OR, space for AND, quoted phrases `""` for adjacent words, `-` for NOT, and parentheses for grouping. All operators combine with type/agency filters. Multi-word terms must be quoted (e.g., `"schedule f"` not `schedule f`, which returns AND of two very common words). Existing signal queries using space-separated terms that were intended as OR are a pre-existing bug returning far fewer documents than intended — this is fixed in Sprint R1.

31. **Verify external dependencies before assuming they're down.** The oversight.gov site was reported as down since October 2025 but is operational as of February 2026. The `oversightGovDown: 'drift'` hardcoded rule in `assessment-rules.ts` may be incorrectly escalating the igs category. Sprint R1 should verify the site status and consider making this rule dynamic (check availability at runtime) rather than maintaining a hardcoded assumption.

32. **The `document_scores.document_id` NULL problem must be fixed before building evidence tracking.** The cross-feed (Phase 19) requires reliable document linkage to track evidence source types. The existing backfill produces NULL document IDs, which breaks JOINs to the documents table. This is a prerequisite data integrity fix, not a Phase 19 implementation detail.

33. **GDELT DOC 2.0 API supports historical date ranges.** The API accepts `startdatetime`/`enddatetime` parameters for arbitrary date ranges — our DB contains GDELT data from 2017 onward. Historical rhetoric data can be re-fetched with improved query parameters (e.g., `sourcecountry:US`). The original assumption of a 3-month rolling window (Sprint 20, Feb 2025) was incorrect.

34. **GDELT `sourcecountry:US` is essential for the rhetoric cross-feed.** Without country filtering, the cross-feed (Phase 19) would route international press freedom and rule-of-law articles through US category assessment, producing spurious keyword matches. The `sourcecountry:US` fix in Sprint R1 must be in place before Sprint R3's cross-feed is implemented.
