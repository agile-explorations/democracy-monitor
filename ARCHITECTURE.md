# Democracy Monitor — Proposed Architecture Redesign

> **⚠️ HISTORICAL DESIGN DOCUMENT (March 2026) — the built system diverged from this proposal.**
> Kept as the design-rationale record; do not use it as a reference for current behavior.
> Key divergences: detection is driven **solely by AI two-pass document review** (structural,
> silence, and thematic layers are descriptive context, not scored — the three-layer convergence
> voting and "Divergent"/"Baseline Invalid" statuses described below were never shipped); there
> are **8 baseline periods**, not 4; all **14 categories** are operational; CourtListener ingest
> is opinion-first and court-scoped with case docket metadata in a dedicated `tracked_cases`
> litigation tracker (the earlier metadata-stub document rows were retired 2026-08); narratives use
> a 3-pass draft→feedback→revise pipeline; reproducibility shipped as per-pass `prompt_version`
> stamping plus enforced AI call budgets rather than bundle hashes.
> **Current references:** [ASSESSMENT_METHODOLOGY.md](ASSESSMENT_METHODOLOGY.md) (public
> methodology), `docs/PROJECT_KNOWLEDGE.md` (architecture decisions and current state), and
> `docs/DECISIONS.md` (sprint retrospectives).

## Purpose of This Document

This document proposes a fundamental architectural change to Democracy Monitor's detection and assessment pipeline. It is written for review by both ChatGPT (architectural/epistemic critique) and Claude Code (codebase-aware implementation feasibility).

The proposal emerges from a series of findings:

1. **Signal Gap Analysis** revealed that the keyword-based detection system failed to identify major institutional events (DOGE, USAID closure, IG firings, court order defiance, civil servant purges) across 57 weeks of Trump 2025 data, despite having extensive document coverage.

2. **Keyword expansion** was proposed and partially implemented, but further analysis revealed a structural problem: keywords require anticipating the specific language an administration will use. When language shifts — from formal legal terminology to operational euphemisms, branding, or novel constructs — keyword detection collapses. Expanding keywords reactively creates a treadmill where the system confirms what was already known from news coverage rather than independently detecting signals.

3. **AI-first detection** was proposed as a replacement, but introduces its own fragility: prompt-tuning replaces keyword-tuning as the bias vector, model updates degrade reproducibility over time, and making AI the sole gatekeeper of what's "relevant" creates an opaque dependency inappropriate for civic infrastructure.

4. **The core architectural insight**: the system conflates three distinct questions — "did something change?" (structural measurement), "what changed?" (content analysis), and "is it concerning?" (interpretive judgment) — into a single keyword-severity score. Separating these questions into independent layers, each using the method best suited to it, produces a more robust, auditable, and language-immune system.

---

## Current Architecture (What We're Replacing)

```
Federal Register API → Signal Queries (term-based) → Documents
  → Keyword Matching (assessment-rules.ts) → Severity Score
    → AI Skeptic (confirms or downgrades) → Weekly Status
      → Dashboard (Stable / Warning / Drift / Capture)

GDELT + White House → Rhetoric Pipeline (separate) → Intent classification
  → NOT connected to category assessment
```

**Problems with this architecture:**

- Detection depends entirely on keyword dictionaries anticipating the right language
- Federal Register signal queries use implicit AND, returning far fewer documents than intended
- Rhetoric/news documents (~57K) are collected but categorized only as `intent` — never assessed against the 11 monitoring categories. This means per-category source convergence cannot be computed (Layer 1 needs to know how many GDELT articles relate to each category), and Layer 2 will never assess rhetoric documents for erosion concerns. The `document-store.ts` explicitly stores all rhetoric items with `category: 'intent'`. Fixing this cross-feed is a prerequisite for source convergence and for Layer 2 to assess news alongside government documents.
- The AI Skeptic only sees documents that keywords already flagged — if keywords miss, AI never gets a chance
- "Insufficient data" renders as "Warning," misleading the dashboard
- Single severity score conflates structural measurement with interpretive judgment
- The system is strong on Type A erosion (formal institutional override) but weak on Type B (operational hollowing) and blind on Type C (non-compliance/refusal)

---

## Proposed Architecture: Three-Layer Triangulated Detection

### Design Principles

1. **Detection should not depend on anticipating specific language.** The system must detect that something unusual is happening even when the administration uses novel terminology, euphemisms, or avoids formal channels entirely.

2. **Separate measurement from interpretation.** The system's primary output should be a factual, reproducible, language-independent measurement of structural deviation from baseline. Interpretive analysis is valuable but must be clearly labeled as such and must not determine the primary status.

3. **Confidence comes from convergence of independent signals.** When multiple detection layers, using fundamentally different methods, agree that something is unusual — that's a high-confidence signal. No single layer should be required for detection.

4. **Keywords are annotations, not gates.** Keyword matches, when they occur, provide useful labeling and historical context. But missing keyword matches must never reduce confidence or prevent detection. Keywords are documentation, not instrumentation.

5. **Everything is versioned and published.** Baseline distributions, detection thresholds, AI prompts, reference libraries — all are committed to the repository. Changes are annotated. The methodology is the product as much as the results.

6. **Categories track democratic threat vectors, not document sources.** Category selection is grounded in established political science frameworks (V-Dem, Freedom House, Levitsky & Ziblatt) to ensure comprehensive coverage of all recognized erosion mechanisms. See `CATEGORY_FRAMEWORK_ANALYSIS.md` for the full mapping.

---

### Category Framework (13 Categories)

Categories are organized around **democratic threat vectors** — the mechanisms through which democratic institutions erode — not around document sources. Each category is mapped to established framework dimensions to ensure comprehensive coverage.

| #   | Category Key             | Threat Vector                                             | Primary Sources                                        | Framework Alignment                                          | Status                                                         |
| --- | ------------------------ | --------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------- |
| 1   | `executiveActions`       | Executive overreach & constraint erosion                  | FR, WH                                                 | V-Dem executive constraints; FH-C                            | Operational                                                    |
| 2   | `rulemaking`             | Independent agency capture                                | FR                                                     | Unique to DM — no other framework tracks at this granularity | Operational                                                    |
| 3   | `civilService`           | Politicization of bureaucracy                             | FR, WH, OPM                                            | V-Dem impartial administration; FH-C                         | Operational                                                    |
| 4   | `judicialIndependence` ★ | Erosion of judicial independence & rule of law compliance | CourtListener, FR                                      | V-Dem judicial constraints; FH-F1                            | Rename pending; source expansion validated                     |
| 5   | `elections`              | Electoral integrity & voter access                        | LegiScan, FEC, FR                                      | V-Dem elections & suffrage; FH-A/B                           | Source expansion validated (LegiScan operational at free tier) |
| 6   | `lawEnforcement` ✦       | Selective enforcement & due process erosion               | DOJ API, CourtListener                                 | V-Dem rule of law; FH-F2/F3; L&Z indicator 2                 | New — sources validated, launch candidate                      |
| 7   | `civilLiberties` ✦       | Assembly, association & individual rights                 | CourtListener (NOS 440), ACLU, DOJ-CRD                 | V-Dem freedom of association; FH-E/G; L&Z indicator 4        | New — sources validated, launch candidate                      |
| 8   | `mediaFreedom`           | Press freedom & media landscape health                    | FCC RSS, FR, GDELT rhetoric                            | V-Dem freedom of expression; FH-D                            | Source expansion validated                                     |
| 9   | `infoAvailability`       | Government transparency & censorship                      | FR, WH, agency websites                                | V-Dem government censorship; FH-C3/D                         | Operational                                                    |
| 10  | `fiscal`                 | Budget weaponization & corruption                         | FR, GAO, CBO†                                          | V-Dem corruption; FH-C2                                      | Operational (CBO nice-to-have)                                 |
| 11  | `executiveOversight` ★   | Watchdog independence (IGs, GAO, congressional oversight) | GovInfo/GAO API, IG RSS, FR                            | V-Dem executive oversight; FH-C                              | Rename pending; source expansion validated                     |
| 12  | `military`               | Military/security in domestic politics                    | FR, DOD, GDELT                                         | V-Dem political violence; FH-F3                              | Operational                                                    |
| 13  | `immigrationEnforcement` | Immigration enforcement patterns                          | FR (DHS, CBP), GDELT; DHS/ICE/CBP statistics (Phase 5) | FH-F2/G1                                                     | Adding in R-S1d; GDELT cross-feed essential                    |

★ = Rename from prior architecture (courts → judicialIndependence, igs → executiveOversight). Currently operational under old name with FR-only sources. Current baselines are FR-only; baselines will need recomputation after source expansion adds CourtListener/GovInfo data.
✦ = New category. Does not exist in codebase. Source availability validated by spikes (see `SPIKE_FINDINGS.md`). Implementation in Sprint R-S1.
† = Nice-to-have source addition; not required for launch.

**Status label definitions:** "Operational" = exists in codebase with signal definitions, documents in DB, and included in aggregation queries. "Source expansion validated" = category exists but new sources validated and awaiting pipeline integration. "New — sources validated, launch candidate" = category does not yet exist in codebase; sources validated by spikes. "Adding in [sprint]" = implementation planned for specific sprint. "Rename pending" = operational under old name, rename tracked.

**Renames from prior architecture:** `courts` → `judicialIndependence`, `igs` → `executiveOversight`. These renames clarify that the category tracks the _threat vector_ (erosion of independence, erosion of oversight) not the _institution_. Rename should happen early (Sprint R3.2 or R4 timeframe) to avoid accumulating code under old names.

**New categories:** `lawEnforcement` and `civilLiberties`. These fill gaps identified by mapping against V-Dem, Freedom House, and Levitsky & Ziblatt frameworks. Source availability validated by spikes: lawEnforcement has 420-540 docs/week from CourtListener + DOJ API; civilLiberties has 67-123 docs/week from CourtListener NOS 440 alone. Both are launch candidates. See `SPIKE_FINDINGS.md`.

**Implementation gap closed:** `immigrationEnforcement` was listed as "Operational" in earlier versions of this document but was never added to the codebase. Adding in Sprint R-S1d with 2 FR signals: `fr_dhs_immigration` (DHS parent agency + immigration terms, ~98.5% of unique documents) and `fr_cbp_enforcement` (CBP + enforcement terms, ~9 unique border enforcement docs per period). A third signal (`fr_ice`) was evaluated and dropped — 100% redundant due to FR API nesting sub-agency documents under DHS parent. FR-only volume is thin (~5-6 docs/week, comparable to hatch) so GDELT rhetoric cross-feed is essential for this category's convergence scoring. The category tracks immigration enforcement _patterns_ — the operational rulemaking that enables detention expansion, removal acceleration, asylum restrictions, and border enforcement posture changes. This is distinct from lawEnforcement (which captures DOJ enforcement priorities and CourtListener filings) and civilLiberties (which captures civil rights litigation). The unique future signal is DHS monthly statistical tables (encounters, detention bed counts, removals), deferred until a download pipeline for the Excel/PDF data is built.

**Framework coverage achieved:**

- All V-Dem liberal democracy sub-indices have at least one DM category
- All 7 Freedom House sections (A through G) are covered
- All 4 Levitsky & Ziblatt behavioral indicators are covered
- DM adds unique granularity: civilService, rulemaking, and infoAvailability are tracked at document-level detail that no annual expert-coded survey achieves

---

### Source Expansion (Validated by Availability Spikes)

The expanded category framework requires document sources beyond the Federal Register. All proposed sources were validated by availability spikes (see `SPIKE_FINDINGS.md`). One source (GDELT diversity metrics) failed validation and was dropped. Sources are prioritized for integration based on category coverage breadth and implementation difficulty.

#### Source Inventory (Post-Spike)

| Source                               | API/Access                      | Volume                                                           | Historical Depth                                                                                                                                                                      | Categories Served                                    | Spike Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Federal Register** (existing)      | federalregister.gov API         | Varies by category                                               | 1994+                                                                                                                                                                                 | All categories                                       | Already integrated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **White House** (existing)           | whitehouse.gov RSS              | Variable                                                         | Variable                                                                                                                                                                              | executiveActions, civilService, infoAvailability     | Already integrated. **Content gap (validated 2026-03-03):** 4,323 documents stored as title + URL only; fetcher scrapes briefing-room page listings but never fetches article text. Content backfill via URL fetch is Phase 2 prerequisite. Archived administration URLs (trumpwhitehouse.archives.gov, bidenwhitehouse.archives.gov) require URL-mapping in the fetcher.                                                                                                                          |
| **GDELT** (existing)                 | GDELT DOC 2.0 API               | High                                                             | 2015+                                                                                                                                                                                 | mediaFreedom, military, rhetoric pipeline            | Already integrated. **Metadata-only source (validated 2026-03-03):** API returns title, URL, tone, domain, sourcecountry — no article text. Context 2.0 API provides matched sentences but is limited to 72-hour lookback (forward-only, cannot backfill baselines). 60K documents should be classified `contentType: 'metadata_only'` — excluded from Layer 2 assessment and Layer 3 embedding, retained for Layer 1 volume/tone structural analysis. See §Metadata-only document classification. |
| **CourtListener**                    | REST API v4, free, 5K req/hr    | 15-20/wk (judicial), 50-70/wk (law), 67-123/wk (civil liberties) | All federal courts, millions of opinions. Dual-document model: RECAP docket entries (structural) + judicial opinions (full text), linked by `case_id`; ~23% of dockets have opinions. | judicialIndependence, lawEnforcement, civilLiberties | **Strong pass**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **DOJ Press Releases**               | justice.gov JSON API            | 360-400/wk enforcement-relevant                                  | Archive available                                                                                                                                                                     | lawEnforcement                                       | **Strong pass**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **GovInfo/GAO**                      | REST API, free key, 36K req/hr  | 4-6 GAO reports/wk                                               | 1995+ (MODS XML metadata)                                                                                                                                                             | executiveOversight, fiscal                           | **Strong pass**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **IG RSS feeds** (DOD, HHS, DOJ OIG) | RSS                             | 5-10/wk                                                          | Varies by agency                                                                                                                                                                      | executiveOversight                                   | **Strong pass**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **LegiScan**                         | REST API (free tier)            | ~20 election bills/wk nationally                                 | 2009+, all 50 states                                                                                                                                                                  | elections                                            | **Strong pass** — operational, 1,826 bills in DB                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **FEC**                              | OpenFEC API, free key           | 5-8/wk (below Layer 1 threshold)                                 | MURs from 1999+                                                                                                                                                                       | elections                                            | **Pass** (supplementary — monthly aggregation)                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **FCC**                              | RSS feeds                       | 5-10 media-relevant/wk                                           | Archive available                                                                                                                                                                     | mediaFreedom                                         | **Pass** (supplementary)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ~~**GDELT diversity metrics**~~      | ~~Computed from existing data~~ | ~~N/A~~                                                          | ~~N/A~~                                                                                                                                                                               | ~~mediaFreedom~~                                     | **Failed** — wire syndication inflates domain counts; cannot measure media diversity                                                                                                                                                                                                                                                                                                                                                                                                               |
| **ACLU litigation tracker**          | Web scrape                      | TBD (supplementary)                                              | Years of case data                                                                                                                                                                    | civilLiberties                                       | Part of Spike 4 pass (CourtListener is primary)                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **DOJ Civil Rights Division**        | justice.gov/crt                 | Intermittent                                                     | Archive available                                                                                                                                                                     | civilLiberties                                       | Part of Spike 4 pass (supplementary)                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Oversight.gov**                    | HTML scraping only (no API)     | ~40 IG reports/wk (all 75 IGs)                                   | Aggregated                                                                                                                                                                            | executiveOversight                                   | Deferred — no API; community scraper spotty                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **CBO**                              | cbo.gov                         | Low                                                              | Reports archive                                                                                                                                                                       | fiscal                                               | Nice-to-have                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **VRL**                              | Tracker (2021+)                 | Expert classifications                                           | 2021+                                                                                                                                                                                 | elections                                            | Nice-to-have calibration dataset for LegiScan AI                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

#### Integration Priority

Sources are grouped by integration priority based on category coverage breadth, data quality, and implementation effort:

**P0 — Launch-critical (Sprint R-S1 core):**
| Source | Rationale | Implementation |
|---|---|---|
| CourtListener | Serves 3 categories (judicialIndependence, lawEnforcement, civilLiberties). Free, well-structured API. | REST API integration + NOS-code-based category routing |
| GovInfo/GAO API | Fixes executiveOversight thinness (5-15 → 15-30 docs/wk). Free, structured MODS XML. | REST API + MODS XML parser |
| DOJ Press Releases | Massively enriches lawEnforcement (360-400/wk). Open JSON API — major discovery. | JSON API integration |
| LegiScan | Anchor source for elections. Bulk API + SAST cross-state tracking — unique signal. | Operational at free tier. Weekly cron integration in Sprint R-S1e. |

**P1 — Enrichment (Sprint R-S1 or fast-follow):**
| Source | Rationale | Implementation |
|---|---|---|
| FCC RSS | Supplementary enrichment for mediaFreedom (~5-10/wk). Meets lower ≥5/wk bar. | RSS polling |
| FEC API | Unique institutional signal for elections (deadlock rate, quorum status, 2025 collapse). Monthly aggregation. | REST API, monthly batch |
| IG RSS feeds (3-4 agencies) | Supplements GovInfo for executiveOversight. Easy RSS integration. | RSS polling |

**P2 — Deferred (post-launch):**
| Source | Rationale | Implementation |
|---|---|---|
| Oversight.gov | All 75 IGs aggregated, but no API — scraping only, community scraper spotty. | HTML scraping |
| VRL partnership | Calibration dataset for LegiScan AI classification accuracy. Nice-to-have. | Data partnership |
| CBO reports | Low-volume supplementary signal for fiscal. | RSS or scrape |
| DHS/ICE/CBP statistics | Monthly enforcement tables (encounters, detention, removals) for immigrationEnforcement. Unique operational tempo signal — no other source captures this. | Excel/PDF download, quarterly batch processing |

#### Cross-Source Document Deduplication

With 7+ source types, the same underlying government document can arrive through multiple ingestion paths with different URLs. A GAO report might appear as both a `govinfo.gov/content/pkg/...` URL from the GovInfo API and a `gao.gov/products/GAO-26-...` URL from GAO RSS. Without dedup, this inflates Layer 1 volume counts and makes one document look like two independent observations — a different problem than the correlated-source issue (§Source Dependency Map), which handles genuinely _different_ documents about the same event.

**Duplication risk matrix:**

| Source A      | Source B              | Overlap Risk                                          | Mechanism                               |
| ------------- | --------------------- | ----------------------------------------------------- | --------------------------------------- |
| GovInfo API   | IG RSS feeds          | **High** — GovInfo aggregates IG reports              | Same report, different URL patterns     |
| GovInfo API   | GAO RSS               | **High** — GovInfo includes GAO reports               | Same report, different domains          |
| FCC ECFS API  | FCC RSS               | **Medium** — commission orders appear in both         | Different URL schemes for same document |
| DOJ API       | DOJ Civil Rights (P2) | **Medium** — CRT press releases overlap main DOJ feed | Subset overlap                          |
| CourtListener | SCOTUS RSS (if added) | **Low** — CourtListener already aggregates SCOTUS     | CourtListener is authoritative          |

**Deduplication strategy — `canonical_id`:**

Each fetcher extracts a source-native document identifier when one exists. This serves as a cross-URL dedup key.

```typescript
// Schema addition to documents table
canonical_id VARCHAR(255) NULLABLE  // e.g., "GAO-26-107283", "DOJ-PR-2025-1234"
// Unique constraint: UNIQUE(canonical_id, category) WHERE canonical_id IS NOT NULL
// Per-category, not global — same document can legitimately appear in multiple categories
// (primary + secondary routing, cross-feed). Matches existing (url, category) composite unique.

// Known canonical ID patterns per source:
// - GovInfo:        packageId from MODS XML (e.g., "GAOREPORTS-GAO-26-107283")
// - GAO RSS:        GAO report number from URL (e.g., "GAO-26-107283")
// - DOJ API:        uuid field from JSON response
// - CourtListener:  docket number + court (e.g., "courtlistener:1:24-cv-01234")
// - LegiScan:       bill_id from API (e.g., "legiscan:1234567")
// - FEC:            case_no from OpenFEC (e.g., "FEC-MUR-8012")
// - FCC ECFS:       filing ID from API (e.g., "fcc:1033142661477")
// - IG RSS:         report_id from feed or URL pattern (e.g., "dodig:DODIG-2026-001")
// - Federal Register: document_number (e.g., "FR-2026-01234")

function normalizeCanonicalId(sourceType: string, rawId: string): string {
  // Strip source-specific prefixes to enable cross-source matching
  // e.g., GovInfo packageId "GAOREPORTS-GAO-26-107283" → "GAO-26-107283"
  //        GAO RSS URL "/products/GAO-26-107283"        → "GAO-26-107283"
  // Normalization rules are source-pair-specific
}
```

**Dedup at ingestion time:**

```typescript
async function insertDocumentWithDedup(doc: IngestedDocument): Promise<'inserted' | 'duplicate'> {
  // 1. Check canonical_id if present (scoped to category)
  if (doc.canonicalId) {
    const normalized = normalizeCanonicalId(doc.sourceType, doc.canonicalId);
    const existing = await db.documents.findOne({
      canonical_id: normalized,
      category: doc.category,
    });
    if (existing) {
      // Log: duplicate detected, skip insert, record source_type that produced duplicate
      return 'duplicate';
    }
  }

  // 2. Fall back to URL uniqueness (existing composite unique on (url, category))
  // 3. Insert with normalized canonical_id
  await db.documents.insert({ ...doc, canonical_id: doc.canonicalId ? normalized : null });
  return 'inserted';
}
```

