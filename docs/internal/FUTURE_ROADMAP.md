# Democracy Monitor — Future Roadmap (Post-Launch)

**Purpose**: Single source of truth for all validated improvements and feature phases planned after launch. Items here have been reviewed and endorsed during architectural design sessions but are deferred to post-launch sprints.

**Relationship to other documents**:

- `ROADMAP.md` — covers everything through launch (Sprints 11-21, R1-R5, R-S1, R-CL1)
- `ARCHITECTURE_PROPOSAL.md` — contains the architectural vision for Phases 5-10 in its roadmap section; this document contains the implementation-level specifications
- `ARCHITECTURE_ROADMAP.md` — **superseded by this document** (all items migrated here)

**How to use this document**: When starting sprint planning, review this list for items that may be relevant to current work. When new ideas emerge during implementation, add them to the "Added During Implementation" section with date and source attribution rather than expanding the current sprint scope.

---

## Table of Contents

1. [Architecture Improvements (R-F items)](#architecture-improvements)
2. [Surviving Features (from original Sprint 23-29 plan)](#surviving-features)
3. [Phase 5 — Deferred Sources](#phase-5--deferred-sources)
4. [Phase 6 — Primary-Source Rhetoric](#phase-6--primary-source-rhetoric)
5. [Phase 7 — Media Coverage as Independent Signal](#phase-7--media-coverage-as-independent-signal)
6. [Phase 8 — Rhetoric vs. Action](#phase-8--rhetoric-vs-action)
7. [Phase 9 — Project 2025: Plan vs. Delivered](#phase-9--project-2025-plan-vs-delivered)
8. [Phase 10 — Authoritarian Infrastructure Build-out](#phase-10--authoritarian-infrastructure-build-out)
9. [Cross-Feature Convergence Framework](#cross-feature-convergence-framework)

---

## Architecture Improvements

Sources: ChatGPT architectural review, ChatGPT red team analysis, Claude Code technical review (2026-02-22 through 2026-02-24).

---

### R-F1: Pass 1 Pre-filtering with Functional Classifier

**Source**: Claude Code review #4 · **Layer**: 2 · **Effort**: Small (~20 LOC)
**Prerequisite**: Layer 1 functional classifier operational (Sprint R2 ✅)

Documents classified by Layer 1 as `financial_regulatory` or `cultural_ceremonial` are formulaic (SEC filings, cultural import determinations) and extremely unlikely to be relevant to erosion concerns. Skipping Pass 1 for these documents would reduce AI costs by ~15–20% with zero false-negative risk.

Conceptually clean — Layer 1's structural classification informing Layer 2's scope. Could extend to other formulaic functional buckets as confidence grows.

**Validation needed**: Run Pass 1 against a sample of these documents across all four baselines. If the flag rate is < 0.5%, pre-filtering is safe.

**Implementation**: Add a `PASS1_SKIP_BUCKETS` constant to the Layer 2 pipeline. Documents in those buckets still get embedded (Layer 3) and counted (Layer 1) but don't go through AI assessment.

---

### R-F2: Sprint 21 Preservation vs. Deprecation

**Source**: Claude Code review #7 · **Layer**: Keywords/annotations · **Effort**: Medium (~2–4 hours)
**Prerequisite**: Sprint R4 (keywords demoted to annotation role)

Sprint 21 added 56 operational keywords, the `admin-specific-keywords.ts` overlay system, and `getEffectiveKeywords()` pipeline integration. Under the new architecture:

- **Preserve**: Admin overlay data as annotation metadata (highlighting "DOGE," "Schedule F" etc. in document text). The keyword dictionaries themselves as a research artifact documenting terminology evolution.
- **Simplify**: The overlay's date-filtering complexity was built for scoring. For annotation use, it only needs to know "should this keyword be highlighted for documents in this administration?" — much simpler logic.
- **Deprecate**: `getEffectiveKeywords()` pipeline integration into the assessment engine. The scoring pathway through `document-scorer.ts`.

---

### R-F3: Cross-Category Synchrony Detection

**Source**: ChatGPT red team analysis #4 · **Layer**: Convergence synthesis · **Effort**: Medium (~50–80 LOC)
**Prerequisite**: Convergence synthesis operational (Sprint R2+ ✅)

Small anomalies across many categories in the same week may indicate coordinated action. Currently mentioned as "cross-category clustering" in Layer 1's capabilities list but not implemented as a first-class metric.

**Proposed implementation**: After computing per-category status, count how many categories are simultaneously at Elevated or above. If N > threshold (e.g., 5 of 13 categories elevated in the same week), flag as a cross-category synchrony event. This is a meta-signal above individual category status. Already feeds the Administration Overview page's synchrony chart.

**UI element**: A dashboard-level indicator (separate from individual category cards) showing "X of 13 categories elevated this week" with historical sparkline.

---

### R-F4: Coverage Health Monitoring (Full Scope)

**Source**: ChatGPT red team analysis #5 · **Layer**: Infrastructure · **Effort**: Medium (~100–150 LOC + dashboard)
**Note**: Minimum viable scope **ships in Sprint R-S1 Phase 1** (per-source-type document count per day, "source silent" alerts, DOJ taxonomy change tracking). This R-F item covers the full operational dashboard beyond what R-S1 delivers.

Full scope beyond R-S1:

- Schema change detection (source publishing format changes)
- Seasonal dip classification (distinguishing recess from silence)
- "Other/unclassified" functional bucket ratio monitoring — a spike may indicate the government is changing metadata conventions, which could be an evasion tactic
- Per-source historical baseline comparison (not just silence detection but volume deviation)
- Admin-facing operational dashboard with source status, last successful fetch, document counts vs. expected

---

### R-F5: Pass 2 Mechanism Extraction Fields (Full Scope)

**Source**: ChatGPT red team analysis #3 · **Layer**: 2 (Pass 2) · **Effort**: Small (prompt + schema change)
**Note**: Core fields **ship in Sprint R-S1 Phase 3** (`powerCreatedOrExpanded`, `oversightReduced`, `enforcementLeverChanged`, `dueProcessChanged`, `accessToSystemsChanged`). This R-F item covers enhancements beyond initial deployment.

Enhancements:

- Mechanism taxonomy refinement based on initial deployment data (are the 5 fields the right decomposition?)
- Cross-document mechanism linking (same mechanism appearing across multiple documents in a week)
- Mechanism trend analysis (which mechanisms are appearing more frequently over time)
- Mechanism-based filtering in the admin review queue (surface documents by mechanism type)

---

### R-F6: Semantic Escalation Within Functional Buckets

**Source**: ChatGPT red team analysis #2 · **Layer**: 3 · **Effort**: Medium–Large
**Prerequisite**: Layer 1 functional classifier + Layer 3 operational

Track embedding drift _within_ each institutional function bucket, not just at the category level. Example: within the "personnel guidance" functional bucket for civilService, detect that the semantic content shifted from hiring-related guidance to termination-related guidance — even though the document count, type, and functional classification are identical.

This catches the most sophisticated evasion: keeping structure, function, and volume identical while changing substance within a functional category.

**Implementation**: Sub-cluster Layer 3's embeddings by functional bucket. Compute per-bucket centroid distance against the administration's rolling window. Report significant intra-bucket drift alongside category-level drift.

---

### R-F7: AI Model Challenge Set

**Source**: ChatGPT red team analysis #3 · **Layer**: 2 · **Effort**: Medium (initial curation) + Small (ongoing)
**Prerequisite**: Pass 1 + Pass 2 operational (Sprint R3 ✅)

Maintain a fixed test suite of known documents where stable classifications are expected. Run Pass 1 and Pass 2 against the challenge set whenever models are updated or prompts are revised. Track classification stability over time.

**Purpose**: Detect model drift, prompt sensitivity, and regression. If a model update changes classifications on known documents, that's a signal to investigate before deploying the update to production.

**Implementation**: ~50–100 curated documents spanning routine governance, known erosion events, and edge cases. Stored as versioned fixtures. Run as part of the model-update baseline regeneration process.

---

### R-F8: Semantic Variance Decomposition

**Source**: ChatGPT final architectural review (2026-02-22) · **Layer**: 3 · **Effort**: Medium (~80–120 LOC)
**Prerequisite**: Layer 3 operational with clustering (Sprint R2 ✅)

Layer 3's centroid drift can be caused by vocabulary modernization, template changes, or drafting personnel turnover — not just institutional change. A variance decomposition metric would sharpen signal specificity:

- **Within-cluster variance**: How much are documents varying within established topic clusters? An increase suggests stylistic or formatting changes.
- **Between-cluster variance**: How spread apart are the cluster centroids? An increase suggests substantive institutional change — the agency's output is fragmenting into more distinct topic areas.

Substantive institutional change (e.g., an agency pivoting from guidance to enforcement) typically increases between-cluster variance. Stylistic change (e.g., new leadership's writing preferences) typically increases within-cluster variance without moving centroids.

**Implementation**: After computing k-means clusters, decompose total embedding variance into within-cluster and between-cluster components (standard ANOVA decomposition on high-dimensional vectors). Track the ratio over time.

**UI element**: Optional diagnostic on the Layer 3 thematic drift panel — "variance type: structural" vs. "variance type: stylistic" annotation when drift is detected.

---

### R-F9: Event Retrospective Harness

**Source**: ChatGPT red team validation analysis (2026-02-22) · **Layer**: All / validation · **Effort**: Large (~200–300 LOC + analysis time)
**Prerequisite**: Full three-layer system operational (Sprint R3 ✅)

Run three known institutional events — DOGE establishment, USAID closure, and IG firings — through the complete three-layer pipeline retrospectively. For each event, report per week:

- Which layers fired (elevated vs. normal)
- Signal strength (z-scores, flag rates, centroid distances)
- Whether convergence status changed
- Which specific documents were the top drivers
- Which layer triggered first

**Expected detection patterns** (from ChatGPT analysis):

- **DOGE**: Layer 2 first (AI flags presidential documents and news), Layer 1 corroborates (presidential document surge in civilService). Layer 3 follows later as semantic cluster emerges.
- **USAID closure**: Layer 1 convergence gap first (news spike without corresponding government documents) or Layer 2 (news/WH coverage). Layer 1 structural FR signal may be weak since the action was largely operational.
- **IG firings**: Layer 2 first (AI flags oversight-related reporting), Layer 1 may show convergence gap. Layer 3 follows if it becomes a sustained theme.

**Purpose**: Ultimate practical validation. Produces: (1) public methodology chapter demonstrating detection capabilities, (2) calibration reference for threshold adjustment, (3) credibility artifact for open-source release.

**Implementation**: Standalone script that takes a date range and event description, runs all three layers against stored data, produces structured report. Generalizable into reusable "event analysis" tool.

---

### R-F10: UI Design Specification V4

**Source**: Architecture review process (2026-02-24) · **Layer**: All (UI) · **Effort**: Large (~2–3 days)
**Prerequisite**: Sprint R3 complete, real three-layer output available

The UI Design Specification V3 was written against the original keyword-severity architecture. V4 rewrites all data-model-dependent sections while preserving architecture-independent decisions (visual language, reading level toggle, dark/light mode, responsive design, embed pattern). A divergence map (`UI_V3_DIVERGENCE_MAP.md`) documents every V3 section that needs updating.

Key changes: Status system (Stable/Warning/Drift/Capture → Stable/Elevated/Divergent/Confirmed Concern/No Data), scoring (single decay-weighted → three-layer convergence), AI (single AI Skeptic → two-pass with false-negative audit), keywords (detection drivers → annotations only), new pages (Administration Overview as primary entry point), category detail (single trend chart → three-panel visualization).

**Approach**: Write V4 after Sprint R3, when real three-layer output provides concrete examples. The Architecture Proposal's Dashboard Visualization section serves as the interim UI specification for Sprint R4.

---

### R-F11: Pass 2 Infrastructure Theme Tagging

**Source**: Architecture design discussion (2026-02-24) · **Layer**: 2 (Pass 2) · **Effort**: Small (prompt + schema)
**Prerequisite**: Next baseline re-run (AI model version update, ~2–4× per year)
**Trigger**: Add to Pass 2 prompt and output schema _before_ the next scheduled baseline re-run so theme tags ride the re-run at zero additional cost.

Add boolean fields to Pass 2 output: `detentionIncarceration`, `surveillanceApparatus`, `criminalizationOfOpposition`. Each boolean indicates whether the document relates to that cross-cutting theme, regardless of which monitoring category it belongs to.

**What this enables**:

- Per-theme document counts across all categories per week, with baseline rates for comparison
- Structural metric for infrastructure convergence: "N themes simultaneously active across M categories"
- Replaces the V3 keyword-based infrastructure convergence with AI-based theme detection (language-immune, no treadmill)
- The Opus narrative synthesis continues but can cite structured theme data rather than relying solely on cross-category interpretation

**Why deferred**: All four baselines have already been run through Pass 2. Adding theme tags now would require re-running all baseline assessments (~$28–60). Instead, add the fields before the next model-version baseline re-run, when the re-run cost is already budgeted.

---

## Surviving Features (from original Sprint 23–29 plan)

These features were planned in the original Sprint 23-29 sequence and survive under the new architecture with modifications.

---

### Admin Auth + Review Queue (was Sprint 24)

**Effort**: Medium
**Prerequisite**: Sprint R4 dashboard operational

- Admin authentication (shared-secret token)
- Feedback store for human review decisions
- Review queue page showing Pass 2 assessments for human review (replaces old keyword-based alerts)
- Feedback fields on assessment records
- See original Sprint 24 plan and V3 Addendum Sprint D for full specification

---

### Suppression Learning + Proposals (was Sprint 26)

**Effort**: Medium–Large
**Prerequisite**: Admin review queue operational, sufficient Pass 2 data

- Feedback learning pipeline using Pass 2 assessment patterns
- Admin proposal review for prompt adjustments and threshold changes
- See original Sprint 26 plan and V3 Addendum Sprint E

---

### Onboarding + Responsive Polish + Performance (was Sprint 28)

**Effort**: Medium
**Prerequisite**: Dashboard feature-complete

- First-time visitor onboarding flow
- Mobile-responsive layouts across all pages
- Performance optimization (bundle size, data loading, caching)
- See original Sprint 28 plan and UI spec sections 4.5, 4.6, 10.2

---

## Phase 5 — Deferred Sources

Post-launch supplementary data sources that didn't make the R-S1 cut.

- **Oversight.gov scraping** — all 75 IGs. No API exists; community scraper (inspectors-general project) is spotty. Would provide direct IG report access for executiveOversight category. Significant maintenance burden per-IG.
- **VRL partnership** — Voting Rights Lab calibration dataset for LegiScan AI classification accuracy. Would provide ground-truth labels for state voting legislation, enabling precision/recall measurement on the system's LegiScan assessments.
- **CBO reports pipeline** — Congressional Budget Office fiscal analysis. Low-volume supplementary signal for fiscal category.

---

## Phase 6 — Primary-Source Rhetoric

_Full architectural specification in `ARCHITECTURE_PROPOSAL.md` Phase 6._

Post-launch, before the media sprint. Builds the primary-source rhetoric content that feeds Phases 7 and 8.

### 6a. Congressional Record (CREC) via GovInfo

**Feasibility**: Confirmed (2026-03-03). GovInfo API collection `CREC`, available across all 5 periods (2017-2026), full HTML text via granule download. Volume: 75-491 entries/week.

**Speaker parsing**: Solved problem. `unitedstates/congressional-record` parser (Python, maintained) converts GPO HTML into structured per-speaker turns. Stanford's Congressional Speech Dataset validated this approach across 14 million speeches (1879-2022) with ICPSR ID linking. Procedural content filtered automatically.

**Ingestion pattern**: Fetch CREC HTML → parse by speaker → store each substantive speech as separate document with speaker metadata (name, party, state, ICPSR ID). Each document is one speaker's remarks on one topic — much better unit for Layer 2 than 240K-char monolithic debate transcripts.

**Open design decisions**:

1. **Filtering strategy** — unfiltered CREC includes procedural noise ("PLEDGE OF ALLEGIANCE", "ADDITIONAL SPONSORS"). Keyword filtering per category needed but risks missing novel rhetoric if too aggressive. Options: broad filter (remove only clearly procedural), narrow filter (category-specific keywords), or ingest all and let Layer 2 triage.
2. **Category routing** — which categories receive CREC documents and via what rules. Floor speeches touch multiple categories; need multi-category routing or primary-category assignment.
3. **CREC-specific Layer 1 dimensions** — speaker party distribution, bipartisan vs. party-line rhetoric patterns, debate length as contentiousness proxy, amendment volume.

**Estimated effort**: Medium–Large (new fetcher + parser integration + speaker metadata schema + category routing rules)

### 6b. Cabinet and VP Rhetoric via Agency Newsrooms

**Feasibility**: Confirmed (2026-03-03). Every cabinet agency publishes speeches, transcripts, and press releases on .gov domains with dates, speaker attribution, and verifiable URLs.

**Tier 1 (recommended first sprint)**:

- **DOJ** — extend existing justice.gov fetcher to include AG speeches and testimony transcripts
- **State Department** — structured newsroom, archived versions cover baseline periods (2009-2017.state.gov, 2017-2021.state.gov)
- **DHS** — Secretary statements, directly relevant to immigrationEnforcement and lawEnforcement
- **VP office** — whitehouse.gov VP remarks (may be captured by WH content backfill)

**Tier 2**: Treasury, Defense, HHS — lower volume but valuable for specific categories.

**Tier 3 (meta-source)**: American Presidency Project (UCSB) — 250K+ presidential documents including spoken addresses, news conferences, statements. Covers all administrations going back decades. No API but structured and scrapable.

**Pipeline pattern (per agency)**: RSS or paginated listing → fetch full page → extract transcript text → attribute to speaker → store as document with speaker metadata.

**Data model requirement**: `speaker` field on documents table (or `speaker_id` linked to a people table with name, role, party, agency). Enables per-official rhetoric tracking, cross-agency rhetorical coordination detection, and per-speaker rhetoric-to-action lag measurement. **Design this before building any Phase 6 fetcher** — it feeds Phases 8 and 10.

**Estimated effort**: Medium per agency (each is a separate fetcher following the same pattern). Recommend DOJ extension + State Department first to validate, then expand.

### 6c. Presidential Social Media (Truth Social)

**Feasibility**: Partial (2026-03-03). For the current president specifically, multiple third-party archives with structured access exist:

- CNN-maintained archive (JSON/CSV/parquet, updates every 5 minutes)
- American Presidency Project (UCSB, archived by date)
- Trump's Truth (Defending Democracy Together, searchable index with video transcripts and image descriptions)
- Truthbrush (Stanford Internet Observatory, open-source Python client)

For other officials: access much more limited. As of August 2025, Truth Social requires auth for non-prominent users.

**X/Twitter**: Effectively dead as research source. API: $200/month Basic (10K tweets, 7-day search), $5,000/month Pro (1M tweets, full archive). Academic access nominally restored under EU DSA but rarely granted.

**Bluesky**: Bright spot. Firehose API is free, open, unauthenticated, real-time. Growing fast but not yet where primary political rhetoric happens. Worth monitoring as coverage increases.

**Analytical value**: Gap between official record (Ring 1) and direct-to-public channels (Ring 2) is itself a signal. Social media rhetoric often signals direction before policy follows. When social media escalates 2-3 weeks before corresponding official actions, the lag feeds Phase 8 analysis.

**Estimated effort**: Small–Medium (ingest from existing archives, no scraping needed for presidential posts)

### 6d. MediaCloud Investigation

**Status**: Needs API spike. MediaCloud UI search confirms historical coverage back to 2017. Need to verify programmatic access to full article text.

If viable: provides media rhetoric content across all periods, filling the gap GDELT cannot (GDELT DOC API returns metadata only; Context API limited to 72-hour lookback). Would supplement or replace GDELT as media coverage content source while GDELT remains the volume/tone signal for Layer 1.

**Estimated effort**: Small (API spike) → Medium (fetcher if viable)

**Post-ingestion**: Recompute rhetoric-dependent baselines after CREC/agency newsroom/MediaCloud ingestion.

---

## Phase 7 — Media Coverage as Independent Signal

_Full architectural specification in `ARCHITECTURE_PROPOSAL.md` Phase 7._

Post-rhetoric sprint. Media coverage patterns are themselves a democracy health indicator, independent of government rhetoric.

### Threat Scenarios

1. **Coverage suppression** — topic that normally generates N articles/week across diverse outlets drops to near-zero. Same architectural pattern as Layer 1 volume collapse, applied to media coverage per category.

2. **Source concentration / framing diversity** — coverage from many outlets but substantively identical framing within hours. Distribution of framing diversity is a measurable signal; when it collapses, something is directing coverage.

3. **Tone asymmetry** — divergence between media tone (GDELT tone scores) and the system's own Layer 2 assessments. Uniformly positive media coverage of an action that Layer 2 flags as `clearly_concerning` is informative.

4. **Coverage displacement** — major government actions generating almost no media scrutiny because the media cycle is dominated by something else. System would flag action through FR/DOJ/CL sources; absence of media scrutiny is additional convergence context.

### Requirements

- **Category mapping**: mediaFreedom is primary home (currently nearly empty). infoAvailability gains "public reach" dimension. All categories benefit from "media scrutiny" convergence input.
- **Media-specific structural dimensions** for Layer 1 (distinct from government document dimensions)
- **Media-specific baselines** (media coverage has different seasonal patterns than government publishing)
- **Integration into convergence formula** — media scrutiny as a convergence input alongside structural/AI/thematic layers

**Estimated effort**: Large (new analytical framework, new baselines, convergence formula changes)

---

## Phase 8 — Rhetoric vs. Action

_Full architectural specification in `ARCHITECTURE_PROPOSAL.md` Phase 8._

Requires Phase 6 rhetoric data. Measures whether and how quickly rhetoric becomes policy.

### What Exists

- `intent-service.ts` scores rhetoric and action keywords per policy area
- `intent-snapshot-store.ts` saves snapshots
- UI spec defines `/rhetoric` page with Summary and Detailed modes
- No temporal lag analysis engine exists
- No statement-to-action matching engine exists

### Components

1. **Cross-correlation lag analysis** — for each policy area, compute cross-correlation between weekly rhetoric and action score time series at lags 0-12 weeks. Peak correlation and lag position quantify "how long after officials say X does corresponding policy action appear." Store in `intent_weekly` or dedicated `rhetoric_lag` table.

2. **Aggregate mode (Summary)** — per-policy-area table: top rhetoric keyword, top action keyword, lag in weeks. Available with existing keyword infrastructure. This is the V3 System Spec Phase 6 deliverable.

3. **Matched-pairs mode (Detailed)** — linking _specific_ attributed statements ("Secretary of DHS said X on date Y") to _specific_ government actions ("DHS published rule Z three weeks later"). New matching engine required. Approach: embed individual rhetoric statements and action documents, find cosine-similar pairs across the temporal lag window, LLM judge confirms causal relationship. Similar to P2025 matcher pattern but operating on a rolling window.

4. **Speaker-level tracking** — with `speaker` metadata from Phase 6, compute per-official rhetoric-to-action patterns. Which officials' rhetoric most reliably predicts policy action? Trial balloons (long lag, low conversion) vs. policy announcements (short lag, high conversion).

5. **Ring analysis** — when Phase 6 provides rhetoric from multiple "rings" (official record, direct-to-public, surrogates), measure whether rhetoric appears in Ring 2 (social media) before Ring 1 (official record), and whether surrogate rhetoric (Ring 3, congressional allies) precedes executive action. Lag between rings is itself a signal.

**Estimated effort**: Large (lag analysis: Medium; matched-pairs engine: Large; speaker tracking: Medium; ring analysis: Medium)

---

## Phase 9 — Project 2025: Plan vs. Delivered

_Full architectural specification in `ARCHITECTURE_PROPOSAL.md` Phase 9._

Can begin in parallel with Phase 6. Tracks implementation progress against the published Project 2025 blueprint.

### What Exists

- V3 System Spec defines schema (`p2025_proposals`, `p2025_matches`), matcher service, LLM judge prompt with 4-level classification (NOT_RELATED / LOOSELY_RELATED / IMPLEMENTS / EXCEEDS)
- 14 seed proposals in `lib/data/p2025/seed-proposals.ts`
- UI spec defines `/p2025` page with status breakdown and per-area progress

### What's Missing

1. **Proposal extraction at scale** — 920-page document needs systematic extraction. **Shortcut**: Democracy Forward, Brookings P2025 tracker, and others have already extracted and categorized proposals. Their extraction could serve as seed data (with attribution) rather than doing independent extraction. Verify licensing/attribution requirements before use.

2. **Status persistence** — tracking that proposal X was "in progress" last week and is now "implemented" requires state tracking over time. UI spec flags this as needing `p2025_tracking` table. Weekly snapshot records current status per proposal. Enables "implementation velocity" metric.

3. **"Exceeded" detection** — LLM reasoning about whether government actions go beyond proposals. Currently a single-run assessment, not a persisted longitudinal status. Needs temporal tracking to answer "when did it cross from implements to exceeds."

### Components

1. **Proposal extraction sprint** — ingest existing third-party extractions or perform independent extraction. Each proposal: id, chapter, target agency, mapped dashboard category, severity, text, summary, embedding. Human review required for quality.

2. **Matcher pipeline** — embed proposals, run cosine similarity against new documents weekly, LLM judge classifies top-K candidates. Store matches with confidence and reasoning. Straightforward given existing embedding infrastructure.

3. **Status persistence** — `p2025_tracking` table storing proposal status over time. Weekly snapshot per proposal.

4. **Category integration** — P2025 match counts become additional convergence input per category. A category with high Layer 1/2/3 scores _and_ active P2025 implementation is qualitatively different from high scores alone.

**Estimated effort**: Medium–Large (extraction: depends on shortcut vs. independent; matcher: Medium; persistence: Small; integration: Small)

---

## Phase 10 — Authoritarian Infrastructure Build-out

_Full architectural specification in `ARCHITECTURE_PROPOSAL.md` Phase 10._

Requires the most new data source integration. Tracks _operational capacity_ for authoritarian action — the physical, personnel, and legal infrastructure that makes authoritarian action possible at scale.

_Rationale (validated 2026-03-03):_ Nobody else systematically tracks this. Plenty of organizations track executive orders and court rulings. Very few track whether the government is building the infrastructure that would make authoritarian action _possible at scale_. This is the capability dimension — "even if the government hasn't done X yet, could it do X tomorrow?"

### 10a. Detention Capacity

Physical infrastructure for mass detention.

- **SAM.gov** (public REST API) — detention facility contracts, bed capacity expansions, facility construction. Searchable by agency (ICE, CBP), NAICS code, keyword. Historical data available.
- **SEC EDGAR API** — quarterly filings from GEO Group (GEO) and CoreCivic (CXW). Contracted bed counts, occupancy rates, revenue per detainee, new facility announcements.
- **DHS/ICE/CBP statistical tables** — encounters, detention bed counts, removals. Excel/PDF download, quarterly batch. _(Moved from Phase 5 — fits better as infrastructure signal.)_
- **Metric**: Total available detention bed capacity over time.

### 10b. Personnel Build-out

Organizational capacity for enforcement at scale.

- **USAJobs.gov** (public REST API) — hiring volume by agency (DHS, CBP, ICE, DOJ, FBI). Job postings, series/grade distributions, location patterns.
- **GovInfo budget justifications** (already ingested) — staffing level targets, academy class sizes, personnel growth projections in CBP/ICE budget docs.
- **Metric**: Law enforcement personnel pipeline — active postings, academy throughput, authorized vs. filled positions.

### 10c. Surveillance Infrastructure

Technical capacity for monitoring at scale.

- **SAM.gov** — DHS technology procurement (facial recognition, border surveillance, social media monitoring, biometric databases). Searchable by NAICS codes.
- **FBI/NSA transparency reports** — published annually, low volume, high signal. PDF extraction required.
- **Federal grants** — DOJ grant databases for state/local surveillance equipment.
- **Metric**: Surveillance technology spending and capability expansion over time.

### 10d. Legal Infrastructure

Expansion of enforcement authority and reduction of constraints.

- **Already partially captured**: DOJ policy memos, consent decree withdrawals (CourtListener), AG opinions (DOJ press releases). Currently scored within lawEnforcement and civilLiberties.
- **Additional signals**: New crime categories (LegiScan), mandatory minimum expansions (LegiScan + FR), asset forfeiture fund balances (DOJ annual), IRS enforcement budget shifts (GovInfo), OFAC sanctions expansion rate (Treasury).
- **Metric**: Legal authority breadth — how many enforcement tools exist and how broad is their scope. Distinct from whether they're being _used_ (tracked by lawEnforcement category).

### 10e. Financial Infrastructure

Funding patterns enabling enforcement capacity.

- DOJ asset forfeiture fund reports (annual), DHS budget execution reports (quarterly via GovInfo), ICE detention funding vs. expenditure (congressional reports).
- **Metric**: Enforcement spending growth rate relative to overall budget.

### Data Source Feasibility

| Source                | API                | Historical  | Cost | Feasibility             |
| --------------------- | ------------------ | ----------- | ---- | ----------------------- |
| SAM.gov               | Public REST        | Years       | Free | High                    |
| USAJobs.gov           | Public REST        | Years       | Free | High                    |
| SEC EDGAR             | Public REST        | All filings | Free | High                    |
| GovInfo budget docs   | Already integrated | All periods | Free | High (extend existing)  |
| FBI/NSA transparency  | Published PDFs     | Annual      | Free | Medium (PDF extraction) |
| State/local grant DBs | Varies             | Partial     | Free | Lower (fragmented)      |

### Layer 1 Structural Dimensions

- **Detention**: bed capacity (contracted + operational), facility count, occupancy rate, new contract volume
- **Personnel**: active postings by agency, hiring rate vs. attrition, academy class size, authorized-vs-filled ratio
- **Surveillance**: technology procurement spend, contract count by capability type, grant volume to state/local
- **Legal**: enforcement authority count, asset forfeiture fund balance, consent decree status changes
- **Financial**: enforcement budget growth rate, appropriated-vs-requested gap, interagency transfer volume

### Implementation Recommendation

Start with SAM.gov + USAJobs.gov (both well-documented public APIs, highest feasibility). Build detention capacity and personnel build-out first — most concrete, least ambiguous indicators. Surveillance and legal infrastructure are more interpretive and can follow. Each source follows the same pattern as existing fetchers: API query → normalize to ContentItem → category assignment → document storage → Layer 1/2/3 processing.

**Harder to get**: Surveillance procurement often obscured behind vague contract descriptions. State/local enforcement capacity not centrally tracked. Infrastructure indicators like facility construction have long lead times (contract in SAM.gov months before facility operational).

**Estimated effort**: Large per sub-dimension (each requires new fetcher + new structural dimensions + new baselines)

---

## Cross-Feature Convergence Framework

_Design before building Phases 8-10. Full specification in `ARCHITECTURE_PROPOSAL.md`._

_Rationale (validated 2026-03-03):_ Phases 8, 9, and 10 are most powerful when they converge. Any single signal is informative; all three lighting up simultaneously for the same policy domain tells a story no single data source reveals. This is a higher-order version of existing category-level convergence (structural + AI + thematic across layers). Cross-feature convergence operates across _analytical dimensions_: intent (rhetoric) + blueprint (P2025) + capability (infrastructure).

**Convergence scenario**: (1) Rhetoric: President and DHS Secretary begin talking about "mass deportation operations" in week 1. (2) P2025 match: Language maps to Chapter 5's proposal to increase ICE detention capacity. (3) Infrastructure: In weeks 3-8, SAM.gov shows new detention facility contracts, USAJobs shows ICE officer posting surge, CBP budget justification requests capacity increase.

**Architecture**: Cross-feature convergence score per category per week. Not "are multiple layers concerned about lawEnforcement" (existing convergence) but "are rhetoric, P2025 implementation, and infrastructure build-out all accelerating in the same policy domain at the same time." Requires: (a) per-category rhetoric score from Phase 8, (b) per-category P2025 implementation velocity from Phase 9, (c) per-category infrastructure build-out rate from Phase 10. When all three are elevated simultaneously, the cross-feature convergence score amplifies the signal.

**Design constraint**: Data model decisions for Phase 6 (speaker attribution, statement-to-action linking) must anticipate Phase 8 matching and Phase 10 infrastructure tracking. Design the cross-feature convergence schema before building any of the three phases.

**Build order**: Phase 6 (rhetoric sources) first → Phase 9 (P2025) second → Phase 10 (infrastructure) third → Phase 8 (rhetoric vs. action) in parallel as rhetoric data becomes available → Cross-feature convergence after all three have baseline data.

**Estimated effort**: Medium (schema design + convergence scoring logic), but depends on Phases 8-10 being operational

---

## Added During Implementation

_(Items added as work progresses — append here with date and source)_

---

## Completed

_(Move items here when implemented, with sprint reference)_