**Why per-category uniqueness, not global:** The documents table stores category-scoped rows — the same document can legitimately appear in multiple categories (primary + secondary routing, rhetoric cross-feed). A global `UNIQUE(canonical_id)` would break multi-category routing. The canonical*id's purpose is preventing cross-source duplication \_within a category* (e.g., GovInfo and GAO RSS both delivering the same report to executiveOversight), not preventing the same document from appearing in multiple categories.

**Distinct from `case_id`:** The `canonical_id` field prevents _cross-source duplication_ (same document from different sources; second insert blocked). The `case_id` field (Sprint R-CL1) provides _within-source event linking_ (different documents about the same case, e.g., a CourtListener docket entry and its judicial opinion; both exist as separate rows, but Layer 1 counts them as one case for volume metrics). Complementary purposes, both per-category scoped.

**Metadata-only document classification (validated 2026-03-03):** Some source types produce documents that are structurally valid (title, URL, date, category) but have no meaningful text content — they are metadata carriers, not content documents. The primary example is GDELT: 60K rhetoric documents with title + tone score but no article text (the DOC 2.0 API does not return article body; the Context 2.0 API provides matched sentences but only covers a 72-hour rolling window, making it useless for historical backfill). These documents have real analytical value for Layer 1 (volume counting, tone aggregation, source convergence denominators) but produce noise in Layer 2 (Pass 1 on a 10-word title is meaningless) and Layer 3 (title-only embeddings degrade centroid quality — 60K 5-word vectors mixed with full-text vectors).

The fix is a `contentType` field on the documents table: `'full_text' | 'metadata_only'`. Pipeline behavior by content type: (a) Layer 1 structural analysis — both types contribute to volume counts and source-type dimensions. (b) Layer 2 AI assessment — `metadata_only` documents are skipped entirely; `validate:data` reports them separately from content documents. (c) Layer 3 thematic drift — `metadata_only` documents are excluded from embedding and centroid computation. (d) Embedding pipeline — `metadata_only` documents are not embedded (or existing embeddings are dropped). Current `metadata_only` population: ~60K GDELT rhetoric documents. RSS headline-only documents (7,197) and CourtListener docket entries with only NOS-code content (~139K after opinion backfill) are borderline — they have _some_ content but very little. For launch, classify RSS and CL docket entries as `full_text` (they do have content, even if short) and revisit after baseline computation reveals whether their embeddings are helping or hurting Layer 3. The `validate:data` output should distinguish: documents with full content, documents with minimal content (< 100 chars), and metadata-only documents.

**Design decisions:**

- **First-in wins**: whichever source delivers the document first gets the record. No merging of metadata across sources — this avoids complexity and the record already has a `source_type` tag.
- **Nullable**: Documents without a discoverable canonical ID (some RSS entries with no document number) fall back to URL-only dedup. This accepts a small residual duplication risk for low-structure sources.
- **Normalization is source-pair-specific**: The `normalizeCanonicalId` function handles known cross-source ID mappings (GovInfo packageId → GAO report number). New source pairs require explicit normalization rules — this is intentional, not a framework that guesses.
- **Monitoring**: Coverage health (§Sprint R-S1 Phase 1) should track duplicate-rejection rate per source pair. A sudden drop in duplicates may indicate one source changed its ID scheme; a sudden rise may indicate a new overlap path.

#### Key Spike Findings That Affect Architecture

Several spike findings have architectural implications beyond simple source addition:

**1. "Absence is the signal" pattern.** Multiple sources show that the _drop_ in output is the democratic erosion signal:

- FEC: Only 1 MUR opened in all of 2025 (vs. 77-222/year historically). FEC lost quorum April 30.
- IG reports: Trump fired 17 IGs in one night (Jan 24, 2025). Report volume likely declining.
- GAO: ~126 staffers lost to continuing resolution budget pressure.

Layer 1 handles volume drops naturally (a drop from baseline volume produces a large z-score), but **structural dampening must not suppress volume collapse signals.** The dampening formula (`min(docCount, 10) / 10`) is designed to reduce noise in small-corpus categories — but it would also reduce the score when a _previously healthy_ category goes silent. This creates a blind spot exactly when the system should be most sensitive.

**Codified rule — asymmetric dampening bypass:**

```typescript
const VOLUME_COLLAPSE_FRACTION = 0.25; // 25% of cycle-aware baseline mean

function computeDampeningFactor(
  docCount: number,
  cycleAwareBaselineMean: number, // baseline mean for this cycle position (not global mean)
): number {
  // Volume collapse bypass: if current volume is <25% of cycle-aware baseline mean,
  // the silence itself is the signal — do NOT dampen.
  // Uses cycle-aware mean to avoid false collapse triggers during expected seasonal dips
  // (e.g., LegiScan off-session, court recess periods).
  if (docCount < cycleAwareBaselineMean * VOLUME_COLLAPSE_FRACTION) {
    return 1.0; // full weight — collapse is meaningful
  }

  // Normal dampening: reduce noise for small-corpus categories
  return Math.min(docCount, STRUCTURAL_MIN_DOC_COUNT) / STRUCTURAL_MIN_DOC_COUNT;
}
```

This rule has a clear semantic: dampening applies to categories that are _inherently_ small (courts has always had 5-15 FR docs/week) but NOT to categories experiencing _collapse_ (FEC going from 5/week to 0/week, or executiveOversight dropping after IG firings). The comparison uses the **cycle-aware baseline mean** (baseline mean for the current cycle position), not a global annual mean — this prevents false collapse triggers during expected seasonal dips (e.g., LegiScan during legislative off-season, CourtListener during court recess). The `VOLUME_COLLAPSE_FRACTION` threshold is versioned alongside other calibration constants. **Unit test requirement:** verify that a source type with cycle-aware baseline mean of 50 docs/week dropping to 1 doc/week produces a strong negative z-score with dampeningFactor = 1.0, not 0.1.

**2. Cross-source convergence as a first-class signal.** When multiple source types show anomalies in the same category simultaneously — e.g., CourtListener filing volume spikes, DOJ press releases shift topic, and FR rulemaking changes — that cross-source agreement is itself a powerful signal, distinct from the existing within-source structural dimensions. See §Layer 1 for the multi-source structural analyzer design.

**3. Publication cadence differences.** FR is daily/predictable. Court opinions are irregular. State legislatures are highly seasonal (heavy January–June, light after session ends). FEC enforcement is quarterly. Layer 1 baselines need **source-type-specific cycle-aware normalization**, extending the existing cycle-position adjustment to account for per-source seasonality patterns.

**4. Cross-source event linking.** A DOJ press release about a selective prosecution case may correspond to a CourtListener filing in the same matter. A LegiScan bill that passes may generate FR rulemaking. These are the same event observed from different institutional vantage points. The system should treat them as **linked observations that strengthen convergence** rather than independent signals that inflate volume. Implementation: partially addressed for CourtListener via `case_id` linking (Sprint R-CL1) — docket entries and opinions for the same case are linked and deduplicated in Layer 1 volume counts. Cross-source linking (e.g., DOJ press release ↔ CourtListener filing for the same matter) remains deferred to R-F (future) — tracked as a known limitation for launch.

**5. Snapshot pipeline completeness (Sprint R-S1e).** The daily snapshot fetches the latest 20 items per signal — a fixed-page-count strategy with no awareness of what's already in the database. For high-volume signals, this causes routine silent data loss: CourtListener/civilLiberties averages 38 docs/day (snapshot captures ~20), FR/infoAvailability peaks at 159/day (snapshot captures ~20). The backfill pipeline uses paginated `fetchHistorical` and captures everything, but real-time monitoring has gaps between backfills. Sprint R-S1e replaces the "fetch latest 20" strategy with incremental backfill: query last stored date per source/category, fetch everything since `lastDate - 2 days` using existing `fetchHistorical` variants, paginate fully. The snapshot/backfill distinction collapses — every daily run brings the DB up to date. A DB-based cron lock prevents overlapping runs during catch-up after outages. See ROADMAP §Sprint R-S1e.

#### LegiScan Status

LegiScan is operational at the free tier. Fetcher (`legiscan-fetcher.ts`, 207 lines), bulk import (`legiscan-bulk.ts`, 278 lines), and data are already in place: 332 sessions from all 50 states + DC + PR, 693,905 total bills downloaded, 1,826 classified across 14 categories (T1: 627, Biden: 515, T2: 676). API key is in `.env.local`.

**Remaining for pipeline integration (Sprint R-S1e):**

1. LegiScan runs as a separate weekly cron (not through the signal/feed-fetcher pattern — session-based ZIP downloads don't fit `fetchSignalInner`). Weekly cron checks `dataset_hash` for changes, downloads updated sessions, runs Layer 2 on new bills, records source health and fetch_log.
2. Re-classify bills for immigrationEnforcement + mediaFreedom (categories not defined when bulk import ran)
3. Current classification is keyword-based (ASSESSMENT_RULES matching), not the architecture-proposed subject-tag filtering — adequate for launch, subject-tag upgrade is a refinement
4. Wrap `legiscan-fetcher.ts` API calls with `fetchWithRetry` for transient failure handling

**$1K/yr national account (nice-to-have, not blocking):** The free tier already includes the Bulk API (`getDatasetList`, `getDataset`) with 30,000 queries/month — ~60× headroom over our ~500/month ongoing usage. The national account adds `getSearchRaw` with `state=ALL` and SAST cross-state tracking. Fundable through GitHub Sponsors / Open Collective if desired. The national account adds convenience and SAST propagation analysis, not data access.

#### Baseline Recomputation Strategy

Adding sources requires computing **new source-type-specific baselines** for affected categories. Existing FR-based baselines are preserved (source expansion is additive under the per-source-type baseline segregation design):

| Category               | New Sources                                             | Baseline Action                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| executiveActions       | No change                                               | Preserve existing FR baselines                                                                                                                                                                                                                                                                                                                                        |
| rulemaking             | No change                                               | Preserve existing FR baselines                                                                                                                                                                                                                                                                                                                                        |
| civilService           | No change                                               | Preserve existing FR baselines                                                                                                                                                                                                                                                                                                                                        |
| judicialIndependence   | CourtListener (15-20/wk)                                | Add CourtListener source-type baselines. Preserve FR baselines.                                                                                                                                                                                                                                                                                                       |
| elections              | LegiScan (~20/wk), FEC (monthly)                        | Add LegiScan + FEC source-type baselines. Preserve FR baselines.                                                                                                                                                                                                                                                                                                      |
| lawEnforcement         | CourtListener (50-70/wk), DOJ API (360-400/wk)          | New category — full computation from scratch, two source types. CL dual-document model: docket entries (structural) + opinions (content for L2/L3), linked by `case_id`, volume-deduplicated in Layer 1. FR backfill needed (`fr_doj` signal added after initial FR backfill).                                                                                        |
| civilLiberties         | CourtListener NOS 440 (67-123/wk) + text-search signals | New category — full computation from scratch. CL dual-document model (same as lawEnforcement). Text-search signals (e.g., `cl_first_amendment`) must use quoted/scoped queries to fit within pagination cap — see §CourtListener ingest strategy. FR backfill needed (`fr_civil_rights` signal added after initial FR backfill).                                      |
| mediaFreedom           | FCC RSS (5-10/wk)                                       | Add FCC source-type baselines. Preserve FR + GDELT baselines. FR backfill needed (`fr_press_foia`, `fr_foia_compliance` signals added but FR backfill not re-run). **Currently zero documents total** — the only non-intent category that is completely empty. FCC RSS signals configured in R-S1b but never produced documents; require verification before Phase 2. |
| infoAvailability       | No change                                               | Preserve existing FR baselines                                                                                                                                                                                                                                                                                                                                        |
| fiscal                 | GAO (via GovInfo, 4-6/wk)                               | Add GovInfo source-type baselines. Preserve FR baselines.                                                                                                                                                                                                                                                                                                             |
| executiveOversight     | GovInfo/GAO (4-6/wk), IG RSS (5-10/wk)                  | Add GovInfo + IG source-type baselines. Preserve FR baselines.                                                                                                                                                                                                                                                                                                        |
| military               | No change                                               | Preserve existing FR baselines                                                                                                                                                                                                                                                                                                                                        |
| immigrationEnforcement | FR (DHS/ICE/CBP agencies) + GDELT (via cross-feed)      | New category — full computation from scratch. FR-only volume is thin (~5-6/wk); GDELT cross-feed essential for convergence scoring. 2 FR signals (fr_dhs_immigration, fr_cbp_enforcement). DHS monthly statistical tables deferred to Phase 5 (no API, Excel/PDF downloads only). Adding in R-S1d.                                                                    |

5 categories preserve existing baselines unchanged. 5 existing categories add new source-type baselines alongside existing ones. 3 new categories (lawEnforcement, civilLiberties, immigrationEnforcement) require full baseline computation from scratch.

**Cost note:** Baseline computation for new source types involves Layer 2 AI costs for _new documents only_. Existing FR documents in renamed categories (judicialIndependence, executiveOversight) already have Pass 1 and Pass 2 assessments from Sprint R3-RUN — those are preserved. Estimated new-source Layer 2 cost: ~$30-60 across all affected categories, depending on document volumes during baseline periods.

---

### Architecture Overview

```
All Document Sources
  │  Existing: FR, PRESDOCU, GDELT, WH
  │  Validated: CourtListener, DOJ API, GovInfo/GAO, IG RSS, LegiScan, FEC, FCC RSS
  │
  ├──→ Layer 1: STRUCTURAL ANOMALY DETECTION (deterministic, language-immune)
  │    Source-type-specific structural analyzers (FR dimensions ≠ CourtListener dimensions ≠ LegiScan dimensions)
  │    Per-source-type baseline distributions with source-specific cycle-aware normalization
  │    Cross-source convergence scoring (2+ source types anomalous = strong signal)
  │    Outputs: per-source-type scores, cross-source convergence, category composite
  │
  ├──→ Layer 2: AI TWO-PASS ASSESSMENT (meaning-sensitive, every document)
  │    Pass 1 (cheap model): relevance classification
  │    Pass 2 (reasoning model): assessment of flagged documents
  │    Outputs: flag rate, concern distribution, cited reasoning
  │
  ├──→ Layer 3: THEMATIC DRIFT DETECTION (embedding-based, language-resilient)
  │    Per-source-type embedding baselines (FR centroids ≠ CourtListener centroids ≠ LegiScan centroids)
  │    Intra-administration rolling window comparison per source type
  │    Outputs: per-source-type drift scores, category aggregate
  │
  └──→ CONVERGENCE SYNTHESIS
       Combines all three layers into category status
       Outputs: Stable / Elevated / Divergent / Confirmed Concern / Baseline Invalid
       │
       └──→ AI NARRATIVE GENERATION (Opus 4.6 Extended Thinking)
            Produces weekly discussion at expert and public reading levels
            Only for categories at Elevated or above
```

Each layer is independent — it produces its own signal using its own method. No layer gates another layer. The convergence synthesis combines them. This means:

- A content shift in structurally normal documents is caught by Layer 2 and Layer 3 even though Layer 1 sees nothing unusual
- A volume anomaly or institutional function shift is caught by Layer 1 even though Layers 2 and 3 see nothing unusual (e.g., OPM stops publishing Excepted Service notices — no content to analyze, but the absence is a structural signal)
- An administration using novel language is caught by Layer 2 (AI reads for meaning) even though no keyword dictionary contains the new terms
- Silence (expected documents not appearing) is caught by Layer 1 without any content analysis at all
- Gradual escalation within an administration is caught by Layer 3's rolling window even though each individual week looks similar to the last

---

### Layer 1: Structural Anomaly Detection

**Method**: Statistical comparison of document metadata against baseline distributions. No content analysis, no AI, no keywords. Fully deterministic — the same inputs always produce the same outputs.

#### Multi-Source Structural Analysis

The original Layer 1 was designed around Federal Register metadata — document types, agency actions, comment periods. With the addition of CourtListener, DOJ press releases, LegiScan, FEC, GovInfo/GAO, and FCC, a single set of structural dimensions no longer applies. Court opinions don't have comment periods. Legislative bills don't have FR document types. FEC enforcement cases are quarterly, not weekly.

**Design: source-type-specific structural analyzers.** Each source type defines its own set of structural dimensions suited to its metadata structure and publication patterns. The category-level structural score aggregates across source types, and **cross-source convergence** — multiple source types showing anomalies in the same category simultaneously — becomes a powerful signal in itself.

#### Source-Type Structural Dimensions

**Implementation phasing:** The full dimension set below (29 dimensions across 7 source types) is the target architecture. Sprint R-S1 should start with a reduced set: **volume + 1-2 source-specific dimensions per source type** (e.g., volume + NOS distribution for CourtListener; volume + internal topic distribution for DOJ; volume + SAST velocity for LegiScan). This gives ~14 dimensions total — comparable to the current FR-only system's 6. Expand to the full set after initial calibration validates that the cross-source aggregation formula and convergence scoring work correctly. This avoids the risk of calibrating 29 dimensions simultaneously before the aggregation machinery is proven.

**Federal Register (existing):**

| Dimension                   | Metric                                                                                                                        | Baseline Comparison                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Volume**                  | Document count per category                                                                                                   | z-score against baseline mean/stddev for this cycle position                                                                                                                                                                                                                                                                                                                                                                                |
| **Type Composition**        | Ratio of document types (rule, notice, proposed rule, presidential document, etc.)                                            | Chi-squared or KL divergence against baseline type distribution                                                                                                                                                                                                                                                                                                                                                                             |
| **Functional Distribution** | Ratio of institutional function buckets (rulemaking, personnel action, administrative procedure, organizational change, etc.) | Chi-squared or KL divergence against baseline functional distribution                                                                                                                                                                                                                                                                                                                                                                       |
| **Agency Activity**         | Which agencies published, and how much                                                                                        | Jaccard similarity of active agencies vs. baseline; per-agency volume deviation                                                                                                                                                                                                                                                                                                                                                             |
| **Publication Tempo**       | Documents per day within the week                                                                                             | Variance and pattern comparison                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Source Convergence**      | Ratio of government documents to news coverage (GDELT) to announcements (WH)                                                  | Deviation from baseline ratio. **Note:** GDELT is classified `metadata_only` — contributes to volume/tone ratios for source convergence but is excluded from Layer 2 and Layer 3. GDELT coverage only extends to 2015 and source list changes over time. Source convergence baselines using GDELT should be computed from 2017+ data only, and the UI/narrative should not imply long-horizon baseline claims from GDELT earlier than this. |

**CourtListener:**

_Dual-document model (decided 2026-03-03, Sprint R-CL1):_ CourtListener data consists of two distinct document types per case: **docket entries** ("case filed" — structural event at filing date) and **judicial opinions** ("case decided" — substantive ruling at decision date, potentially months later). These are ingested as separate document rows linked by a `case_id` field (format: `cl:{docket_id}`). This distinction matters because a filing in January 2025 represents institutional pushback _at that moment_, while an opinion in September 2025 represents judicial constraint _at that moment_. They belong on different weeks because they happened on different weeks.

_Ingest strategy:_ Primary ingest is **RECAP dockets**, because NOS (Nature of Suit) codes are only reliably present on RECAP docket entries. NOS codes are the routing mechanism for category assignment: NOS 440 (civil rights - other) → civilLiberties; selective prosecution and enforcement NOS codes → lawEnforcement; APA/injunction dockets → judicialIndependence. **Opinions are ingested as companion documents** via the opinions search API (`type=o`), linked to their parent docket by `case_id`. Opinions inherit category assignment from their parent docket's NOS code. ~23% of dockets have linked opinions (~25K of 112K unique dockets). Opinion text (full judicial reasoning, ~10-150KB) provides the content that Layers 2 and 3 need; docket entries provide the structural metadata that Layer 1 needs.

_Layer 1 volume deduplication:_ Structural volume counting deduplicates by `case_id` — a docket entry and its opinion count as one case, not two documents. This prevents opinion ingestion from inflating volume-based anomaly detection. The dedup uses `case_id` when present, falling back to URL for non-CL documents: `documentCount = new Set(rows.map(r => r.caseId ?? r.url)).size`. Layers 2 and 3 see both documents independently — the docket entry and opinion carry genuinely different content and temporal meaning.

_Content reality (validated 2026-03-03):_ All 164K existing CL docket entries have ~30 characters of NOS code description as "content" — effectively content-less for embedding quality and AI assessment. The 3,810 reported as "null content" is the difference between literally NULL and a 30-char NOS string. Opinion backfill (Sprint R-CL1) adds full judicial reasoning text to ~25K companion documents, dramatically improving Layer 2 and Layer 3 quality for CL-heavy categories.

_Pagination constraint for text-search signals:_ CourtListener text-search queries (e.g., `cl_first_amendment`) must be scoped tightly enough that peak weekly results fit within the API pagination cap (200 results at maxPages=10). Unscoped or unquoted queries can return orders of magnitude more results than the cap allows, causing the pipeline to capture a biased random sample rather than the full set. **Design rule:** all text-search queries must use quoted phrases and qualifying terms to keep peak weekly volume below the pagination cap. NOS-code-based signals are less vulnerable (each NOS code is a narrow filter), but high-volume NOS codes (440, 530, 890) can occasionally exceed the cap in peak weeks — maxPages should be set with headroom (e.g., 15 instead of 10) for codes with known weekly peaks above 200. **Validated 2026-03-03:** civilLiberties peak=680 and lawEnforcement peak=838 against cap=300. Truncation is systemic in Trump T1 (37% of all weeks exceed cap, 2017-2018 avg 430-530/week). 72% URL overlap between the two categories via shared NOS 440 — deduplicating the NOS 440 query (fetch once, route to both categories) would halve API budget and improve completeness. Sprint-level fix: restructure CL ingestion to fetch NOS 440 once with sufficient maxPages (~45), route to both categories via `(url, category)` composite unique. Truncation is _consistent_ across all periods — baselines and monitoring data are both truncated at the same cap, so comparisons remain apples-to-apples until the fix ships.

| Dimension                     | Metric                                                                                                          | Baseline Comparison                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Filing Volume**             | Unique cases per category per week (deduplicated by `case_id` — docket entry + opinion = one case), by NOS code | z-score against baseline                                  |
| **Opinion Type Distribution** | Ratio of opinion types (published, unpublished, orders, memoranda)                                              | KL divergence                                             |
| **Court Level Distribution**  | District vs. Circuit vs. Supreme Court filings                                                                  | Chi-squared                                               |
| **Injunction Rate**           | Fraction of docket entries that are injunctions or TROs (from docket entry type metadata, not text heuristics)  | z-score (spike finding: injunctions vs. agencies up 163%) |
| **Case Disposition Patterns** | Granted/denied/dismissed ratios                                                                                 | Chi-squared                                               |

**DOJ Press Releases:**

_Taxonomy strategy:_ DOJ's API returns `topic` and `component` fields that may change over time as DOJ reorganizes its own labeling. To prevent DOJ taxonomy changes from appearing as structural anomalies, freeze a **stable internal mapping** from DOJ topics/components into 10-20 durable internal buckets (e.g., "civil rights enforcement," "financial fraud," "national security," "immigration enforcement," "public corruption," "drug enforcement," etc.). Track changes in DOJ's own topic labeling separately as a **coverage health** signal — if DOJ changes its taxonomy, the system logs the change rather than interpreting it as a shift in enforcement priorities.

| Dimension                       | Metric                                                                                      | Baseline Comparison                          |
| ------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Release Volume**              | Enforcement-relevant releases per week                                                      | z-score against baseline                     |
| **Internal Topic Distribution** | Distribution across stable internal enforcement buckets (mapped from DOJ topics/components) | KL divergence                                |
| **Agency Attribution**          | Which DOJ components (FBI, DEA, ATF, Civil Rights Division, etc.)                           | Jaccard similarity + per-component deviation |

**LegiScan:**

_Baseline strategy:_ Baselines at two resolutions: (1) **national aggregate** (sum across all 50 states) — stable enough for weekly structural analysis because cross-state summation naturally smooths per-state session seasonality; (2) **SAST propagation velocity** computed nationally as a first-class structural signal. Per-state baselines are deferred — 50 different session calendars (year-round, biennial, special sessions, carryover rules) make per-state normalization a significant calibration effort. The national aggregate may be dominated by high-volume states (CA, TX, NY, FL); monitor for concentration and consider volume-weighting if a few states drive >50% of the signal.

| Dimension                           | Metric                                                                          | Baseline Comparison                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Bill Introduction Volume**        | Election-relevant bills per week nationally (subject-tag filtered)              | z-score against baseline (national aggregate smooths per-state seasonality)    |
| **Status Progression Distribution** | Fraction of bills reaching Engrossed/Enrolled/Passed vs. dying in committee     | Chi-squared against baseline passage rates                                     |
| **Sponsor Party Composition**       | Partisan vs. bipartisan sponsorship ratios                                      | z-score on partisanship index                                                  |
| **SAST Propagation Velocity**       | Number of states introducing "Same As" / "Similar To" versions of the same bill | z-score — unique signal: tracks model legislation spread. Computed nationally. |
| **Bill Type Distribution**          | Shifts from Bills to Joint Resolutions or Constitutional Amendments             | KL divergence                                                                  |

**FEC (monthly aggregation):**

_Staleness handling:_ FEC data is batched monthly but the weekly snapshot pipeline runs weekly. On non-batch weeks, the FEC structural analyzer produces **null** (not a carried-forward score). This prevents a stale FEC anomaly from being counted as "agreeing" with a fresh CourtListener anomaly in the cross-source convergence calculation. The convergence formula counts FEC as an active source only in the week its monthly batch is processed. In non-batch weeks, `totalSourceCount` excludes FEC.

| Dimension              | Metric                                                            | Baseline Comparison                                              |
| ---------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Enforcement Volume** | MURs + admin fines per month                                      | z-score (note: quarterly natural cadence)                        |
| **Deadlock Rate**      | Fraction of commission votes resulting in deadlock                | z-score (spike finding: 5% pre-2008, 24% post-2008, 45% in 2013) |
| **Penalty Magnitude**  | Distribution of fine amounts                                      | KL divergence                                                    |
| **Quorum Status**      | Binary institutional health signal (commissioners ≥ 4 for quorum) | Binary flag — 2025 quorum collapse is itself a signal            |

**GovInfo/GAO + IG Reports:**

| Dimension                    | Metric                                                         | Baseline Comparison                                          |
| ---------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| **Report Volume**            | GAO reports + IG reports per week                              | z-score against baseline                                     |
| **Report Type Distribution** | Audits vs. evaluations vs. management advisories vs. testimony | KL divergence                                                |
| **Agency Coverage**          | Which agencies have active IG reports                          | Jaccard similarity — agencies losing IG coverage is a signal |
| **Recommendation Counts**    | Recommendations per report (where available in MODS XML)       | z-score                                                      |

**FCC:**

| Dimension           | Metric                                       | Baseline Comparison                            |
| ------------------- | -------------------------------------------- | ---------------------------------------------- |
| **Document Volume** | Media-relevant commission documents per week | z-score (supplementary — lower bar at ≥5/week) |
| **Document Type**   | Orders vs. NOPRMs vs. enforcement actions    | KL divergence                                  |

#### Category-Level Aggregation

Each category may receive documents from multiple source types. The category-level structural score is computed as:

1. **Per-source-type scores**: Each source type's structural analyzer produces its own composite score using the dimensions defined above. These are computed independently with source-type-specific baselines.

2. **Source influence capping**: No single source type may dominate the category composite. Each source type's contribution is capped at `SOURCE_MAX_WEIGHT` (e.g., 0.4 = 40%) of the category composite, regardless of document volume. This prevents DOJ at 360-400 docs/week from drowning out CourtListener at 50-70 docs/week in lawEnforcement. The cap is relaxed only when cross-source convergence is present — if multiple sources agree, their combined signal is amplified rather than capped.

3. **Source-mix composition**: Track the proportion of each source type within the category each week (e.g., "lawEnforcement this week was 75% DOJ, 20% CourtListener, 5% FR" vs. baseline "60% DOJ, 30% CourtListener, 10% FR"). Significant composition shifts — even without per-source anomalies — indicate that the category's institutional view is changing. This is a category-level Layer 1 dimension (KL divergence of source-type proportions against baseline). It also aids interpretation of cross-source convergence: "two sources anomalous" is more meaningful when neither source was recently added or newly dominant.

4. **Cross-source convergence**: When 2+ source types in the same category both show anomalies, this is a strong signal — independent institutional vantage points are agreeing. The convergence scoring formula:

```typescript
function computeCrossSourceConvergence(
  sourceScores: Record<SourceType, SourceTypeScore>,
): CrossSourceConvergence {
  const sources = Object.values(sourceScores).filter((s) => s.documentCount > 0);
  const anomalous = sources.filter((s) => s.anomalous);

  // Base convergence: fraction of active sources that are anomalous
  const convergenceFraction = anomalous.length / sources.length;

  // Agreement strength: minimum z-score among anomalous sources
  // (the weakest agreeing signal sets the floor — all must clear it)
  const agreementStrength =
    anomalous.length >= 2 ? Math.min(...anomalous.map((s) => Math.abs(s.composite))) : 0;

  // Convergence score: 0 if <2 sources anomalous; scales with both
  // the fraction of agreeing sources and the strength of agreement
  const convergenceScore =
    anomalous.length >= 2
      ? convergenceFraction * Math.min(agreementStrength / STRUCTURAL_ANOMALY_THRESHOLD, 2.0)
      : 0;

  return {
    anomalousSourceCount: anomalous.length,
    totalSourceCount: sources.length,
    convergenceScore, // 0-1+, where >1.0 indicates strong multi-source agreement
    agreementStrength, // minimum z-score among anomalous sources
  };
}
```

**Implementation note:** The pseudocode above computes raw convergence. Before use in the category composite, apply the **source dependency map** (see §Source Dependency Map below): when only 2 source types are anomalous and they form a dependency pair (DOJ↔CourtListener, FR↔GDELT, LegiScan↔FR), multiply `convergenceFraction` by 0.75. When a third independent source corroborates, apply full weight. The dependency pairs are initial estimates — validate empirical co-occurrence rates during R-S1 calibration and adjust if actual correlation differs from assumed.

**"Active source" definition for convergence denominator:** A source type is _active_ in a given week's convergence calculation only if it meets all of: (a) at least one document ingested for this category in the current week, (b) not in a known staleness window (FEC: non-batch weeks → exclude), (c) not in a known outage state (fetch_log records HTTP failure for all signals of this source type → exclude with coverage health alert, not convergence penalty). Sources excluded due to seasonal dip (LegiScan legislative off-session, CourtListener court recess) are also excluded from `totalSourceCount` — their absence is expected, not informative. This prevents the convergence denominator from being unstable week-to-week due to source cadence differences. The determination of expected vs. unexpected silence uses the source-type-specific cycle-aware baseline: if the current week's cycle position historically has near-zero documents for a source type, that source is seasonal-dip excluded.

5. **Category composite**: Weighted combination of per-source-type scores + convergence bonus. Weights are per-category (since different categories rely on different source mixes), fixed, and versioned. The composite preserves the source-type breakdown for diagnostic purposes.

```typescript
function computeCategoryComposite(
  sourceScores: Record<SourceType, SourceTypeScore>,
  convergence: CrossSourceConvergence,
  categoryWeights: Record<SourceType, number>, // per-category, versioned
): number {
  // Cap each source type's contribution
  const cappedScores = Object.entries(sourceScores).map(([type, score]) => ({
    type,
    weight: Math.min(categoryWeights[type] || 0, SOURCE_MAX_WEIGHT),
    score: score.composite,
  }));

  // Normalize weights to sum to 1.0 (after capping)
  const totalWeight = cappedScores.reduce((sum, s) => sum + s.weight, 0);
  const baseComposite = cappedScores.reduce(
    (sum, s) => sum + (s.weight / totalWeight) * s.score,
    0,
  );

  // Convergence bonus: amplify when multiple sources agree
  // (multiplicative, so it only matters when baseComposite is already elevated)
  const CONVERGENCE_BONUS_WEIGHT = 0.3;
  return baseComposite * (1 + CONVERGENCE_BONUS_WEIGHT * convergence.convergenceScore);
}
```

**Source dependency map (correlated noise guardrail):** Cross-source convergence assumes source types are independent. In practice, some sources are causally linked: a DOJ prosecution generates both a DOJ press release and a CourtListener filing; a legislative event triggers FR rulemaking and GDELT coverage. When linked sources both show anomalies, the convergence score can overstate confidence by treating correlated observations as independent evidence.

Until full cross-source event linking is implemented (deferred to R-F), a cheap guardrail: define **dependency pairs** where convergence weight is reduced unless corroborated by a third independent source.

| Source Pair                        | Dependency                                             | Convergence Treatment                                                                   |
| ---------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| DOJ press releases ↔ CourtListener | DOJ releases often correspond to CourtListener filings | Treat as 1.5 sources (not 2) unless a third source (FR, GDELT, LegiScan) also anomalous |
| FR rulemaking ↔ GDELT coverage     | Regulatory actions generate news coverage              | Treat as 1.5 sources unless a third source corroborates                                 |
| LegiScan ↔ FR                      | Passed legislation can trigger FR rulemaking           | Treat as 1.5 sources unless a third source corroborates                                 |

In `computeCrossSourceConvergence()`, when only 2 source types are anomalous and they form a dependency pair, multiply `convergenceFraction` by 0.75 (reducing the convergence score to reflect partial dependence). When a third independent source corroborates, apply full weight. This is conservative — it may undercount some genuine convergence, but it avoids the worse failure mode of amplifying correlated noise.

**Implementation note:** The `StructuralScore` interface below is the **target state for Sprint R-S1**. The current implementation (`lib/types/structural.ts`) uses a simpler single-source-type structure with `dimensions: Record<string, DimensionScore>`. The R-S1 migration adds `sourceScores` and `crossSourceConvergence` while preserving backward compatibility — FR-only categories continue working with a single source type entry.

```typescript
interface StructuralScore {
  composite: number; // 0-1 normalized deviation score (after dampening)
  rawComposite: number; // pre-dampening score
  dampeningFactor: number; // min(docCount, STRUCTURAL_MIN_DOC_COUNT) / STRUCTURAL_MIN_DOC_COUNT
  documentCount: number; // total documents this category-week (all source types)

  // Per-source-type breakdown
  sourceScores: Record<SourceType, SourceTypeScore>;

  // Cross-source convergence (2+ source types anomalous = strong signal)
  crossSourceConvergence: {
    anomalousSourceCount: number; // how many source types are individually anomalous
    totalSourceCount: number; // how many source types contributed documents
    convergenceScore: number; // 0-1+, higher = more source types agreeing (>1.0 = strong)
    agreementStrength: number; // minimum z-score among anomalous sources (floor of agreement)
  };

  anomalous: boolean; // composite exceeds threshold
  baselineComparison: string; // "Biden 2022 week 14" or "cycle-position average"

  // Long-horizon drift (catches "low and slow" capture)
  longHorizon: {
    fixedBaselineDistance: number; // composite deviation from fixed historical baseline
    fixedBaseline: string; // e.g., "Biden 2022"
    cumulativeDeviation: number; // sum of weekly composite deviations over trailing window
    cumulativeWindow: number; // trailing window size in weeks (e.g., 12)
    driftTrend: 'stable' | 'increasing' | 'decreasing'; // direction of cumulative deviation
  };
}

interface SourceTypeScore {
  sourceType: SourceType; // 'federal_register' | 'courtlistener' | 'doj_press' | 'legiscan' | etc.
  composite: number; // composite score for this source type
  documentCount: number;
  dimensions: Record<string, DimensionScore>; // source-type-specific dimensions
  anomalous: boolean;
}

type SourceType =
  | 'federal_register'
  | 'courtlistener'
  | 'doj_press'
  | 'legiscan'
  | 'fec'
  | 'govinfo_gao'
  | 'ig_reports'
  | 'fcc'
  | 'gdelt'
  | 'whitehouse';

interface DimensionScore {
  value: number; // raw metric value
  baselineMean: number;
  baselineStdDev: number;
  zScore: number; // standard deviations from baseline
  percentile: number; // where this falls in baseline distribution (spec-only; impl uses zScore)
}

interface FunctionalDimensionScore extends DimensionScore {
  bucketDistribution: Record<string, number>; // current week: { "Rulemaking": 0.18, "Personnel Action": 0.05, ... }
  baselineDistribution: Record<string, number>; // baseline: { "Rulemaking": 0.16, "Personnel Action": 0.03, ... }
  significantShifts: FunctionalShift[]; // buckets that moved beyond threshold
}

interface FunctionalShift {
  bucket: string; // e.g., "Personnel Action"
  baselineRate: number; // e.g., 0.03
  currentRate: number; // e.g., 0.12
  direction: 'increased' | 'decreased' | 'absent'; // 'absent' for buckets that dropped to zero
}
```

#### Source-Specific Cycle-Aware Baselines

Different sources have different publication cadences that must be normalized independently:

- **Federal Register**: Daily publication, predictable weekly cadence. Existing cycle-position adjustment works.
- **CourtListener**: Irregular timing. Seasonal dips during court recesses (August, holiday periods). Baseline distributions must account for judicial calendar.
- **LegiScan**: Highly seasonal — state legislative sessions vary widely (year-round, biennial, special sessions, carryover rules). National aggregate naturally smooths per-state seasonality but may be dominated by high-volume states. Use national aggregate for weekly baselines; per-state session-aware normalization deferred to R-F.
- **FEC**: Quarterly natural cadence, plus election-cycle effects (midterm years ~2× off-years). Monthly aggregation with cycle-year normalization.
- **GovInfo/GAO**: Relatively steady, with fiscal-year-end spikes. Normalize to federal fiscal year position.
- **FCC**: Moderate seasonality. Standard weekly baselines sufficient.

Each source type stores its own baseline distributions with its own cycle-position normalization. The category-level aggregation handles the combination.

**Long-Horizon Drift** — detecting gradual capture:

Week-to-week anomaly detection has a fundamental blind spot: an administration can shift gradually so that each week looks normal relative to recent weeks, but month 12 looks radically different from month 1. This is the "boiling frog" evasion — every step is within threshold, but the cumulative effect is massive.

Long-horizon drift addresses this with two metrics, computed on the category-level composite score (aggregated across all source types):

1. **Fixed-baseline comparison**: Compare the current week's composite against the fixed historical baselines (Biden 2022, Trump 2017), not the rolling cycle-position average. This gives an absolute measure of how far the current state has drifted from historical norms, regardless of how gradually it got there.

2. **Cumulative deviation**: Track the "area under the curve" — sum the weekly composite deviations over a trailing window (e.g., 12 weeks). Repeated mild elevations that individually stay under threshold become a meaningful signal when accumulated. A category that's been at 1.5 standard deviations for 10 consecutive weeks is more concerning than one that spiked to 3.0 for a single week.

Both metrics are deterministic, computed from the same structural dimensions as the weekly anomaly score. They add no cost — just a different comparison window and an accumulator.

**Functional Distribution — classification method for Federal Register documents** (validated by spike investigation, 2026-02-22):

_Note: This classification applies to the Federal Register source type. Other source types have their own classification approaches: CourtListener uses NOS codes and opinion types; LegiScan uses subject tags, bill types, and status/progress codes; DOJ uses enforcement action categories; GovInfo/GAO uses report types from MODS XML. Each source type's "functional distribution" is defined by its native metadata structure._

Documents are assigned to institutional function buckets using a deterministic, tiered approach:

_Tier 1 — Deterministic from `source_type` (~63% of documents):_

- `Rule` or `Proposed Rule` → **Rulemaking**
- `Presidential Document` → **Executive Action** (subdivided by `subtype`: Executive Order, Proclamation, Memorandum when available)
- `rhetoric` → **News/Rhetoric**

_Tier 2 — Title prefix heuristics (~17% of documents):_

- `"Excepted Service"` or `"Senior Executive Service"` or `"Personnel Demonstration"` → **Personnel Action**
- `"Privacy Act"` or `"Agency Information Collection"` or `"Submission for OMB"` → **Administrative Procedure**
- `"Self-Regulatory Organizations"` → **Financial/Regulatory Filing**
- `"Statement of Organization, Functions"` → **Organizational Change**
- `"Notice of Determinations; Culturally"` → **Cultural/Ceremonial**

_Tier 3 — `action` field heuristics (when available, resolves much of the remaining ~20%):_

- The FR API's `action` field (e.g., "Notice of meeting," "Notice of availability," "Notice of proposed rulemaking") distinguishes institutional functions within the Notice catch-all. This field is not currently stored — Sprint R1 adds it to the fetch pipeline.

_Tier 4 — Unclassified remainder (~20% without `action` field, shrinking as `action` data accumulates):_

- Classified as **Other**. The proportion of "Other" documents is itself tracked as a metric — if it shifts significantly, that indicates a change in how government communicates.

**Spike validation**: This classification already reveals real signals in existing data:

- Presidential Documents grew from 3.5% → 10.4% of civilService output (Biden 2022 → Trump 2025) — executive action replacing normal administrative process
- Excepted Service notices dropped from 18 → 0 — OPM stopped publishing a routine institutional output, indicating process breakdown or bypass
- Proposed Rules declined in fiscal (11.6% → 8.5%) — deregulatory posture visible in document type shift
- These signals are invisible to keyword matching and require no AI to detect

**Composite structural score**: Per-source-type scores are computed from their respective dimension sets, then aggregated into a category-level composite using the formulas defined in §Category-Level Aggregation (source influence capping + convergence bonus). All weights are fixed, versioned, and per-category (since different categories rely on different source mixes). When a dimension or source type is unavailable, its weight is redistributed proportionally, and the score reports reduced confidence.

**What it catches that keywords miss**:

- Agency silence (OPM stops publishing → personnel actions happening outside formal channels)
- Source convergence gaps (GDELT reports mass firings but no FR documents appear → operational actions bypassing regulatory record)
- Presidential document surges (sudden spike in executive orders relative to agency notices → executive centralization)
- Institutional function shifts (agency output shifts from guidance to personnel actions, or routine notices disappear — e.g., OPM Excepted Service notices going from 18 per year to zero)
- Cross-category clustering (multiple categories showing structural anomalies in the same week → coordinated action)
- Gradual capture ("low and slow" — via long-horizon drift and cumulative deviation, repeated mild shifts below weekly threshold become visible over months)
- **Cross-source convergence** (CourtListener filing volume spikes + DOJ press releases shift topic + FR rulemaking changes — independent institutional vantage points agreeing)
- **Institutional capacity collapse** (FEC quorum loss → enforcement volume drops to zero; IG firings → oversight report volume collapses. The absence of output _is_ the structural signal.)
- **Legislative propagation patterns** (model legislation spreading to 15 states in one session vs. 3, tracked through LegiScan SAST — detectable without AI classification)
- **Selective prosecution patterns** (CourtListener NOS code distribution shifts — spike finding: selective prosecution claims up 663% in 2025)

**What it cannot catch**:

- Semantic content shifts within the same functional category (same volume, same document types, same institutional functions, but the _substance_ of the guidance has changed — e.g., OPM still publishing personnel guidance but the guidance now concerns mass terminations rather than hiring)
- This is why Layer 1 alone is insufficient — it needs Layers 2 and 3

**Implementation specifics**:

The four baselines (Biden 2021/2022, Trump 2017/2018) provide the reference distributions. For existing FR-based categories, document metadata is already stored. For new source types, baseline construction requires historical backfill (all validated sources have 2017+ archives — see `SPIKE_FINDINGS.md`). Per-source-type baseline distributions are computed independently, reflecting each source's metadata structure and publication cadence.

The structural score computation is a pure function: `computeStructuralScore(currentWeekMetadata, sourceBaselineDistributions, cyclePosition) → StructuralScore`. Stateless, deterministic, testable.

**Estimated cost**: Zero marginal cost — computed from metadata already collected. CPU-only computation.

---

### Layer 2: AI Two-Pass Assessment

**Method**: Every document that enters the pipeline gets assessed by AI for relevance to its category's democratic erosion concerns. Two passes with different models, objectives, and cost profiles.

#### Pass 1 — Signal Finder (high recall, tolerates false positives)

**Model**: gpt-4o-mini or Claude Haiku (cheap, fast)

**Objective**: "Could this document be relevant to concerns about [category description]? When in doubt, say yes."

**Input**: Document title, abstract/first 500 characters, document type, publishing agency, publication date, category description. For LegiScan bills: also include subject tags, bill status/progress, and sponsor party (compensates for shorter bill descriptions — see §Source-type sensitivity gap below).

**Output** (structured JSON, temperature 0):

```json
{
  "relevant": true,
  "confidence": 0.7,
  "signals": [
    "Executive order establishing new entity with access to agency personnel systems",
    "Bypasses normal OPM hiring/firing procedures"
  ],
  "erosionType": "operational_hollowing"
}
```

**Key design decisions**:

- Runs on EVERY document, not gated by structural anomalies or keywords
- Structured output only — no free-form text, no chain-of-thought (keeps cost minimal)
- The `erosionType` field classifies into the A/B/C framework: `formal_override`, `operational_hollowing`, `noncompliance_refusal`, `routine`, `unclear`
- Temperature 0 for maximum reproducibility
- The prompt does NOT reference specific keywords, current events, or administration-specific context. It describes the category's concerns in general terms ("actions that could affect the independence and professional integrity of the federal civil service"). This prevents prompt-tuning from becoming the new keyword-tuning treadmill.
- The prompt includes the **erosion type framework definitions** (formal_override, operational_hollowing, noncompliance_refusal, routine, unclear) with descriptions — not just the bare enum values. This gives Pass 1 the conceptual vocabulary to distinguish "relevant to the category topic" from "relevant to erosion concerns within the category." Added after the civilLiberties calibration finding (see below).
- **Category descriptions must describe the threat vector, not the topic area.** A description like "tracks court cases involving constitutional rights" is too broad — it matches all civil rights litigation. The correct form is "government actions that reduce civil liberties protections" — describing what erosion looks like, not what the category covers. This principle was validated empirically: the original civilLiberties description produced a 73% flag rate; the threat-vector description produced 3.3%. No per-category prompt overrides are used — all calibration happens through the category description and the shared erosion framework.

**Source-type sensitivity gap — LegiScan bills (validated 2026-03-01):** Pass 1 false-negative audit (Trump T2) found 7 of 12 false negatives cluster in lawEnforcement, all LegiScan bills, all `formal_override` erosion type — bills that create enforcement exemptions, parallel enforcement systems, or shield entities from prosecution (e.g., regulatory sandbox programs, AG discovery shields, CFPB authority restrictions). Pass 1 sees "bill" with a short procedural title and marks it routine; Pass 2 reads the substance and recognizes formal restructuring of enforcement power. The 2.8% false-negative rate for lawEnforcement is in the "monitor" zone (1-3%), not yet requiring prompt revision. Root cause: bill descriptions are shorter and more procedurally worded than FR documents or DOJ press releases — the same enforcement-constraining substance reads differently in legislative language. Two mitigations for Sprint R3 prompt development: (a) add prompt guidance for legislative bills specifically ("pay attention to provisions creating exemptions, immunities, sandbox programs, or parallel enforcement structures"), and (b) include LegiScan subject tags and bill status/progress metadata in Pass 1 input to compensate for shorter text. This is the first empirical evidence that source-type differences affect Layer 2, not just Layers 1 and 3 where the architecture already assumes source-type-specific handling.

**Category calibration — civilLiberties (validated 2026-03-03):** civilLiberties had a 73% Pass 1 flag rate with only 1.5% Pass 2 confirmation — 98.5% of expensive Pass 2 calls returned "routine." Root cause: the category description ("Are civil rights and individual liberties being protected? Tracks court cases involving constitutional rights, due process, and equal protection challenges") described the _topic area_ rather than the _threat vector_. Applied to 71,777 CourtListener NOS 440 docket entries, virtually every civil rights filing matched. Fix applied two changes, both global: (1) tightened the civilLiberties description to focus on erosion ("government actions that reduce civil liberties protections" rather than "tracks court cases involving constitutional rights"), and (2) added erosion type framework definitions to the Pass 1 prompt (all categories benefit). Results on 2-week test: flag rate dropped to 3.0-3.7%, Pass 2 confirmation rose to ~50%, confirmed documents are substantive (NAACP v. Weaver — formal_override; Chicago Headline Club v. Noem — press freedom challenge caught by audit). **Watch item:** audit false-negative rate was 1/12 (8.3%) on the test weeks — above the 3% "investigate" threshold, but sample is too small for conclusions. Track across the full 20-week backfill; if it stabilizes above 3%, the description may be overcorrected on press freedom / First Amendment cases. A per-category prompt override (`p1Guidance`) was considered and rejected — it would create a per-category tuning treadmill. All calibration should happen through category descriptions and the shared erosion framework.

**Baseline flag rate**: Run Pass 1 against all four baseline periods. Record the flag rate per category (e.g., "during Biden 2022, Pass 1 flagged 3.2% of civilService documents as relevant"). This becomes the reference for "normal flag rate." Elevated flag rates relative to baseline are themselves a signal.

**Estimated cost**:

- **Weekly snapshot** (~500–1,500 new documents across all categories): ~$0.10–0.30 at gpt-4o-mini rates (~$0.15/1M input tokens, ~$0.60/1M output tokens)
- **Full backfill** (processing an entire period, e.g., 57 weeks of Trump 2025 or a full baseline year — ~15,000 unique documents across all categories): ~$1.50–3.00
- **Baseline regeneration** (one-time per baseline period): same as full backfill, ~$1.50–3.00 per baseline × 4 baselines = ~$6–12 total

#### Pass 2 — Skeptical Analyst (high precision, contextual reasoning)

**Model**: Claude Sonnet 4.5 or gpt-4o (more capable, more expensive)

**Objective**: "Pass 1 flagged this document as potentially relevant. Here is the full document text and Pass 1's signal descriptions. Assess whether this represents a genuine concern or routine governance. Be specific about why. Consider whether this would be noteworthy during any administration."

**Input**: Full document text (or first 4K tokens for long documents), Pass 1's output, category description, erosion type framework description.

**Output** (structured JSON):

```json
{
  "assessment": "potentially_concerning",
  "confidence": 0.75,
  "reasoning": "This executive order creates an entity outside normal civil service structures with direct access to personnel systems across multiple agencies. While workforce efficiency reviews occur in most administrations, the scope of access and the bypassing of OPM standard procedures is atypical.",
  "comparativeContext": "Routine workforce reviews typically operate through OPM channels. This structure is outside those channels.",
  "citedPassages": [
    "shall have access to all agency records, software systems, and IT systems relating to personnel..."
  ],
  "erosionType": "operational_hollowing",
  "counterArguments": [
    "Government efficiency initiatives exist in most administrations",
    "The order could be implemented narrowly"
  ]
}
```

**Key design decisions**:

- Runs ONLY on documents Pass 1 flagged as relevant (cost control), plus a small audit sample of unflagged documents (see Pass 1 False-Negative Audit)
- Uses a different model than Pass 1 (epistemic independence — different training data, different reasoning patterns)
- Explicitly asks for counter-arguments (prevents confirmation bias in the assessment)
- The `comparativeContext` field asks the model to compare against routine governance rather than making absolute judgments
- Structured output with citations — every claim must point to specific document text

**Implementation note**: Pass 2 is greenfield code, not an adaptation of the existing AI Skeptic (`ai-assessment-service.ts`). The current AI Skeptic was designed with a constraint: "can confirm or lower keyword assessment, but not raise." Pass 2 has the opposite design — it independently assesses documents that Pass 1 flagged, with no reference to keyword results. The existing `enhancedAssessment()` function, its prompt templates, and its output schema are all built around the keyword-confirmation role. None of this code carries over to Pass 2.

**Assessment distribution**: Pass 2 classifies each document into one of:

- `routine` — flagged by Pass 1 but actually normal governance activity
- `novel_not_concerning` — unusual but not related to democratic erosion concerns
- `potentially_concerning` — warrants attention and monitoring
- `clearly_concerning` — significant departure from democratic norms with specific evidence

The distribution across these categories (not any individual document assessment) is the signal. A week where 80% of flagged documents are assessed as `routine` is very different from a week where 40% are `potentially_concerning`.

**Estimated cost**:

- **Weekly snapshot**: If Pass 1 flags ~5-10% of the week's documents (~25–150 flagged), Pass 2 costs ~$0.50–3.00 at Sonnet/4o rates
- **Full backfill**: ~750–1,500 flagged documents across the full period, ~$7–15
- **Baseline regeneration**: same as full backfill per baseline, ~$7–15 × 4 baselines = ~$28–60 total

#### Using Different Models for Independence

The two-pass system uses different models from different providers deliberately. When gpt-4o-mini flags a document AND Claude Sonnet confirms it's concerning, that's more robust than the same model agreeing with itself. The models have different:

- Training data and knowledge cutoffs
- Reasoning patterns and biases
- Failure modes and blind spots

Agreement across models is a form of triangulation — analogous to how the three detection layers triangulate.

When the models disagree (Pass 1 flags, Pass 2 dismisses, or vice versa), that disagreement is logged and contributes to the Elevated status — genuine ambiguity is itself a finding worth noting.

#### Pass 1 False-Negative Audit

Pass 1 determines what Pass 2 sees. If Pass 1 misses something, Pass 2 never evaluates it — making Pass 1 a silent gatekeeping filter. To maintain epistemic integrity, a weekly audit sample closes this gap:

**Process**: Each week, select a **stratified** 2–5% sample of documents that Pass 1 classified as `not_relevant`. Stratification is by **(category × sourceType)** — ensure at least 2 documents per active source type in each category are sampled (if available). This catches localized blind spots: Pass 1 might perform well on FR documents but systematically under-flag DOJ press releases or LegiScan bills with short summaries. A purely random global sample could miss category- or source-specific failures for weeks. Run the stratified sample through Pass 2 anyway.

**Metric**: `pass1_false_negative_estimate` — the percentage of sampled not-relevant documents that Pass 2 assesses as `potentially_concerning` or `clearly_concerning`.

**Thresholds**:

- < 1%: Pass 1 performing well. No action needed.
- 1–3%: Acceptable but worth monitoring. Log and trend.
- \> 3%: Pass 1 prompt or model may have a systematic blind spot. Investigate which categories and document types are being missed. Consider prompt revision or model update.

**Storage**: Audit results stored per week with the sampled document IDs, Pass 2 assessments, and the computed false-negative estimate. This creates an auditable record of Pass 1's reliability over time.

**Cost**: At 2–5% of unflagged documents (~10–50 documents per week), this adds ~$0.50–2.00 per week to Pass 2 costs. Negligible relative to the epistemic value.

#### AI Reproducibility Strategy

AI assessments are not perfectly deterministic. Strategy for managing this:

1. **Temperature 0, structured output** for both passes — maximizes reproducibility within a model version
2. **Baseline flag rates are the reproducible metric** — "Pass 1 flagged 12% of documents this week vs. 3% baseline" is meaningful even if individual document assessments vary slightly between runs
3. **Model versions are pinned and recorded** — every assessment records the model version used. When models update, baselines are re-run and the version change is annotated.
4. **The structural layer (Layer 1) is the reproducibility anchor** — it never changes between runs. AI assessments supplement but don't override the structural signal.
5. **Monthly reproducibility checks** — re-run a sample of assessments and measure agreement rate. If it drops below 90%, investigate and annotate.
6. **Model-version drift tracking** — store weekly estimates of: Pass 1 flag rate, Pass 2 confirm rate, Pass 1 false-negative estimate (from audit), and the model versions used. Track these metrics across model version boundaries. If a model update silently changes instrument behavior (e.g., flag rate shifts 20% between versions), the system detects this as measurement drift rather than interpreting it as a change in government behavior. This is analogous to DOJ taxonomy tracking in Layer 1 — separating instrument changes from signal changes.
7. **Version bundles** — formalize a single "bundle" version that captures: rhetoric router model + Pass 1 model + Pass 1 prompt hash + Pass 2 model + Pass 2 prompt hash + structural threshold constants + convergence constants + embedding model. A single bundle hash per weekly run enables full auditability: "this week's results were produced by bundle v23, which differs from last week's v22 only in the Pass 2 prompt." When any component changes, a new bundle version is minted and baselines are tagged with the bundle that produced them. This prevents comparing "baseline scored by bundle A" against "monitoring scored by bundle B" without explicit annotation.

---

### Layer 3: Thematic Drift Detection

**Method**: Compute document embeddings and compare each week's embedding distribution against a rolling window of the _same administration's_ recent output. Detects semantic content shifts even when structural metadata (volume, types, agencies, functional distribution) looks normal.

**Why intra-administration comparison**: Different administrations have different policy priorities. Biden-era OPM publishes diversity and telework guidance. Trump-era OPM publishes efficiency and restructuring guidance. Comparing across administrations would flag thematic drift in virtually every category from day one — that's not erosion, that's democracy. Layer 3 instead asks: "Is this administration's own output changing character over time?" A gradual escalation from routine restructuring guidance to mass termination procedures would be detected as thematic drift within the administration's own trajectory.

#### Source-Type Baseline Segregation

With multiple source types feeding each category, embedding baselines must be segregated by source type. Legal opinions have different linguistic characteristics than press releases, which differ from bill text and from Federal Register notices. If embeddings from all source types are mixed in a single embedding space, changes in **source composition** (adding CourtListener documents to a category that was previously FR-only) would appear as thematic drift even if the actual themes haven't changed.

**Design: per-source-type embedding baselines within each category.**

- Each source type maintains its own baseline centroids, rolling window centroids, and cluster models within each category.
- Thematic drift is detected **within** each source type independently: "Are this week's court opinions semantically different from the administration's recent court opinions?" is a separate question from "Are this week's FR documents semantically different from recent FR documents?"
- Category-level thematic drift aggregates per-source-type drift scores (e.g., max or weighted average of individual source-type z-scores).
- Adding a new source type to a category does **not** invalidate existing source-type baselines. FR embedding baselines for judicialIndependence remain valid after CourtListener is added — they're separate embedding spaces.

**Deferred: cross-source thematic convergence.** The original design proposed detecting when multiple source types drift "in the same semantic direction." However, court opinions, press releases, FR documents, and bill text occupy fundamentally different regions of embedding space even within the same category. "Same direction" in high-dimensional space between sources with different linguistic registers may not carry interpretable signal. **Ship Layer 3 with per-source-type drift detection only.** Cross-source thematic convergence is deferred to a future sprint (R-F) pending empirical investigation of whether between-source-type cosine distances are meaningful. Cross-source convergence at the _structural_ level (Layer 1) is well-defined because it operates on comparable metrics (z-scores); the _thematic_ equivalent requires validation.

```typescript
interface ThematicDriftScore {
  // Category-level aggregate (max or weighted average of source-type z-scores)
  categoryDriftScore: number;
  categoryZScore: number;

  // Per-source-type breakdown
  sourceTypeDrift: Record<SourceType, SourceTypeDriftScore>;

  // Cross-source thematic convergence — DEFERRED
  // Requires empirical validation that between-source-type cosine distances
  // carry interpretable signal. Not implemented in Sprint R-S1.
  // crossSourceThematicConvergence: { ... };

  // Secondary: cross-administration context (informational, not used in status)
  crossAdminDistance: number; // distance from primary baseline centroid
  crossAdminBaseline: string; // e.g., "Biden 2022"
}

interface SourceTypeDriftScore {
  sourceType: SourceType;

  // Primary: intra-administration rolling comparison
  rollingCentroidDistance: number; // cosine distance from rolling window centroid
  rollingWindow: {
    weeks: number; // window size (e.g., 8)
    meanDistance: number; // average weekly centroid distance within window
    stdDev: number;
  };
  zScore: number; // how many SDs this week's distance is from rolling mean
  clusterShifts: ClusterShift[]; // which topic clusters grew/shrank
  novelDocumentRate: number; // % of documents not fitting any established cluster
  novelDocuments: string[]; // document IDs/URLs that don't fit any cluster
  varianceRatio: number; // this week's variance / rolling window variance
}

interface ClusterShift {
  clusterId: string;
  label: string; // human-readable label (e.g., "routine HR guidance")
  rollingPercentage: number; // what % of rolling window docs were in this cluster
  currentPercentage: number; // what % of this week's docs are in this cluster
  shift: number; // percentage point change
  drivingDocuments: string[]; // document IDs/URLs of this week's docs in this cluster
}
```

**What it measures** (per source type within each category):

| Metric                         | How                                                                                                                                                      | What It Catches                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Rolling centroid distance**  | Cosine distance between this week's embedding centroid and the rolling window centroid (previous 4–8 weeks of the same administration)                   | Content shift within the current administration — documents are "about" different things than the administration's own recent output |
| **Cluster distribution shift** | K-means or HDBSCAN clustering of the administration's documents to date, then measure what percentage of current week's documents fall into each cluster | Specific topic areas growing or shrinking within the administration's own output                                                     |
| **Novel cluster emergence**    | Documents that don't fit any of the administration's established clusters (high distance from all centroids)                                             | Genuinely new topics emerging — topics the administration hasn't addressed before                                                    |
| **Variance change**            | Compare spread of embeddings (average distance from centroid)                                                                                            | Increased variance = more diverse topics; decreased = more focused/narrow                                                            |

**Embedding model**: Use a deterministic embedding model (e.g., `text-embedding-3-small` or equivalent). Embeddings are computed once per document and stored. The same document always produces the same embedding (unlike generative AI, embedding models at temperature 0 are perfectly deterministic).

**What it catches that Layers 1 and 2 don't**:

- "Same structure, different substance" — the agency publishes the same volume and types of documents, classified into the same functional buckets, but the semantic content within those buckets has shifted (e.g., OPM still publishing "personnel guidance" but the guidance now concerns mass terminations rather than hiring procedures)
- Gradual thematic drift — topics shift slowly over weeks in a way that no single document triggers AI concern but the cumulative direction is significant
- Topic disappearance within an administration — a topic the administration was actively addressing goes silent while other topics grow
- Escalation patterns — the administration's language in a category becomes progressively more concentrated (variance decreasing) around a specific topic
- **Cross-source thematic convergence** — _deferred pending empirical validation_ (see note in §Source-Type Baseline Segregation). When validated, would detect court opinions, press releases, and FR documents all drifting in the same semantic direction independently.
- **Source-specific language shifts** — LegiScan bill language shifting from "voter modernization" to "ballot security/integrity"; CourtListener showing new legal theories appearing in selective prosecution claims; DOJ press releases shifting enforcement emphasis. Each is detectable within its own embedding space, independently.

**What it cannot catch**:

- The significance of a thematic shift — embeddings detect THAT content changed, not WHETHER the change is concerning. That's Layer 2's job.
- Shifts that happen immediately at the start of an administration — the rolling window needs several weeks to establish an intra-administration baseline before it can detect change.

**Bootstrap period behavior** (first 4–8 weeks of a new administration):

This is a critical design constraint: the first weeks of a new administration are often the most consequential period — the one where the most dramatic actions occur — and Layer 3's rolling window is least reliable. Explicit rules for this period:

1. **Layer 3 uses cross-administration comparison as interim baseline.** Compare the new administration's output against the prior administration's baseline embedding distributions. This is acknowledged as noisy (it will flag policy-priority differences alongside genuine institutional changes), but it's better than no signal.
2. **Layer 3 contributes to convergence status during bootstrap, but at reduced weight.** The convergence logic applies a `bootstrapConfidence` multiplier (e.g., 0.5) to Layer 3's signal during the first 8 weeks. Layer 3 alone cannot trigger Elevated during bootstrap — only Layer 1 or Layer 2 can.
3. **Dashboard displays bootstrap state explicitly.** A visual indicator (e.g., "Layer 3: establishing baseline — reduced confidence") communicates to users that thematic drift is operating in limited mode.
4. **After 8 weeks, Layer 3 transitions to rolling window.** The cross-administration comparison moves to the secondary context metric. The `bootstrapConfidence` multiplier goes to 1.0.
5. **For the Trump 2025 backfill**, the rolling window can be initialized immediately since we have 57+ weeks of data. The bootstrap constraint only applies to future new administrations or new monitoring periods.

**Cluster labeling**: Raw clusters are meaningless to both humans and the narrative generation model — "cluster 4 grew from 2% to 18%" conveys nothing. Each cluster must have a human-readable label describing its content. These labels are generated when clusters are first identified:

1. For each cluster, sample 10–15 representative documents (those closest to the cluster centroid)
2. Send the sample titles and abstracts to AI with the prompt: "These documents form a thematic cluster within [category]. Provide a concise descriptive label (3–6 words) for what this group of documents is about."
3. Human review: verify the labels are accurate and meaningful. Adjust if needed.
4. Store labels as part of the versioned cluster model.

Example labels for civilService clusters: "routine classification guidance," "benefits administration updates," "hiring authority notices," "workforce reduction procedures," "training program announcements."

These labels appear in three places:

- **Layer 3 output**: "The 'workforce reduction procedures' cluster grew from 2% to 18% of this category's documents"
- **Dashboard visualization**: The topic cluster breakdown chart uses labels instead of cluster IDs
- **Narrative generation input**: Opus 4.6 Extended receives the labeled cluster shifts alongside the actual documents driving the shift, so it can explain both the statistical finding ("this topic area grew significantly") and the substance ("here's what those documents actually say")

When new documents don't fit any established cluster (the novel cluster emergence metric), they form an unlabeled group. The narrative generation model reads those documents directly and describes what they're about — this is how genuinely novel topics (like DOGE-related guidance that didn't exist in any prior period) get explained without needing a pre-existing label.

**Estimated cost**: Embedding computation at ~$0.02/1M tokens. For a weekly snapshot (~500–1,500 documents at ~500 tokens each), that's less than $0.02. For a full backfill (~15,000 documents), ~$0.15. Clustering and distance computation is CPU-only. Trivially cheap.

**Existing infrastructure** (confirmed by codebase investigation):

The codebase has a full pgvector pipeline already operational:

- **Embedding**: OpenAI `text-embedding-3-small` (1536 dimensions) with `embedText()`, `embedBatch()`, `computeCentroid()`, `cosineSimilarity()` functions in `embedding-service.ts`
- **Semantic drift**: `semantic-drift-service.ts` already computes `computeWeekCentroid()` (averages all embedded docs for a category/week) and `computeSemanticDrift()` (compares week centroid vs. baseline centroid). This is essentially Layer 3's core computation already built — the main change is switching from cross-administration baseline comparison to intra-administration rolling window.
- **Clustering**: `semantic-clustering-service.ts` has a full k-means implementation with AI-generated cluster labels, stored in a `semantic_clusters` table.
- **Baselines**: Already store `embedding_centroid` (vector) and `drift_noise_floor` (real) per category.

**Key gap**: Embeddings are currently only generated for rhetoric/intent documents during `snapshotRhetoric()`. FR documents (Notice, Rule, Proposed Rule, Presidential Document) are NOT embedded. Sprint R2 must extend `embedUnprocessedDocuments()` to cover FR documents. Sprint R-S1 must further extend embedding to all new source types (CourtListener opinions, DOJ press releases, LegiScan bill descriptions, GAO reports, FCC documents). Each source type's documents are embedded into the same vector space (they share `text-embedding-3-small`) but maintain **separate per-source-type baselines** for drift comparison. Cost is negligible (<$0.01/week for new documents per source type). Initial backfill of embeddings for existing FR documents (~75K documents) is a one-time batch task; new source backfills are part of Sprint R-S1.

**Layer 3 is primarily adaptation of existing services, not greenfield code.** The semantic drift service already does centroid-vs-baseline comparison. The clustering service already does k-means with AI labeling. The changes are: (1) switch drift comparison from cross-administration baseline to rolling window, (2) extend embedding coverage to FR documents and all new source types, (3) add novel document detection and cluster shift tracking, (4) implement per-source-type baseline segregation (separate centroids and clusters per source type within each category). Cross-source thematic convergence is deferred pending empirical validation.

**Clustering cadence**: K-means over 500+ high-dimensional vectors takes 1–2 seconds plus AI labeling calls per cluster. Clustering should run monthly or on-demand, not on every weekly snapshot. The weekly snapshot computes centroid distance, novel document rate, and variance ratio — these are fast operations that don't require re-clustering. Cluster analysis is for deeper investigation of _what_ shifted, not for weekly status determination. Cluster labels update when new clusters emerge or existing clusters change character significantly.

---

### Convergence Synthesis: From Layers to Status

The three layers produce independent signals. The convergence synthesis combines them into a category status that reflects the level of agreement across detection methods.

#### Status Levels

| Status                | Definition                                                                | Layer Pattern                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stable**            | All layers within baseline ranges                                         | Layer 1 normal, Layer 2 flag rate normal, Layer 3 centroid within baseline variance                                                                                                                                                                                              |
| **Elevated**          | One layer showing significant deviation                                   | e.g., Layer 2 flag rate elevated but Layers 1 and 3 normal — OR — Layer 1 structural anomaly but Layers 2 and 3 normal                                                                                                                                                           |
| **Divergent**         | Two or more layers showing deviation, but AI concern rate below threshold | e.g., Layer 1 structural anomaly AND Layer 3 thematic drift, but AI assessment doesn't flag concerning content — could be a legitimate policy shift that changes structure without erosion                                                                                       |
| **Confirmed Concern** | Two or more layers deviating AND Layer 2 concern rate above threshold     | Structural anomaly + AI concern (+ optionally thematic drift), all pointing in the same direction. Does not require all three layers — two layers with high AI concern rate is sufficient, because Layer 3's rolling window may not register drift during consistent escalation. |
| **Baseline Invalid**  | Baseline bundle version does not match current bundle version             | Pre-check guard — not computed from layer outputs. Prevents "instrument changed" from being misread as "government changed."                                                                                                                                                     |
| **No Data**           | Insufficient documents to assess                                          | Fewer than threshold documents available (display-layer check on `insufficientData` flag)                                                                                                                                                                                        |

**"No Data" sub-states** (distinct in data model and UI, critical for multi-source monitoring):

| Sub-state              | Meaning                                                                                                            | UI Treatment                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| **No Data (expected)** | Low volume is normal for this source/cycle position — baseline agrees                                              | Gray indicator, no alarm                                                                                |
| **Source Silent**      | A source that normally publishes has stopped — volume is below collapse threshold relative to cycle-aware baseline | Amber indicator, link to coverage health. _May itself be a signal_ (see §asymmetric dampening bypass).  |
| **Pipeline Failure**   | Ingestion attempted but failed (API error, auth expired, schema change)                                            | Red operational indicator, not shown as a category status. Routed to coverage health monitoring alerts. |

These distinctions prevent the worst confusion for this project: interpreting a broken pipeline as institutional silence, or interpreting expected seasonal quiet as a crisis. The coverage health monitoring system (§Sprint R-S1, Phase 1) provides the underlying data; the status display uses it to disambiguate.

#### Status Determination Logic

`BaselineInvalid` is a pre-check guard, not a layer-computed status. It is checked before `determineStatus()` runs:

```typescript
function checkBaselineValidity(
  category: string,
  currentBundleVersion: string,
  baselineBundleVersion: string,
): 'valid' | 'BaselineInvalid' {
  if (currentBundleVersion !== baselineBundleVersion) {
    return 'BaselineInvalid';
  }
  return 'valid';
}
```

If the baseline is invalid, the system produces `BaselineInvalid` status for the category without running layer scoring. This prevents stale baselines from producing misleading Stable/Elevated/Divergent/Confirmed Concern statuses after a bundle change. The UI displays a banner: "Baselines need recomputation for current model version." See TEST_SPECIFICATION §Router Drift Detection for the ship gate.

```typescript
function determineStatus(
  structural: StructuralScore,
  aiAssessment: AIAssessmentSummary,
  thematicDrift: ThematicDriftScore,
): CategoryStatus {
  const structuralElevated = structural.composite > STRUCTURAL_THRESHOLD;
  const aiElevated = aiAssessment.flagRateZScore > AI_FLAG_THRESHOLD;
  const thematicElevated = thematicDrift.zScore > THEMATIC_THRESHOLD;
  const layersElevated = [structuralElevated, aiElevated, thematicElevated].filter(Boolean).length;

  const concernRate = aiAssessment.concerningRate; // % of Pass 2 docs at potentially/clearly concerning
  const highConcern =
    concernRate > CONCERN_THRESHOLD && aiAssessment.nonAuditPass2Count >= AI_CONCERN_MIN_SAMPLE; // min 3 docs for rate to be meaningful

  if (layersElevated === 0) return 'Stable';
  if (layersElevated === 1) return 'Elevated';

  // 2+ layers elevated — check concern rate
  // This covers both 2-layer and 3-layer cases: structural + AI agreement is a strong
  // signal even without thematic drift (e.g., consistent escalation won't trigger Layer 3's
  // rolling window). Three layers elevating is stronger, but the status is the same.
  if (layersElevated >= 2 && highConcern) {
    return 'ConfirmedConcern';
  }

  return 'Divergent'; // 2+ layers elevated but AI concern rate is not high
}
```

**Note on status naming**: "Confirmed Concern" replaces the earlier "Convergent Concern" label. "Convergent" could sound positive in everyday English ("things coming together"). "Confirmed" is unambiguous for non-technical readers — it means the layers have independently confirmed the same finding.

**Calibration finding — minimum sample gate** (validated 2026-02-24): Baseline analysis found 6 category-weeks where a single Pass 2 document produced a 100% concern rate, trivially exceeding the 0.2 threshold. All 6 were single-document weeks where one `potentially_concerning` assessment inflated the rate. Fix: `AI_CONCERN_MIN_SAMPLE = 3` — the concern rate is not considered meaningful unless Pass 2 reviewed at least 3 non-audit documents that week. This eliminates all false overlap cases in baselines while preserving sensitivity for weeks with real signal volume. This is basic statistical hygiene: rates computed from 1–2 documents aren't meaningful as distributional signals.

**Threshold calibration**: Run the convergence synthesis against all four baseline periods. Set thresholds such that:

- Baseline periods produce Stable for >95% of category-weeks
- Baseline periods never produce Confirmed Concern
- The occasional Elevated in baselines (holidays, transition-period activity spikes) is acceptable and documents the false-positive floor

The thresholds are versioned constants. Changing them requires re-running baselines and annotating why.

**Validated threshold values** (calibrated against four baselines, 2026-02-24):
| Constant | Value | Basis |
|---|---|---|
| `AI_FLAG_RATE_THRESHOLD` | 1.5 (z-score) | 4.9% of baseline weeks exceed — acceptable sporadic noise |
| `AI_CONCERN_THRESHOLD` | 0.2 (rate) | Sound with min sample gate in place |
| `AI_CONCERN_MIN_SAMPLE` | 3 (count) | Eliminates all small-N false positives in baselines |
| `STRUCTURAL_ANOMALY_THRESHOLD` | 2.5 (z-score) | Raised from 2.0 during Phase 6 calibration |
| `THEMATIC_DRIFT_ELEVATED` | 3.5 (z-score) | Raised from 1.5 during Phase 6 calibration |
| `STRUCTURAL_MIN_DOC_COUNT` | 10 (count) | Structural scores dampened for small-corpus category-weeks |

**Calibration finding — structural dampening** (validated 2026-02-24): Small-corpus categories (judicialIndependence [formerly courts], executiveOversight [formerly igs], military — typically 5–15 documents/week from FR alone) produced disproportionate structural noise in baselines. A few documents more or less created large z-scores for volume, type composition, and tempo dimensions. In Trump 2018, these three categories accounted for 57% of all non-Stable weeks despite representing normal governance.

Fix: `STRUCTURAL_MIN_DOC_COUNT = 10` — if a category-week has fewer than 10 documents, the structural composite score is multiplied by a dampening factor: `min(docCount, 10) / 10`. At 10+ documents, full weight. At 5 documents, half weight. At 1 document, 10% weight. This is the same statistical hygiene principle as `AI_CONCERN_MIN_SAMPLE`: measurements computed from tiny samples aren't meaningful as distributional signals.

Impact: Biden baselines rose to 95.3–97.7% Stable (both exceeding the >95% target). Trump baselines rose to 89.2–92.0% Stable. The remaining gap between Trump and Biden baselines reflects genuine governance-style differences in structural variance, not a calibration failure. The system documents this transparently: "Republican and Democratic administrations produce different structural patterns in the Federal Register. Baselines capture this full range. Detection thresholds are calibrated against the noisiest baseline."

**Public methodology disclosure:** The public-facing methodology page should plainly state this tradeoff: _"Thresholds are calibrated to avoid false alarms even in high-variance administrations. This means the system is conservative — it may miss subtle changes in order to avoid crying wolf. When it does flag something, the structural evidence is robust."_ This tradeoff is real and should be owned, not hidden.

**Final calibration results** (four baselines + monitoring period):

| Period               | Stable    | Elevated  | Divergent | ConfirmedConcern |
| -------------------- | --------- | --------- | --------- | ---------------- |
| Biden 2022 (primary) | 97.7%     | 2.3%      | 0%        | 0%               |
| Biden 2021           | 95.3%     | 4.2%      | 0.5%      | 0%               |
| Trump 2017           | 92.0%     | 7.0%      | 1.0%      | 0%               |
| Trump 2018           | 89.2%     | 9.1%      | 1.7%      | 0%               |
| **Trump 2025**       | **84.0%** | **12.5%** | **3.5%**  | **0%**           |

Trump 2025 separation from baselines:

- 13.7 percentage points below Biden 2022 (primary baseline)
- 5.2 percentage points below Trump 2018 (closest baseline — same administration's Year 2)
- 10 Divergent weeks vs. 0–4 in baselines (2.5–10× multiplier)
- AI layer fires only in Trump 2025 (8 Elevated) — zero in Biden baselines, 1 in Trump 2018
- Top non-Stable categories: civilService (35%), fiscal (33%), infoAvailability (25%), military (19%), executiveActions (18%)
- Divergent weeks cluster in Jan–Feb 2025 (DOGE/EO era) with 6 L1+L2 convergences (structural anomaly confirmed by independent AI assessment) in civilService, fiscal, and infoAvailability

#### What the Convergence Pattern Tells You

The _pattern_ of which layers are elevated is diagnostic, not just the count:

| Pattern                            | Interpretation                                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Layer 1 only (structural)          | Something changed in the machinery of government (volume, tempo, agencies) but the content appears routine and semantically normal. Could be administrative, seasonal, or early signal.                                  |
| Layer 2 only (AI)                  | AI is finding concerning content in documents, but the structural signature and thematic embedding are within normal ranges. The government is operating normally but the substance of what it's publishing has changed. |
| Layer 3 only (thematic)            | The topic distribution has shifted measurably from baseline, but volume/structure is normal and AI doesn't flag individual documents as concerning. Gradual thematic drift — worth watching.                             |
| Layers 1+2 (structural + AI)       | The machinery of government is operating differently AND AI finds concerning content. Strong signal — structural change confirmed by content analysis.                                                                   |
| Layers 1+3 (structural + thematic) | The machinery changed AND topics shifted, but AI doesn't find individual documents concerning. The change may be systemic but not yet manifest in individual document content.                                           |
| Layers 2+3 (AI + thematic)         | Content is concerning and topics have shifted, but structural metadata looks normal. This is the "same volume, different purpose" scenario — the most important pattern to catch.                                        |
| All three layers                   | Full convergence. Structural anomaly, AI concern, and thematic drift all pointing in the same direction. Highest confidence signal.                                                                                      |

This pattern analysis should be surfaced in the UI — not just the status pill but a brief explanation of which layers are contributing and what that pattern suggests.

---

### AI Narrative Generation (Opus 4.6 Extended Thinking)

For categories at Elevated or above, generate a weekly discussion using Opus 4.6 with extended thinking. The model receives all three layers' outputs and produces analysis at two reading levels.

**Input to Opus 4.6 Extended**:

- Structural score with all dimension breakdowns, including functional distribution shifts — e.g., "Personnel Action documents dropped from 3% to 0% of civilService output; Presidential Documents grew from 3.5% to 10.4%" (Layer 1)
- AI Pass 2 assessments for all flagged documents, with citations and counter-arguments (Layer 2)
- Thematic drift analysis with labeled cluster shifts — e.g., "'workforce reduction procedures' cluster grew from 2% to 18%, 'routine classification guidance' cluster shrank from 35% to 12%" (Layer 3)
- The specific documents driving the thematic shift — titles, abstracts, agencies, publication dates for documents in growing/novel clusters (Layer 3)
- For novel clusters (documents that don't fit any established cluster): the raw documents themselves, so Opus can describe what these new topics are about
- Convergence pattern (which layers are elevated and what that pattern suggests)
- Baseline comparison data (what the same category looked like during reference periods)

The key design point: Opus doesn't interpret embeddings or vector distances. It reads the labeled cluster shifts to understand _what topic areas changed_, the functional distribution shifts to understand _what kind of institutional work changed_, then reads the actual documents driving those shifts to explain _what the government is doing differently_. The structural and thematic layers select the documents and identify the patterns; the narrative explains them.

**Expert Version Output** (~800-1,500 words):

- What the structural signature shows and how it compares to baseline periods
- What AI assessment found in specific documents (with FR citations)
- Where the layers agree and where they disagree
- What the thematic drift dimensions reveal about changing government focus
- Comparative context: how this week compares to the same cycle position in prior administrations
- Explicit statement of confidence level and what evidence would change the assessment
- Counter-arguments and alternative explanations

**Public Version Output** (~300-500 words):

- What happened this week in plain language
- Why it's being flagged (or why it's worth watching)
- How it compares to normal government activity
- Links to source documents for verification

**Design constraints**:

- The narrative must cite specific documents and specific layer outputs — no unsupported claims
- The narrative must present counter-arguments ("this could also be explained by...")
- The narrative is explicitly labeled as AI-generated analysis, not as a finding of fact
- Stable categories get a one-sentence summary only: "The administrative record in [category] this week was consistent with baseline governance patterns."
- **Narrative minimum document threshold**: Opus narratives are only generated when the system can cite **≥3 primary source documents** driving the assessment. This parallels the `AI_CONCERN_MIN_SAMPLE` logic — one document should not drive the public-facing story. If a category is at Elevated+ but has fewer than 3 citable documents, the narrative is replaced with a measurement summary: "This category shows [Layer X] deviation but with limited source documents. See evidence panel for details." This prevents "one dramatic document drives the narrative" situations that could undermine credibility.

**Estimated cost**: Opus 4.6 Extended on ~1-3 categories per week (those at Elevated+) with substantial input context: ~$1-5 per week depending on how many categories are elevated.

#### Cross-Category Synthesis (Infrastructure Convergence)

In addition to per-category narratives, a separate Opus synthesis identifies **cross-cutting thematic threads** that span multiple categories. This addresses a gap in the three-layer architecture: each layer operates per-category, so no layer detects thematic connections across categories — for example, detention infrastructure appearing simultaneously in military (facility construction), fiscal (budget allocation), immigration (processing capacity), and rulemaking (regulatory changes).

**Input**: All elevated categories' Layer 2 Pass 2 assessments (with cited passages and erosion types), Layer 1 functional distribution shifts, and convergence status — provided as a single combined prompt.

**Prompt guidance**: "Examine the findings across all elevated categories. Identify any cross-cutting themes — actions across multiple institutional domains that may be part of a coordinated pattern. Pay particular attention to: (a) detention and incarceration infrastructure build-out, (b) surveillance apparatus expansion, (c) criminalization of opposition or dissent. For each identified theme, cite the specific documents from specific categories that form the pattern. State explicitly when a cross-cutting pattern is interpretive rather than structural."

**Output**: A "Cross-Cutting Patterns" section for the Administration Overview page. Each identified theme includes:

- Which categories and documents form the pattern
- What the connecting thread is (in plain language)
- How confident the connection is (supported by multiple documents vs. speculative)
- Counter-argument: "These could also be unrelated actions that happen to coincide"

**Design constraints**:

- This is AI interpretation, not structural measurement. Labeled explicitly: "AI-identified cross-cutting pattern — not a structural metric."
- Operates on existing layer outputs — no additional detection infrastructure, no baseline comparison, no threshold calibration
- Runs alongside the administration-level narrative for the overview page. Marginal additional cost (~$0.50–2.00 per week).
- Does not contribute to any category's convergence status — it's a narrative finding, not a layer signal

**Why this approach**: The three infrastructure themes (detention, surveillance, criminalization) were previously tracked through cross-category keyword dictionaries in the V3 architecture. Under the new architecture, keywords are annotations only. Rather than building a separate cross-category detection layer (which would require its own baselines, thresholds, and calibration), the narrative synthesis leverages Opus's ability to read across categories and identify connecting threads. This is less rigorous than structural detection but available immediately with zero infrastructure cost. A future upgrade (R-F11: Pass 2 infrastructure theme tagging) would add structured theme detection when baselines are next re-run.

---

### Role of Keywords in the New Architecture

Keywords remain in the codebase but their role changes fundamentally:

**What keywords do**:

- **UI annotation**: When a document is surfaced in the evidence panel or week detail page, keyword matches are highlighted as contextual labels ("this document contains: 'reduction in force' [warning-tier], 'agency restructuring' [warning-tier]"). This helps human readers quickly see relevant terminology.
- **Research artifact**: The keyword dictionaries are a versioned record of what terminology was associated with democratic erosion concerns at each point in time. Useful for researchers studying how language around institutional erosion evolves.
- **Optional signal in narrative generation**: The Opus 4.6 narrative can note when documents match known-concern terminology as one piece of context among many. "This document, which establishes a new government efficiency entity, also contains terminology flagged in our concern dictionaries: 'workforce reduction,' 'agency restructuring.'"

**What keywords do NOT do**:

- They do not gate detection — documents are assessed by all three layers regardless of keyword matches
- They do not affect the structural score (Layer 1)
- They do not affect the AI flag rate or concern distribution (Layer 2)
- They do not affect the thematic drift score (Layer 3)
- They do not affect the convergence status determination
- Missing keyword matches never reduce confidence on any signal
- Keyword-only severity is NOT a reported metric (this is a deliberate break from the current architecture)

**Admin-specific keyword overlay**: The `admin-specific-keywords.ts` overlay file remains useful as a UI annotation tool. When a document mentions "DOGE," highlighting that term helps human readers. But the detection system doesn't need the keyword to detect the document's relevance.

---

### Data Flow: Complete Pipeline

```
1. DOCUMENT INGESTION (existing + Sprint R-S1 additions)
   ├── Federal Register API (signal queries with pipe-OR syntax, PRESDOCU type filter)
   ├── GDELT (with sourcecountry:US filter)
   ├── White House briefings
   ├── CourtListener REST API (NOS-code-based category routing) [P0]
   ├── DOJ Press Release JSON API [P0]
   ├── GovInfo/GAO REST API (MODS XML metadata) [P0]
   ├── LegiScan Bulk API (session downloads, subject-tag filtering) [P0, operational — pipeline wiring remaining]
   ├── IG RSS feeds (DOD, HHS, DOJ OIG) [P1]
   ├── FCC RSS feeds [P1]
   └── FEC OpenFEC API (monthly batch) [P1]

2. PER-DOCUMENT PROCESSING (new)
   ├── Assign source type → determines which structural analyzer applies
   ├── Compute embedding → store in pgvector (tagged with source type for baseline segregation)
   ├── AI Pass 1 assessment → store structured result
   ├── Classify institutional function → deterministic (source-type-specific: FR uses type/title/action heuristics; CourtListener uses NOS codes; LegiScan uses subject tags + bill type (target — currently keyword-based, adequate for launch))
   ├── Keyword annotation → store matches (for UI display only)
   └── Extract metadata → source-type-specific fields (FR: document type, subtype, action, agency; CourtListener: NOS code, opinion type, court level; LegiScan: subjects, sponsor party, SAST relationships, status/progress)

3. PER-CATEGORY-WEEK AGGREGATION (new)
   ├── Layer 1: Compute structural dimensions from metadata
   │   ├── Per-source-type structural analysis (FR dimensions, CourtListener dimensions, etc.)
   │   ├── Cross-source convergence scoring (2+ source types anomalous)
   │   ├── Compare all dimensions to source-type-specific baseline distributions
   │   └── Aggregate to category-level StructuralScore
   ├── Layer 2: Aggregate AI Pass 1 results
   │   ├── Compute flag rate → compare to baseline flag rate
   │   ├── Run Pass 2 on flagged documents → concern distribution
   │   └── Compute flag rate z-score and concern rate
   ├── Layer 3: Compute thematic drift from embeddings
   │   ├── Per-source-type rolling centroid → distance from source type's recent window
   │   ├── Per-source-type cluster distribution → compare to source type's established clusters
   │   └── Aggregate to category-level ThematicDriftScore
   └── Convergence synthesis → CategoryStatus

4. NARRATIVE GENERATION (for Elevated+ categories)
   └── Opus 4.6 Extended Thinking → expert + public versions

5. DASHBOARD OUTPUT
   ├── Status pills (Stable / Elevated / Divergent / Confirmed Concern / Baseline Invalid / No Data)
   ├── Three-panel visualization per category
   │   ├── Structural signature (per-source-type breakdowns + cross-source convergence)
   │   ├── AI assessment distribution (flag counts by concern level)
   │   └── Thematic drift (per-source-type drift with cluster annotations)
   ├── Convergence pattern indicator (which layers are contributing)
   └── AI-generated narrative (expert and public versions)
```

---

### Dashboard Visualization

#### Information Hierarchy

The dashboard serves two distinct purposes with different time horizons:

1. **Administration Overview** (`/overview`) — "What has happened over this administration?" The cumulative story. Primary entry point for new visitors, journalists, researchers, and anyone asking the big question. Available once baseline + backfill data exists (i.e., immediately after Sprint R3).
2. **Current Week / Landing Page** (`/`) — "What changed this week?" The monitoring cadence. Primary view for returning visitors tracking ongoing developments.
3. **Category Detail** (`/category/[key]`) — "What's the full story for this institution?" One category's trajectory over the monitoring period.
4. **Week Detail** (`/category/[key]/week/[date]`) — "What exactly happened?" The forensic view for a single week of a single category.

The overview is the natural starting point — a visitor arriving at Democracy Monitor for the first time doesn't want "here's what happened this week in civil service." They want "here's what has happened to democratic institutions, measured systematically." The weekly landing page matters for ongoing monitoring, but the cumulative story is the reason someone comes to the site.

#### Administration Overview Page (`/overview`)

**Purpose**: Synthesize the full monitoring period into a single coherent picture. This is the page that gets linked by journalists, cited in academic work, and shared on social media. It answers: "How far has each institution drifted from historical baselines, and what's the overall trajectory?"

**Summary mode** (general public):

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  OVERALL STATUS SUMMARY                                     │
│  "Across [N] weeks of monitoring, [X] of 14 categories     │
│  show sustained structural deviation from historical        │
│  baselines. The most significant shifts are in..."          │
│                                                             │
│  AI-generated narrative (Opus, expert reading level or      │
│  public reading level based on toggle). Synthesizes         │
│  cross-category findings into a coherent story.             │
│  Explicit label: "AI-generated analysis"                    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CATEGORY DRIFT OVERVIEW                                    │
│  Small multiples or heatmap: all 14 categories showing      │
│  long-horizon drift from historical baseline over time.     │
│  Each row = category, each column = week, color intensity   │
│  = composite structural deviation from fixed baseline.      │
│                                                             │
│  This is the "boiling frog" detector visualization —        │
│  gradual shifts that stay within weekly thresholds become   │
│  visible when shown cumulatively across the full period.    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  STATUS TIMELINE                                            │
│  Horizontal timeline showing when each category changed     │
│  status (Stable → Elevated → Divergent → Confirmed          │
│  Concern). Key events annotated on timeline. Shows the      │
│  progression over months, not just current state.           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CROSS-CATEGORY SYNCHRONY                                   │
│  Line chart: number of categories at Elevated or above,     │
│  per week. Spikes indicate coordinated cross-institutional  │
│  activity. Annotated with key events.                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CROSS-CUTTING PATTERNS (AI-identified)                     │
│  Opus synthesis of thematic threads spanning categories.     │
│  E.g., "Detention infrastructure: documents in military,    │
│  fiscal, and immigration categories show coordinated        │
│  facility expansion, budget allocation, and regulatory      │
│  changes." Each pattern cites specific documents.           │
│  Explicit label: "AI-identified pattern — not a structural  │
│  metric." See § Cross-Category Synthesis.                   │
│  Only shown when patterns are identified.                   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CATEGORY TABLE (14 categories, sorted by cumulative deviation)  │
│  Same cards as landing page, but sorted by long-horizon     │
│  drift rather than current-week status. Shows which         │
│  institutions have moved furthest from baseline across      │
│  the full monitoring period.                                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  METHODOLOGY FOOTER                                         │
│  "This analysis covers [date range]. Measurements compare   │
│  against [N] historical baselines spanning two              │
│  administrations. Full methodology at /methodology."        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Detailed mode** adds:

- Per-category long-horizon drift scores (fixed-baseline distance + cumulative deviation)
- Layer-by-layer breakdown per category (which layers are driving the status)
- Baseline comparison selector (compare against Trump 2017 or Biden 2022 individually)
- Export: full cross-category summary as JSON or CSV

**Key data requirements** (all available after Sprint R3 backfill):

- `longHorizon.fixedBaselineDistance` per category per week (from Layer 1)
- `longHorizon.cumulativeDeviation` per category (from Layer 1)
- Status history per category per week (from convergence synthesis)
- Cross-category synchrony count per week (count of categories at Elevated+)
- AI narrative synthesis across categories (Opus generation, can be cached/pre-computed)

**Design principles**:

- Lead with structural findings (Layer 1) — least "opinionated," most defensible
- Show trajectory, not just current state — a category that's been Elevated for 30 weeks tells a different story than one that spiked this week
- Always show what "normal" looks like alongside the monitoring period — the baseline comparison is what gives the numbers meaning
- Counter-arguments visible by default — "What could explain this besides institutional erosion?"

#### Current Week Landing Page (`/`)

The landing page shows the most recent week's analysis. It is the monitoring cadence view for returning visitors.

Each category card shows:

- **Status pill**: Stable / Elevated / Divergent / Confirmed Concern / Baseline Invalid / No Data
- **Convergence indicator**: Three small dots or bars representing each layer's status (normal/elevated)
- **Sparkline**: Composite structural deviation over time (the simplest single metric to track)
- **Brief summary**: One sentence from the AI narrative, or "Consistent with baseline" for Stable
- **Long-horizon context** (small text): "X% above historical baseline" or "Within historical range" — connects the current week to the bigger picture

Navigation between overview and landing page should be prominent — a visitor on the landing page should see a clear path to "View full administration overview →" and vice versa.

#### Category Detail Page

Three time-series panels (described in conversation, formalized here):

**Panel 1 — Structural Signature**

- Multi-line chart: document volume over time with baseline band
- Stacked area: document type composition over time
- Stacked area or small multiples: functional distribution over time (institutional function bucket proportions — e.g., rulemaking vs. personnel action vs. administrative procedure). Shifts in this chart show the institutional posture changing even when volume is stable.
- Divergence overlay: news coverage volume vs. government document volume (source convergence)
- Baseline reference shown as shaded band — weeks exiting the band are highlighted
- Callouts for notable functional shifts (e.g., "Excepted Service notices: 0 this period vs. 18 in baseline")

**Panel 2 — AI Assessment Distribution**

- Stacked bar chart per week: documents classified by Pass 2 as routine (gray), novel-not-concerning (blue), potentially concerning (amber), clearly concerning (red)
- Bar height = total flagged documents; baseline flag rate as horizontal reference line
- Individual flagged documents are clickable → shows Pass 2 assessment with citations

**Panel 3 — Thematic Drift**

- Line chart: rolling centroid distance over time (comparison against administration's own recent window), with rolling variance as shaded band
- Below the line: small labels showing which topic clusters drove the drift when distance exceeds the band
- Topic cluster breakdown (small stacked bar) showing current week vs. rolling window cluster distribution
- Secondary line (dotted, de-emphasized): cross-administration centroid distance for long-term context, explicitly labeled as "reflects policy priority differences, not necessarily institutional concern"

**Convergence Matrix** (at top of detail page):

- 3-column indicator showing Layer 1 / Layer 2 / Layer 3 status for the current week and recent history
- Pattern label (from the convergence pattern table above)

**AI Narrative Section**:

- Toggle between expert and public reading levels
- Explicit label: "AI-generated analysis — not a finding of fact"
- Citations link to source documents
- Counter-arguments section visible by default (not hidden behind a toggle)

**Evidence Panel** (existing, adapted):

- Documents that drove the assessment, with:
  - Pass 1 and Pass 2 results
  - Keyword annotations (highlighted terms from dictionaries — for context, not scoring)
  - Document metadata (type, agency, date, FR citation)
  - Link to full document on Federal Register

---

### Baseline Methodology

The four existing baselines (Biden 2021/2022, Trump 2017/2018) are reused but their role changes:

**What baselines provide in the new architecture**:

1. **Per-source-type structural distributions**: Per-category, per-source-type, per-cycle-position statistics for each Layer 1 dimension. FR dimensions (volume, type composition, functional distribution, agency activity) have separate baselines from CourtListener dimensions (filing volume, NOS distribution, injunction rate) and from LegiScan dimensions (bill volume, status progression, sponsor composition, SAST velocity). Each source type's baseline reflects its own metadata structure and publication cadence.
2. **Functional distribution baselines**: Per-category institutional function bucket proportions for each baseline period. These establish "during normal governance, X% of civilService documents are personnel actions, Y% are administrative procedures, Z% are rulemaking." For new source types, the "functional" equivalent is source-specific: NOS code distribution for CourtListener, subject-tag distribution for LegiScan, etc.
3. **AI flag rate baselines**: Run Pass 1 against all baseline period documents (all source types). Record the flag rate per category per week. This establishes "during normal governance, AI flags X% of documents."
4. **Per-source-type embedding cluster models**: Compute embeddings for all baseline documents, cluster them **per source type within each category**, label the clusters. This prevents source-type linguistic differences from appearing as thematic drift. Used for initial cluster labeling and for cross-administration contextual comparison.
5. **Thematic baseline statistics**: Per-source-type weekly centroid positions, variance, cluster distributions during baseline periods. Provides the starting point for Layer 3's intra-administration rolling window.

**Note on Layer 3 rolling window**: Layer 3's primary metric uses the current administration's own recent output as the baseline, not the historical baselines. The historical baselines are used for: (a) initial cluster labeling, (b) the secondary cross-administration context metric, and (c) interim comparison during the first weeks of a new monitoring period before the rolling window is established.

**Baseline regeneration**: Required once for the new architecture. Details in the Baseline Re-run Strategy section below.

**Baseline versioning**: Each baseline is a versioned fixture set that records the model versions used, the signal queries used, the date of computation, and the parameters. When model versions change, baselines are re-run and both old and new versions are preserved.

---

### Baseline Re-run Strategy

The transition to the three-layer architecture requires re-running baselines and backfills. This section documents exactly what needs to happen, when, what it costs, and — critically — what does NOT need re-running when methodology changes occur in the future.

#### What triggers a re-run under the new architecture vs. the old

Under the **old keyword architecture**, any of these changes required a full baseline re-run:

- Adding keywords → re-score all documents → re-compute baselines → re-calibrate thresholds
- Changing keyword tiers → same
- Adjusting suppression rules → same
- Modifying document class multipliers → same

This was the treadmill: every methodology tweak cascaded into hours of reprocessing.

Under the **new three-layer architecture**, each layer has independent re-run triggers:

| Change                                      |                                         Layer 1 re-run?                                         |                          Layer 2 re-run?                          |                                        Layer 3 re-run?                                         |
| ------------------------------------------- | :---------------------------------------------------------------------------------------------: | :---------------------------------------------------------------: | :--------------------------------------------------------------------------------------------: |
| Signal query changes (new/fixed FR queries) |                     Yes — new documents enter corpus, distributions change                      |              Yes — new documents need AI assessment               |                               Yes — new documents need embedding                               |
| **New source type added**                   | **Yes — new source-type structural baselines needed; existing source-type baselines preserved** |            **Yes — new documents need AI assessment**             | **Yes — new source-type embedding baselines needed; existing source-type baselines preserved** |
| Structural threshold adjustment             |                                  No — just change the constant                                  |                                No                                 |                                               No                                               |
| AI model version update                     |                                               No                                                | Yes — re-run Pass 1/Pass 2 on baselines to recalibrate flag rates |                                               No                                               |
| AI prompt revision                          |                                               No                                                |                    Yes — same as model update                     |                                               No                                               |
| Embedding model update                      |                                               No                                                |                                No                                 |                   Yes — re-embed all documents, recompute centroids/clusters                   |
| Keyword changes                             |                                               No                                                |                                No                                 |                                               No                                               |
| Adding a new functional bucket              |                       Recompute functional distribution only (SQL, free)                        |                                No                                 |                                               No                                               |
| Convergence threshold adjustment            |                                  No — just change the constant                                  |                                No                                 |                                               No                                               |

The key improvement: **keyword changes trigger zero re-runs.** Since keywords are annotations only, modifying them has no effect on any layer's baseline metrics. This eliminates the primary source of the re-run treadmill.

**Note on source expansion re-runs:** Adding a new source type (e.g., CourtListener to judicialIndependence) requires computing new source-type-specific baselines (structural distributions and embedding centroids) for the new source. However, **existing source-type baselines are preserved** — FR baselines for judicialIndependence remain valid and unchanged. This is a key benefit of per-source-type baseline segregation: source expansion is additive, not destructive.

#### One-time setup: Sprint R1 → R2 → R3 sequence

**Sprint R1: Fix the document corpus**

The signal query fixes (pipe-OR syntax, PRESDOCU type filter, GDELT `sourcecountry:US`) change which documents enter the pipeline. This requires re-fetching from the FR API for all four baseline periods and the Trump 2025 monitoring period — but only for the new/fixed signal queries. Documents already in the database from existing queries stay.

| Task                                                   | Cost                | Duration                           |
| ------------------------------------------------------ | ------------------- | ---------------------------------- |
| Re-fetch baselines with corrected signal queries       | $0 (FR API is free) | ~2–4 hours (rate-limited fetching) |
| Re-fetch Trump 2025 with corrected queries             | $0                  | ~1–2 hours                         |
| Capture `action`/`subtype` for newly fetched documents | $0 (part of fetch)  | Included above                     |

After Sprint R1, the document corpus is correct and complete.

**Sprint R2: Compute Layer 1 and Layer 3 baselines**

| Task                                               | Cost   | Duration      | Notes                                                                                                                                          |
| -------------------------------------------------- | ------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Layer 1 structural distributions (all 4 baselines) | $0     | Minutes       | SQL queries against existing metadata — volume, type, functional, agency distributions                                                         |
| Embed FR documents (~75K existing + newly fetched) | ~$1.50 | ~10–15 min    | One-time backfill; `text-embedding-3-small` at $0.02/1M tokens. At batch sizes of 50, ~1,500 API calls — well within rate limits (~3,000 RPM). |
| Layer 3 initial clustering + AI label generation   | ~$2–5  | ~30 min       | K-means on baseline embeddings, AI generates ~5–10 labels per category                                                                         |
| Calibrate thresholds against baselines             | $0     | Manual review | Set structural and thematic thresholds so baselines produce >95% Stable                                                                        |

After Sprint R2, Layers 1 and 3 are operational with calibrated baselines. Total cost: ~$4–7.

**Sprint R3: Compute Layer 2 baselines**

| Task                                          | Cost    | Duration   | Notes                                          |
| --------------------------------------------- | ------- | ---------- | ---------------------------------------------- |
| AI Pass 1 on all 4 baselines (~60K documents) | ~$6–12  | ~2–3 hours | gpt-4o-mini structured assessment per document |
| AI Pass 2 on flagged documents (~3K–6K)       | ~$28–60 | ~3–5 hours | Sonnet/4o deeper assessment on Pass 1 flags    |
| Compute baseline flag rates per category      | $0      | Minutes    | Aggregate Pass 1 results                       |
| Run full 3-layer system against Trump 2025    | ~$9–18  | ~2–3 hours | All three layers on monitoring period          |

After Sprint R3, all three layers are operational with calibrated baselines. Total one-time cost: ~$47–97.

#### Ongoing re-run costs

| Trigger                     | Frequency           | Cost                            | What's reprocessed                          |
| --------------------------- | ------------------- | ------------------------------- | ------------------------------------------- |
| Weekly snapshot             | Weekly              | ~$2–8                           | New documents through all 3 layers          |
| AI model version update     | ~2–4× per year      | ~$35–75                         | Re-run Pass 1/Pass 2 on baselines only      |
| Embedding model update      | Rare (~1× per year) | ~$1.50 + clustering             | Re-embed all documents, recompute clusters  |
| New signal queries added    | As needed           | ~$0 + Layer 2 cost for new docs | Fetch new documents, run through all layers |
| New functional bucket added | Rare                | $0                              | Recompute SQL distributions                 |

#### What does NOT require re-running

- **Keyword additions/removals**: No effect on any layer's metrics. Zero cost.
- **Convergence threshold adjustments**: Change a constant, re-render dashboard. No reprocessing.
- **Structural threshold adjustments**: Same — change a constant, re-render.
- **Narrative prompt changes**: Only affects future narrative generation, not stored metrics.
- **Dashboard/UI changes**: Display-only, no reprocessing.

This is the fundamental improvement over the keyword architecture: the most frequent methodology changes (adding terms, adjusting thresholds) are now free, and the expensive changes (model version updates) happen infrequently and on a predictable schedule.

---

### Cost Summary

| Component                            | Weekly Snapshot | Full Backfill (per period) | Notes                                                            |
| ------------------------------------ | --------------- | -------------------------- | ---------------------------------------------------------------- |
| Layer 1 (Structural)                 | ~$0             | ~$0                        | CPU computation on existing metadata                             |
| Layer 2 Pass 1 (Signal Finder)       | ~$0.10–0.30     | ~$1.50–3.00                | mini/Haiku on all documents                                      |
| Layer 2 Pass 2 (Skeptical Analyst)   | ~$0.50–3.00     | ~$7–15                     | Sonnet/4o on flagged documents only                              |
| Layer 2 Pass 1 Audit                 | ~$0.50–2.00     | N/A                        | 2–5% of unflagged docs through Pass 2                            |
| Layer 3 (Thematic Drift)             | ~$0.02          | ~$0.15                     | Embedding computation + CPU clustering                           |
| Narrative Generation                 | ~$1–5           | N/A                        | Opus 4.6 Extended on Elevated+ categories                        |
| **Weekly total**                     | **~$2.50–10**   | —                          | Ongoing operational cost                                         |
| **Full backfill total**              | —               | **~$9–18**                 | One-time per period (e.g., Trump 2025)                           |
| **Baseline regeneration (one-time)** | —               | **~$47–97**                | Four baselines × all three layers (see Baseline Re-run Strategy) |

Weekly operational costs (~$2.50–10) are based on the original 11 categories with FR-primary sources. Expanding to 14 categories with additional sources (CourtListener, DOJ API, LegiScan, GovInfo/GAO, FEC, FCC, IG RSS) will significantly increase document volume. Spike findings indicate:

- CourtListener alone adds 130-210 docs/week across 3 categories
- DOJ API adds 360-400 docs/week to lawEnforcement
- Combined new sources add an estimated 500-700 docs/week

Layer 2 AI costs scale linearly with document volume. Estimated post-expansion weekly costs: ~$8-20/week (Layer 2 dominates). One-time baseline computation costs for new source types: ~$30-60 for Layer 2 across the 6 affected categories (new documents only — existing FR assessments preserved).

---

### Migration Path from Current Architecture

The new architecture doesn't require a big-bang replacement. It can be built alongside the existing system and validated before switching over.

#### Sprint R1 (scoped to remaining work)

Most items originally planned for Sprint R1 were completed in Sprint 20:

- ~~Display fix (InsufficientData → "No Data" badge)~~ ✅ Sprint 20
- ~~FR signal query audit (fix AND-instead-of-OR bug, add phrase quoting)~~ ✅ Sprint 20 (18 queries fixed)
- ~~GDELT `sourcecountry:US` filter~~ ✅ Sprint 20 (5 queries)
- ~~Presidential document signal queries~~ ✅ Sprint 20 (7 PRESDOCU signals added)
- ~~`document_scores.document_id` NULL fix~~ ✅ Sprint 20

**Remaining R1 work:**

- ~~`document-scorer.ts` bug fix (use `getEffectiveKeywords()` — admin overlay keywords not being matched during scoring)~~ ✅ Sprint R3
- ~~Capture FR API `action` and `subtype` fields during document fetch~~ ✅ Sprint R3 (~10 lines across 3 files, no schema migration)
- **Rhetoric cross-feed** (prerequisite for source convergence and Layer 2): Rhetoric documents are currently stored with `category: 'intent'` and never routed to the 13 monitoring categories. This must be fixed so that (a) Layer 1 can compute per-category source convergence ratios, and (b) Layer 2 can assess rhetoric documents against category-specific concerns.

  **Routing contract (defined — implementation in Sprint R1):**

  Every document receives:
  - `primaryCategory: string` — the single most relevant category (required). For FR documents, this is determined by signal query. For rhetoric/GDELT documents, this is determined by AI classification or keyword-based routing.
  - `secondaryCategories: Array<{ category: string, confidence: number }>` — optional additional categories with confidence scores (0-1). A GDELT article about IG firings might be `primaryCategory: 'executiveOversight'` with `secondaryCategories: [{ category: 'civilService', confidence: 0.7 }]`.
  - `sourceType: SourceType` — the document's source type (for Layer 1 and Layer 3 baseline segregation).

  **Schema implications:**
  - `documents` table adds nullable `secondary_categories` JSONB column.
  - Layer 1 source convergence counts rhetoric documents by their `primaryCategory` (not `'intent'`).
  - Layer 2 Pass 1 runs on all documents in a category, including rhetoric documents routed there.
  - Layer 3 embeds rhetoric documents into the `gdelt` source-type embedding baseline (segregated from FR/CourtListener embeddings).
  - Baselines: rhetoric document counts per category are included in structural baselines once the cross-feed is operational. Categories that had zero rhetoric documents before the cross-feed will show a volume increase — this is a known baseline discontinuity that must be annotated, not a signal.

  **Routing method:** AI classification using a cheap model (gpt-4o-mini) with the 14 category descriptions as the classification schema. Batch-classify existing rhetoric documents during backfill. Cost: ~$1-2 for the full 57K rhetoric corpus. Ongoing cost: negligible (<$0.01/week for new rhetoric documents).

  **Routing model version pinning:** Category baselines must be computed using the **same routing model version** that will be used for ongoing monitoring. If the routing model is updated (e.g., gpt-4o-mini → gpt-4o-mini-2025-07), rhetoric documents in baselines must be re-routed with the new model before comparing to current routing. Otherwise, routing model changes could appear as category volume shifts. The routing model version is tracked as part of the version bundle (see §AI Reproducibility Strategy).

  This contract ensures that adding multi-category routing later (e.g., a document relevant to both `lawEnforcement` and `civilLiberties`) is a schema extension, not a migration.

These are source infrastructure fixes that both the old and new architectures need.

#### Sprint R2 (redesigned)

**Estimated scope**: ~250–370 new/modified lines of code. Layer 3 is adaptation of existing semantic drift and clustering services, not greenfield.

- **Layer 1**: Build structural anomaly scoring — pure functions computing deviation scores from baseline metadata distributions. Sprint R2 ships with five dimensions (volume, type composition, functional distribution, agency activity, publication tempo). Source convergence activates when the rhetoric cross-feed is complete — if R1's cross-feed implementation is still in progress, the composite score redistributes its weight across the other five dimensions. (~50–70 LOC)
- **Layer 1**: Build functional classifier — deterministic tiered approach (source_type → title heuristics → action field) using priority-ordered classification rules. Pure function, zero dependencies, trivially testable. (~80–120 LOC)
- **Layer 1**: Compute baseline structural distributions from existing four baselines, including functional distribution baselines. (~40–60 LOC)
- **Layer 1**: Define and calibrate thresholds against baselines
- **Layer 3**: Extend `embedUnprocessedDocuments()` to cover FR documents (currently only rhetoric docs are embedded). Run initial embedding backfill for existing FR documents.
- **Layer 3**: Adapt `semantic-drift-service.ts` to use intra-administration rolling window instead of cross-administration baseline comparison. The core centroid computation and cosine similarity functions already exist.
- **Layer 3**: Add novel document detection (documents far from all established cluster centroids) and rolling variance tracking
- **Layer 3**: Run initial cluster labeling using existing `semantic-clustering-service.ts` k-means + AI labeling. Clustering runs once during setup and monthly thereafter — not on every weekly snapshot.
- **Convergence**: Build status determination logic combining Layer 1 + Layer 3. (~40–60 LOC)
- **Schema**: Add `structural_score`, `structural_detail`, `thematic_score`, `thematic_detail`, `convergence_score`, `convergence_detail` columns to `weekly_aggregates` table (nullable, preserves existing data). Long-horizon drift data (`fixedBaselineDistance`, `cumulativeDeviation`, `driftTrend`) is stored within the `structural_detail` JSONB column alongside per-dimension breakdowns.
- Run against Trump 2025 data and compare to current keyword-based results
- **Validation**: Confirm that Layer 1 detects the signals found in the spike (Presidential Document surge in civilService, Excepted Service notice disappearance, Proposed Rule decline in fiscal)
- **Note**: AI assessment (Layer 2) is NOT in this sprint — starting with the deterministic layers allows validation of structural and thematic detection before adding AI

#### Sprint R3 (redesigned)

- **Layer 2**: Implement Pass 1 (Signal Finder) — structured prompt, mini/Haiku, runs on all documents
- **Layer 2**: Run Pass 1 against all four baselines — establish baseline flag rates
- **Layer 2**: Implement Pass 2 (Skeptical Analyst) — structured prompt, Sonnet/4o, runs on Pass 1 flags
- **Convergence**: Update status determination to include Layer 2 signals
- Run full three-layer system against Trump 2025 data
- Validate: does the system detect DOGE, USAID closure, IG firings, court defiance?
- Compare three-layer results to current keyword-based results — document what the new system catches that the old one missed, and vice versa

#### Sprint R4 (new)

- **Administration Overview page** (`/overview`): Primary entry point for visitors. Category drift heatmap, status timeline, cross-category synchrony, AI-generated synthesis narrative. Built from data already computed in Sprints R2–R3 (long-horizon drift, status history, cross-category counts). This is the highest-priority UI deliverable — it's the page that gets linked and shared.
- **Narrative generation**: Opus 4.6 Extended weekly narratives for Elevated+ categories, plus administration-level synthesis narrative for the overview page
- **Dashboard redesign**: Landing page with category cards (convergence indicator, three-layer sparkline), three-panel category detail (structural signature, AI assessment distribution, thematic drift), convergence matrix
- **Keywords**: Demote from scoring to annotation role — remove from status determination, keep for UI display
- **Public methodology documentation**: Detection Scope Statement updated for three-layer architecture

#### Sprint R5 (new — validation + decommission)

- Cross-architecture validation: run both old (keyword) and new (three-layer) systems in parallel for 4 weeks
- Publish comparison report documenting detection differences
- Decommission keyword-based status determination after validation period
- Methodology documentation for public launch

#### Sprint R-S1 (new — source expansion, parallelizes with R4/R5 UI work)

**Goal:** Expand document sources to achieve meaningful signal across all 14 categories. Builds ingestion pipelines, runs historical backfills, and recomputes per-source-type baselines for affected categories.

**Prerequisite:** Source availability spikes complete (see `SPIKE_FINDINGS.md`). Results: 7 of 8 spikes passed (GDELT diversity metrics failed). All new sources validated with sufficient volume, historical depth, and metadata quality. 14 categories confirmed viable for launch.

**Phase 1 — P0 Ingestion pipelines (~2 weeks, parallelizable):**

Build integrations in order of category coverage breadth and implementation simplicity:

1. **CourtListener REST API** — Serves 3 categories (judicialIndependence, lawEnforcement, civilLiberties). Free, well-structured API. RECAP docket search with NOS-code-based category routing. Establishes the source integration pattern for all subsequent APIs.
2. **GovInfo/GAO REST API** — Fixes executiveOversight thinness (5-15 → 15-30 docs/wk). Free key, MODS XML metadata, 36K req/hr. Simple structured integration.
3. **DOJ Press Release JSON API** — Massively enriches lawEnforcement (360-400/wk). Open JSON API — the major spike discovery. **Requires stable internal taxonomy mapping (10-20 durable buckets) before integration** — see §Source-Type Structural Dimensions.
4. **LegiScan pipeline wiring** — Fetcher and bulk import already implemented (485 lines total), 1,826 classified bills in DB. Integration via separate weekly cron (not signal/feed-fetcher pattern). See §LegiScan Status and ROADMAP §Sprint R-S1e.
5. **Coverage health monitoring** — Per-source-type document count per day with alerting when a source goes silent for >2× expected cadence. Ships alongside first source integration, not after. Minimum viable: daily ingestion counts + "source silent" alerts + DOJ taxonomy change tracking.
6. **Cross-source document deduplication** — Add nullable `canonical_id` column to documents table with partial unique constraint. Each fetcher extracts source-native document identifiers (GAO report numbers, DOJ UUIDs, CourtListener docket numbers, etc.) and normalizes them for cross-URL matching. First-in wins; duplicates are rejected at insert time. Ships with first multi-source category (executiveOversight: GovInfo + IG RSS) to prevent volume inflation. See §Cross-Source Document Deduplication for schema and normalization rules.

**Phase 1b — P1 Enrichment sources (fast-follow or tail of Phase 1):**

5. **IG RSS feeds** (DOD, HHS, DOJ OIG) — Supplements GovInfo for executiveOversight. Easy RSS polling.
6. **FCC RSS feeds** — Supplementary enrichment for mediaFreedom (~5-10/wk). Meets lower ≥5/wk bar.
7. **FEC OpenFEC API** — Unique institutional signal for elections (deadlock rate, quorum status). Monthly batch aggregation.

**Phase 2 — Historical backfill (~1 week, mostly compute time):**

_Prerequisite: (a) Sprint R-S1d data quality fixes landed, (b) Sprint R-S1e incremental snapshot deployed, (c) Sprint R-CL1 opinion ingestion complete, and (d) fetch_log-based verification passes (API-vs-DB counts within tolerance per source type). All four conditions required — computing baselines against incomplete data invalidates downstream detection. See ROADMAP §Phase 2 for full condition list._

**Corrected 7-step re-processing sequence (validated 2026-03-03):** A comprehensive database audit revealed that baseline periods have 29.7% missing scores, zero layer scores across all 6,331 baseline weekly aggregates, and 164K CL documents with only ~30 chars of NOS-code content. The following sequence must execute in dependency order before baselines are considered valid: (1) Content backfill — FR documents via `backfill:content --source fr`, GovInfo reports via `backfill:content --source govinfo`, CL judicial opinions via `backfill:opinions` (Sprint R-CL1, ~25K new companion documents linked by `case_id`), WH briefing-room articles via URL fetch (4,323 existing title-only documents; handle archived administration URLs: trumpwhitehouse.archives.gov, bidenwhitehouse.archives.gov). (2) Re-embed all content-updated documents. (3) Re-score all documents — fills ~93K missing scores. (4) Re-run Layer 2 — P1 for content-updated documents; fill baseline L2 for 3 categories with zero coverage (civilLiberties, lawEnforcement, mediaFreedom). (5) Recompute weekly aggregates from corrected scores + L2 data. (6) Compute baselines from corrected aggregates. (7) Compute layer scores (L1/L2/L3) + convergence on all weekly aggregates. **Content completeness gate:** Before step 6, verify that null content rates are consistent across periods; document any asymmetry.

- Pull documents from all new sources across all 4 baseline periods + Trump 2025 monitoring period
- All validated sources have 2017+ archives (CourtListener: all federal courts; DOJ: archive; GovInfo: 1995+; LegiScan: 2009+; FEC: 1999+)
- Route documents through category assignment logic with source-type tagging
- **Re-cross-feed existing GDELT rhetoric corpus to 14 categories.** The Sprint R1/R3.2 cross-feed was validated against 11 categories. Three new categories (lawEnforcement, civilLiberties, immigrationEnforcement) need GDELT cross-feed rows generated. Re-run `crossfeedRhetoricToCategories()` against existing ~57K rhetoric documents with updated `categories.ts`. One-time batch. Required before baseline computation — without it, new categories lack GDELT source-type baselines and source convergence is a no-op. Critical for immigrationEnforcement (FR-only volume is ~5-6/wk).

**Phase 3 — Per-source-type baseline computation + Layer 2 enhancement (overlaps with Phase 2):**

- Compute source-type-specific Layer 1 structural baselines for each new source (CourtListener dimensions, DOJ dimensions, LegiScan dimensions, etc.)
- **Pass 2 mechanism extraction**: Update Pass 2 prompt to require structured mechanism identification fields (power expanded, oversight reduced, enforcement changed, due process changed, access gained). Apply to all new-source Pass 2 runs so the enriched corpus gets mechanism-tagged from the start. Prompt change only — no infrastructure.
- Run Layer 2 Pass 1 + Pass 2 for new documents in affected categories
- Compute Layer 3 per-source-type embeddings and baseline centroids for new source types
- Source-type-specific cycle-aware normalization (legislative session calendars for LegiScan, judicial calendar for CourtListener, fiscal year for GovInfo)
- Validate asymmetric dampening bypass: unit test that volume collapse (docCount < baselineMean × 0.25) produces dampeningFactor = 1.0 per §Key Spike Findings
- Existing FR source-type baselines are **preserved unchanged** — source expansion is additive

**Phase 4 — Validation:**

- Confirm category-level baselines still meet >95% Stable target for Biden periods
- Verify Trump 2025 signal quality with enriched multi-source corpus
- Verify cross-source convergence scoring (do categories with 2+ anomalous source types produce stronger signals?)
- Verify source dependency map: DOJ↔CourtListener and FR↔GDELT pairs receive 0.75× convergence weight when only 2 sources anomalous
- Check structural dampening constants (may need adjustment upward for categories with significantly increased corpus size — which would be a good outcome)
- Validate LegiScan Layer 1 structural signals (SAST propagation, status progression, sponsor composition) work without AI classification
- Validate FEC monthly aggregation produces meaningful institutional capacity signal (deadlock rate, quorum status); confirm null on non-batch weeks
- Validate Pass 2 mechanism extraction fields produce structured, verifiable output (not just "concerning" labels)
- Verify coverage health monitoring: simulate source silence and confirm alert triggers before real monitoring begins
- Verify cross-source deduplication: confirm canonical_id matching catches GovInfo↔GAO and GovInfo↔IG overlaps; confirm duplicate-rejection rate is tracked per source pair
- Verify backfill completeness: API count vs. DB count per source type per baseline period within tolerance (FEC: exact; GovInfo: ≤1%; CourtListener NOS: ≤3%; text-search signals: peak weekly within pagination cap; FR: all 14 categories populated; GDELT cross-feed: all 14 categories have rhetoric documents)

**Phase 5 — P2 Deferred sources (post-launch):**

- Oversight.gov scraping (all 75 IGs — no API, community scraper spotty)
- VRL partnership (calibration dataset for LegiScan AI classification accuracy)
- CBO reports pipeline (fiscal — low-volume supplementary signal)

**Phase 6 — Primary-source rhetoric (post-launch, before media sprint):**

_Rationale (validated 2026-03-03):_ GDELT provides media _coverage_ of government rhetoric but cannot provide article text historically (DOC API returns metadata only; Context API limited to 72-hour lookback). Primary sources — what officials actually said — are more defensible and auditable than media coverage for a democracy monitoring system. Primary sources are also harder to suppress: Congressional Record transcripts and White House archives are institutional records.

**6a. Congressional Record (CREC) via GovInfo** — new source type. Full-text floor speeches, debates, amendments. GovInfo API confirmed: collection `CREC`, available across all 5 periods (2017-2026), full HTML text via granule download. Volume: 75-491 entries/week (varies by period and legislative activity).

_Speaker parsing (validated 2026-03-03):_ CREC document granularity is a solved problem. Multiple open-source parsers exist: (a) `unitedstates/congressional-record` (Python, maintained) converts GPO HTML into structured text data, identifying each "turn" as a separate instance of speech. (b) Sunlight Foundation's parser uses regex and official XML metadata to identify speakers and distinguish quoted material, handling transitions via whitespace, titles, punctuation, capitalization. (c) Stanford's Congressional Speech Dataset, built on these approaches, contains 14 million parsed speeches from 1879 to 2022 with speaker metadata including party affiliation and ICPSR ID numbers linked to canonical legislator databases. Procedural content is filtered out automatically.

_Recommended ingestion pattern:_ Fetch CREC HTML via GovInfo API → parse by speaker using `unitedstates` parser → store each substantive speech as a separate document with speaker metadata (name, party, state, ICPSR ID). This solves the 240K-char monolithic debate transcript problem — each document becomes a single speaker's remarks on a single topic, a much better unit for Layer 2 assessment. Documents inherit speaker metadata for Layer 1 structural dimensions (party distribution, cross-party alignment on topics).

**Design decisions required before implementation:** (a) Filtering strategy — unfiltered CREC includes procedural noise ("PLEDGE OF ALLEGIANCE", "ADDITIONAL SPONSORS"); keyword filtering per category is needed but risks missing novel rhetoric if too aggressive. (b) Category routing — which categories receive CREC documents and via what filtering rules. (c) CREC-specific structural dimensions for Layer 1 (e.g., speaker party distribution, amendment volume, bipartisan vs. party-line rhetoric patterns, debate length as proxy for contentiousness).

**6b. Cabinet and VP rhetoric via agency newsrooms** — new source type. Every cabinet agency publishes speeches, transcripts, and press releases on .gov domains. These are official government publications with dates, speaker attribution, and verifiable URLs — as auditable as Federal Register documents.

_Tier 1 (highest value, most feasible):_

- **DOJ** — already have justice.gov press releases; extend to include AG speeches and testimony transcripts published separately.
- **State Department** — structured newsroom with Secretary speeches, briefing transcripts, statements, all with dates and speaker attribution. Archived versions cover baseline periods (2009-2017.state.gov, 2017-2021.state.gov).
- **DHS** — Secretary statements and press releases, directly relevant to immigrationEnforcement and lawEnforcement.
- **VP office** — whitehouse.gov publishes VP remarks alongside presidential ones. WH content backfill would capture if fetcher doesn't filter by speaker.

_Tier 2 (valuable but lower volume):_ Treasury (Secretary speeches on fiscal policy, sanctions, economic enforcement), Defense (SecDef speeches on military/domestic security), HHS (relevant to future health/civil liberties category).

_Tier 3 (meta-source):_ **American Presidency Project (UCSB)** archives over 250K presidential documents including spoken addresses/remarks (35K+), news conferences (2.5K+), statements (14.7K+), memoranda (3.5K+). Includes VP remarks and some cabinet-level events. Covers all administrations going back decades — potential baseline coverage source. No API found, but archive is structured and scrapable.

_Pipeline pattern (same for each agency):_ RSS or paginated listing → fetch full page → extract transcript text → attribute to speaker → store as document with speaker metadata. **Data model implication:** documents table would benefit from `speaker` field (or `speaker_id` linked to a people table with name, role, party, agency). Enables tracking specific officials' rhetoric over time, detecting rhetorical coordination across agencies (AG and DHS Secretary using identical framing in same week), and measuring rhetoric-to-action lag per speaker rather than per category. Recommend building DOJ extension + State Department first to validate pattern, then expand.

**6c. Presidential social media (Truth Social)** — For the current president specifically, multiple third-party archives exist with structured programmatic access: (a) CNN-maintained archive updating every 5 minutes with posts in JSON/CSV/parquet. (b) American Presidency Project (UCSB) archives Truth Social posts by date. (c) Trump's Truth (Defending Democracy Together) archives all posts with searchable index including video transcripts and image descriptions. (d) Truthbrush (Stanford Internet Observatory) is an open-source Python client pulling from Truth Social's publicly accessible API for academic research. For cabinet members and other officials, access is much more limited — as of August 2025, Truth Social only requires auth for non-prominent users. X/Twitter is effectively dead as a research source (API: $200/month Basic with 10K tweets and 7-day search; $5,000/month Pro; academic access nominally restored under EU DSA pressure but rarely granted). **Bluesky** is a bright spot: firehose API is free, open, unauthenticated, provides real-time stream of every public post. Growing fast but not yet where primary political rhetoric happens — worth monitoring as coverage increases.

_Analytical value of social media rhetoric:_ The gap between Ring 1 (official record) and Ring 2 (direct-to-public channels) language is itself a signal. Executive orders get formal FR language, but social media posts often use more aggressive framing that signals direction before policy follows. When social media rhetoric escalates 2-3 weeks before corresponding official actions, the lag is informative for the Rhetoric vs. Action pipeline (Phase 8).

**6d. MediaCloud investigation** — API spike to determine if full article text with historical coverage (confirmed available in UI search back to 2017) is accessible programmatically. If viable, provides media rhetoric content across all periods — filling the gap GDELT cannot. Would supplement or replace GDELT as the media coverage content source while GDELT remains the volume/tone signal for Layer 1.

- Recompute rhetoric-dependent baselines after CREC/agency newsroom/MediaCloud ingestion.

**Phase 7 — Media coverage as independent signal (post-rhetoric sprint):**

_Rationale:_ Media coverage patterns are themselves a democracy health indicator, independent of government rhetoric. Coverage suppression, source concentration, tone asymmetry, and coverage displacement are distinct threat scenarios that government document analysis alone cannot detect.

- **Coverage suppression detection** — topics that normally generate N articles/week across diverse outlets dropping to near-zero. Same architectural pattern as Layer 1 volume collapse, applied to media coverage per category.
- **Source concentration / framing diversity** — measuring how many distinct analytical perspectives exist on a topic. When coverage comes from 30 outlets but 25 publish substantively identical framing within hours, something is shaping coverage. Distribution of framing diversity is a measurable signal; when it collapses, something is directing coverage.
- **Tone asymmetry** — divergence between media tone (GDELT tone scores) and the system's own Layer 2 assessments. Uniformly positive media coverage of an action that Layer 2 flags as `clearly_concerning` is informative.
- **Coverage displacement** — major government actions that generate almost no media scrutiny because the media cycle is dominated by something else. System would flag action through FR/DOJ/CL sources, but absence of media scrutiny is additional context for convergence.
- **Category mapping:** mediaFreedom is the primary home (currently nearly empty). infoAvailability gains a "public reach" dimension. All categories benefit from a "media scrutiny" convergence input.
- Requires media-specific structural dimensions, media-specific baselines, and integration into convergence formula.

**Phase 8 — Rhetoric vs. Action temporal analysis (requires Phase 6 rhetoric data):**

_Rationale:_ With attributed primary-source rhetoric (CREC parsed by speaker, WH transcripts, agency cabinet speeches, presidential social media), the system can measure not just _what_ officials say but whether and how quickly rhetoric becomes policy. The lag between rhetoric and action is a measurable, auditable signal.

_What exists:_ `intent-service.ts` scores rhetoric and action keywords per policy area. `intent-snapshot-store.ts` saves snapshots. The UI spec defines `/rhetoric` page with Summary and Detailed modes. No temporal lag analysis engine exists.

- **Cross-correlation lag analysis** — for each policy area, compute cross-correlation between weekly rhetoric score time series and weekly action score time series at lags 0-12 weeks. Peak correlation and its lag position quantify "how long after officials say X does corresponding policy action appear." Store in `intent_weekly` table or dedicated `rhetoric_lag` table.
- **Aggregate mode (Summary)** — per-policy-area table showing top rhetoric keyword, top action keyword, lag in weeks. Available with existing keyword-level infrastructure. This is the V3 System Spec Phase 6 deliverable.
- **Matched-pairs mode (Detailed)** — linking _specific_ attributed statements ("Secretary of DHS said X on date Y") to _specific_ government actions ("DHS published rule Z three weeks later"). Requires a statement-to-action matching engine that does not yet exist. This is new backend work beyond the lag analysis service. Matching approach: embed individual rhetoric statements and action documents, find cosine-similar pairs across the temporal lag window, LLM judge confirms causal relationship. Similar to P2025 matcher pattern (Phase 9) but operating on a rolling window rather than a fixed proposal set.
- **Speaker-level tracking** — with `speaker` metadata from Phase 6, compute per-official rhetoric-to-action patterns. Which officials' rhetoric most reliably predicts policy action? Do some officials' statements serve as trial balloons (long lag, low conversion) vs. policy announcements (short lag, high conversion)?
- **Ring analysis** — when Phase 6 provides rhetoric from multiple "rings" (official record, direct-to-public channels, surrogates), measure whether rhetoric appears in Ring 2 (social media) before Ring 1 (official record), and whether surrogate rhetoric (Ring 3, congressional allies) precedes executive action. The lag between rings is itself a signal of how rhetoric is being operationalized.

**Phase 9 — Project 2025: Plan vs. Delivered (can begin in parallel with Phase 6):**

_Rationale:_ The system can match government actions against the published Project 2025 blueprint to track implementation progress. This answers "how much of the declared plan has been executed" — a concrete, auditable question that complements the broader democratic health monitoring.

_What exists:_ V3 System Spec defines schema (`p2025_proposals`, `p2025_matches`), matcher service (embed proposals → cosine similarity → LLM judge), and LLM judge prompt with 4-level classification (NOT_RELATED / LOOSELY_RELATED / IMPLEMENTS / EXCEEDS). 14 seed proposals exist in `lib/data/p2025/seed-proposals.ts`. UI spec defines `/p2025` page with status breakdown and per-area progress.

_What's missing:_ (a) Proposal extraction at scale — the 920-page document needs systematic extraction. **Shortcut:** several organizations (Democracy Forward, Brookings P2025 tracker, others) have already extracted and categorized proposals. Their extraction could serve as seed data (with attribution) rather than doing the full extraction independently. Verify licensing/attribution requirements. (b) Status persistence — knowing that proposal X was "in progress" last week and is now "implemented" requires state tracking over time. The UI spec flags this as needing a backend sprint (`p2025_tracking` table). (c) "Exceeded" detection — LLM reasoning about whether government actions go beyond what the proposal called for. Currently a single-run assessment, not a persisted longitudinal status.

- **Proposal extraction sprint** — ingest existing third-party extractions or perform independent extraction. Each proposal gets: id, chapter, target agency, mapped dashboard category, severity, text, summary, embedding. Human review required for quality.
- **Matcher pipeline** — embed proposals, run cosine similarity against all new documents weekly, LLM judge classifies top-K candidates. Store matches with confidence scores and reasoning. This is straightforward given existing embedding infrastructure.
- **Status persistence** — `p2025_tracking` table storing proposal status over time. Weekly snapshot records current status per proposal. Enables "implementation velocity" metric: how many proposals changed status this week/month.
- **Category integration** — P2025 match counts become an additional convergence input per category. A category with high Layer 1/2/3 scores _and_ active P2025 implementation is qualitatively different from one with high scores but no blueprint connection.

**Phase 10 — Authoritarian infrastructure build-out tracking (requires new data sources):**

_Rationale (validated 2026-03-03):_ The system currently tracks executive orders, court rulings, and regulatory actions — what the government _says_ and _decides_. No existing democracy monitoring tool systematically tracks the _operational capacity_ for authoritarian action: whether the government is quietly building the physical, personnel, and legal infrastructure that would make authoritarian action possible at scale. This is a distinct analytical dimension from rhetoric (what officials say), policy (what officials enact), and P2025 alignment (whether actions match a declared plan). Infrastructure build-out is the _capability_ dimension — it answers "even if the government hasn't done X yet, could it do X tomorrow?"

**10a. Detention capacity** — physical infrastructure for mass detention.

- _Primary source:_ **SAM.gov** (public API for federal procurement). Detention facility contracts, bed capacity expansions, and facility construction are searchable by agency (ICE, CBP), NAICS code, and keyword. Historical data available for baseline computation.
- _Secondary source:_ **SEC EDGAR API** — quarterly filings from private prison companies (GEO Group ticker GEO, CoreCivic ticker CXW) include contracted bed counts, occupancy rates, revenue per detainee, and new facility announcements.
- _Existing source extension:_ **DHS/ICE/CBP monthly statistical tables** — encounters, detention bed counts, removals. Excel/PDF download, quarterly batch processing, similar to FEC aggregation pattern. _(Moved from Phase 5 — fits better as infrastructure signal.)_
- _Metric:_ Total available detention bed capacity over time. This is a physical capacity indicator — not "did the government say something about detention" but "how many people can the government detain tomorrow."

**10b. Personnel build-out** — organizational capacity for enforcement at scale.

- _Primary source:_ **USAJobs.gov** (public API). Track hiring volume by agency (DHS, CBP, ICE, DOJ, FBI) over time. New job postings, series/grade distributions, and location patterns reveal where enforcement capacity is being added.
- _Secondary source:_ **GovInfo budget justifications** (already ingested via GovInfo fetcher). CBP and ICE budget justifications contain staffing level targets, academy class sizes, and personnel growth projections.
- _Metric:_ Law enforcement personnel pipeline — active postings, academy throughput, authorized vs. filled positions. When 2,000 new ICE officer postings appear in a single month, that's infrastructure build-out regardless of any accompanying rhetoric.

**10c. Surveillance infrastructure** — technical capacity for monitoring at scale.

- _Primary source:_ **SAM.gov** — DHS technology procurement (facial recognition systems, border surveillance, social media monitoring tools, biometric databases). Searchable by NAICS codes for surveillance/security technology.
- _Secondary source:_ **FBI annual FISA transparency reports** and **NSA transparency reports** (published documents, low volume, high signal).
- _Tertiary:_ Federal grants to state/local law enforcement for surveillance equipment (DOJ grant databases).
- _Metric:_ Surveillance technology spending and capability expansion over time.

**10d. Legal infrastructure** — expansion of enforcement authority and reduction of constraints.

- _Already partially captured:_ DOJ policy memos (existing DOJ source), consent decree withdrawals (CourtListener), AG opinions expanding executive enforcement power (DOJ press releases). These are currently scored within lawEnforcement and civilLiberties categories.
- _Additional signals:_ New categories of federal crime (LegiScan), mandatory minimum expansions (LegiScan + FR), asset forfeiture fund balances (published annually by DOJ), IRS enforcement budget shifts (GovInfo budget docs), OFAC sanctions expansion rate (Treasury).
- _Metric:_ Legal authority breadth — how many enforcement tools exist and how broad is their scope. Distinct from whether they're being _used_ (which is what lawEnforcement category tracks).

**10e. Financial infrastructure** — funding patterns that enable enforcement capacity.

- _Sources:_ DOJ asset forfeiture fund reports (annual), DHS budget execution reports (quarterly via GovInfo), ICE detention funding vs. expenditure (congressional reports).
- _Metric:_ Enforcement spending growth rate relative to overall budget, and gap between appropriated and requested enforcement funding.

**Data source feasibility summary:**
| Source | API | Historical | Cost | Feasibility |
|--------|-----|-----------|------|-------------|
| SAM.gov | Public REST API | Years of procurement data | Free | High |
| USAJobs.gov | Public REST API | Job postings over time | Free | High |
| SEC EDGAR | Public REST API | All quarterly filings | Free | High |
| GovInfo budget docs | Already integrated | All periods | Free | High (extend existing) |
| FBI/NSA transparency | Published PDFs | Annual, low volume | Free | Medium (PDF extraction) |
| State/local grant DBs | Varies | Partial | Free | Lower (fragmented) |

**Harder to get:** Surveillance technology procurement often obscured behind vague contract descriptions. State and local enforcement capacity (relevant for federally-directed operations) not centrally tracked. Infrastructure indicators like facility construction have long lead times — contract appears in SAM.gov months before facility is operational.

**Phase 10 structural dimensions for Layer 1:**

- Detention: bed capacity (contracted + operational), facility count, occupancy rate, new contract volume
- Personnel: active postings by agency, hiring rate vs. attrition, academy class size, authorized-vs-filled ratio
- Surveillance: technology procurement spend, contract count by capability type, grant volume to state/local
- Legal: enforcement authority count, asset forfeiture fund balance, consent decree status changes
- Financial: enforcement budget growth rate, appropriated-vs-requested gap, interagency transfer volume

**Implementation recommendation:** Start with SAM.gov + USAJobs.gov (both have well-documented public APIs, highest feasibility). Build detention capacity and personnel build-out tracking first — these are the most concrete, least ambiguous indicators. Surveillance and legal infrastructure are more interpretive and can follow. Each data source follows the same pattern as existing fetchers: API query → normalize to ContentItem → category assignment → document storage → Layer 1/2/3 processing.

---

**Cross-feature convergence framework (design before building Phases 8-10):**

_Rationale (validated 2026-03-03):_ Phases 8, 9, and 10 are most powerful when they converge. Any single signal is informative; all three lighting up simultaneously for the same policy domain tells a story that no single data source reveals. This is a higher-order version of the existing category-level convergence (structural + AI + thematic across layers). Cross-feature convergence operates across _analytical dimensions_: intent (rhetoric) + blueprint (P2025) + capability (infrastructure).

_Convergence scenario:_ (1) Rhetoric (Phase 8): President and DHS Secretary begin talking about "mass deportation operations" in week 1. (2) P2025 match (Phase 9): This language maps to P2025 Chapter 5's proposal to increase ICE detention capacity. (3) Infrastructure (Phase 10): In weeks 3-8, SAM.gov shows new detention facility contracts, USAJobs shows surge in ICE officer postings, CBP budget justification requests capacity increase.

_Architecture:_ Cross-feature convergence score per category per week. Not "are multiple layers concerned about lawEnforcement this week" (existing convergence) but "are rhetoric, P2025 implementation, and infrastructure build-out all accelerating in the same policy domain at the same time." This requires: (a) per-category rhetoric score (from Phase 8 lag analysis), (b) per-category P2025 implementation velocity (from Phase 9 status tracking), (c) per-category infrastructure build-out rate (from Phase 10 structural dimensions). When all three are elevated simultaneously, the cross-feature convergence score amplifies the signal.

_Design constraint:_ The data model decisions made for Phase 6 (speaker attribution, statement-to-action linking) must anticipate Phase 8 matching and Phase 10 infrastructure tracking. Design the cross-feature convergence schema before building any of the three phases, so data flows into a unified analytical framework rather than three separate pages that share a navigation bar.

_Build order:_ Phase 6 (rhetoric sources) first — already deep into data source work. Phase 9 (P2025) second — matcher is well-specified, proposal extraction may already be available externally. Phase 10 (infrastructure) third — requires the most new data source integration. Phase 8 (rhetoric vs. action) runs in parallel with 9 and 10 as rhetoric data becomes available. Cross-feature convergence ships after all three have baseline data.

---

**Category rename migration** (Sprint R3.3, before R-S1):

- `courts` → `judicialIndependence` across codebase (category keys, database, tests, UI, specs)
- `igs` → `executiveOversight` across codebase
- Atomic rename — all references updated in single commit

---

### Questions for Reviewers

**For ChatGPT (architectural/epistemic)**:

1. Does the three-layer approach adequately address the epistemic integrity concern — are we measuring reality rather than tuning to match expectations?
2. Is the convergence-based status system (Stable/Elevated/Divergent/Confirmed Concern) meaningfully different from the old severity-based system, or does it just add complexity?
3. The AI Pass 1 prompt deliberately avoids mentioning specific keywords, current events, or administration-specific context. Is this sufficient to prevent prompt-tuning from becoming the new keyword-tuning? What other guardrails would you add?
4. Is the "keywords as annotation only" role the right landing point, or should keywords be removed from the codebase entirely to prevent scope creep back into the scoring pipeline?
5. What failure modes does this architecture have that we haven't identified?

**For Claude Code (implementation feasibility)** — answered 2026-02-22, findings incorporated:

1. ✅ Full pgvector pipeline exists. Embeddings only for rhetoric docs — FR documents need embedding in Sprint R2.
2. ✅ Schema supports extension. `weekly_aggregates` table gets nullable columns for structural/thematic/convergence scores.
3. ✅ Structural distributions computable from existing data for Tier 1 (source_type, 63%) and Tier 2 (title heuristics, 17%). `action` field needed for remaining 20%.
4. ✅ Extend `weekly_aggregates` with nullable columns (Option A). No new tables needed.
5. ✅ Sprint R2 estimated at ~250–370 LOC. Layer 3 is adaptation of existing semantic drift and clustering services.
6. ✅ Structural scores: zero concern. Embeddings: negligible cost. Clustering: run monthly/on-demand, not weekly.
7. ✅ `action`/`subtype` capture is ~10 lines across 3 files, no schema migration (JSONB). `subtype` already partially captured but not stored.
8. ✅ Functional classifier: priority-ordered `ClassificationRule[]` pattern. Edge cases identified for "Submission for..." (must be "for OMB Review"), SES (use `includes()` not `startsWith()`), multi-category priority ordering.

Full feasibility answers available in `ARCHITECTURE_FEASIBILITY_ANSWERS.md`.

---

### Future Considerations

These items emerged from the ChatGPT and Claude Code reviews. They are validated as good ideas but are not required for initial implementation. Full specifications are tracked in `FUTURE_ROADMAP.md` (the single source of truth for all post-launch items).

**Architecture improvements (R-F1 through R-F11):** Pass 1 pre-filtering with functional classifier (R-F1), Sprint 21 keyword deprecation (R-F2), cross-category synchrony detection (R-F3), coverage health full scope (R-F4, minimum viable in R-S1), Pass 2 mechanism extraction enhancements (R-F5, core fields in R-S1), semantic escalation within functional buckets (R-F6), AI model challenge set (R-F7), semantic variance decomposition (R-F8), event retrospective harness (R-F9), UI Design Specification V4 (R-F10), Pass 2 infrastructure theme tagging (R-F11). See `FUTURE_ROADMAP.md` §Architecture Improvements for full details.

**Cross-source thematic convergence (Layer 3)**: Detect when multiple source types within a category drift in the same semantic direction simultaneously. Deferred because court opinions, press releases, and legislative text occupy fundamentally different regions of embedding space — "same direction" between different linguistic registers may not carry interpretable signal. Requires empirical investigation during baseline computation. (Source: Claude Code source expansion review)

**LegiScan per-state session-aware baselines**: National aggregate baselines may be dominated by high-volume states. Per-state baselines with session-relative time normalization would detect state-specific anomalies. Significant calibration effort — 50 state-specific models. Monitor national aggregate for concentration effects first. (Source: ChatGPT/Claude Code source expansion review)

**Status naming refinement**: "Confirmed Concern" is technically accurate but external reviewers note it could be read as a factual adjudication. Recommendation: keep internally, pair with prominent methodology context in UI. User testing with non-technical audiences should validate before public launch. (Source: Claude Code review #10, ChatGPT review feedback)

**Data contract for status naming flexibility:** Implement status as two fields: `statusInternal` (enum: `Stable | Elevated | Divergent | ConfirmedConcern | BaselineInvalid | NoData` — stored in DB, used in all backend logic) and a UI-layer `statusDisplayLabel` mapping. Keeps internal semantics stable while allowing public-facing labels to evolve based on user testing.

---

### Summary

The proposed architecture replaces keyword-driven detection with triangulated measurement across three independent layers, monitoring 14 democratic threat vectors grounded in established political science frameworks (V-Dem, Freedom House, Levitsky & Ziblatt):

1. **Structural anomaly detection** — deterministic, language-immune, measures the machinery of government. Source-type-specific structural analyzers (FR dimensions differ from CourtListener dimensions differ from LegiScan dimensions) with cross-source convergence scoring. Validated by spike findings showing Presidential Document surges, Excepted Service notice disappearance, Proposed Rule declines, selective prosecution claims up 663%, and institutional capacity collapse (FEC quorum loss, IG firings) already visible in metadata.
2. **AI two-pass assessment** — meaning-sensitive, reads for understanding, produces cited analysis with different models for epistemic independence. Includes false-negative audit sampling to prevent Pass 1 from becoming a silent filter.
3. **Thematic drift detection** — embedding-based, uses per-source-type baselines with intra-administration rolling window to detect semantic content shifts. Source-type segregation prevents source composition changes from appearing as thematic drift. Per-source-type drift tracked independently; cross-source thematic convergence deferred pending empirical validation.

No single layer is sufficient. The system's confidence comes from convergence — when independent methods using fundamentally different approaches agree that something is unusual, that's a robust signal. When they disagree, the pattern of disagreement is itself informative.

The 13 categories cover all recognized erosion mechanisms: executive overreach, regulatory capture, civil service politicization, judicial independence, electoral integrity, selective enforcement, civil liberties, media freedom, government transparency, fiscal weaponization, watchdog independence, military in domestic politics, and immigration enforcement. Document sources extend beyond the Federal Register to include CourtListener, DOJ API, GovInfo/GAO, LegiScan, FEC, FCC, and IG reports — validated by availability spikes confirming sufficient volume, metadata quality, and historical depth for each source.

Keywords exit the detection pipeline entirely and become UI annotations and research artifacts. The dashboard status reflects convergence patterns, not severity scores. AI-generated narratives explain the findings at two reading levels, with explicit citations and counter-arguments.

The system's primary claim is modest and defensible: "Here's how the administrative record deviates from baseline, measured three independent ways, across all recognized democratic erosion vectors. Here's our analysis of what that might mean." The measurement is reproducible. The analysis is clearly labeled as interpretation. The methodology is published and versioned. The instrument measures reality rather than being tuned to match expectations.
