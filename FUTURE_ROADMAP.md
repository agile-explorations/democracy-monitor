# Democracy Monitor — Future Roadmap

Democracy Monitor is an open-source platform that detects democratic erosion signals by analyzing the U.S. government's own documentary record. The system reads hundreds of thousands of government documents — federal regulations, court filings, DOJ enforcement actions, presidential statements, inspector general reports, legislative bills, and election commission records — and uses three independent detection layers (structural anomaly analysis, AI document assessment, and thematic drift monitoring) to identify patterns that warrant public attention.

The current system monitors 14 democratic threat vector categories with documents from 9 primary sources across 5 historical periods. It detects known erosion events (IG firings, agency shutdowns, civil service restructuring, executive order surges) with 77% accuracy while maintaining low false positive rates during baseline governance periods.

This roadmap describes four planned releases that extend the platform's analytical capabilities. Each addresses a distinct gap in democratic oversight that no existing tool fills.

**Release order and rationale:**

1. **Detection Quality & Platform Hardening** — foundation must be solid before building on it. Every subsequent release depends on accurate, calibrated detection.
2. **Project 2025: Plan vs. Delivered** — requires almost no new data sources (the system already ingests the government documents that implement the proposals). Proposal extraction is available from third parties. The most immediately actionable feature for the public: "34% of Project 2025 proposals show implementation activity" is a headline that drives adoption and sponsorship. Also the most analytically defensible — matching documents against published proposals is a concrete factual question, not an interpretive judgment.
3. **Rhetoric vs. Action** — requires substantial new source integration (Congressional Record, agency newsrooms, social media archives) but those sources have independent value even before the lag analysis engine is built. The matched-pairs engine and ring analysis are the sophisticated features that take longer; the source integration delivers value immediately through the existing three-layer pipeline.
4. **Authoritarian Infrastructure Build-out** — the most novel contribution (nobody else tracks operational capacity for authoritarian action) but requires the most new data source integration (SAM.gov, USAJobs, SEC EDGAR). Its analytical power is maximized when it converges with Releases 2 and 3, so building it last lets the convergence framework be designed with real data rather than speculatively. Exception: if a specific infrastructure signal becomes urgent (e.g., detention contracts surge), the relevant fetcher can be fast-tracked as a standalone source addition without building the full analytical framework.

---

## Release 1: Detection Quality & Platform Hardening

### Why It Matters

A democracy monitoring tool is only as credible as its accuracy. False positives erode trust ("the system cries wolf"), false negatives create blind spots ("the system missed something important"), and data quality issues undermine every downstream analysis. Before adding new features, the platform must achieve the highest possible detection accuracy on events the public record already contains.

The current system detects 77% of known democratic erosion events across 2017-2026. The remaining 23% are split between genuine source gaps (events that primarily manifested in rhetoric or media coverage, not government documents), statistical limitations (thin categories where normal variance exceeds detection thresholds), and calibration opportunities (documents that exist in the database but aren't yet surfaced by the detection layers).

This release closes every gap that can be closed with the existing source stack, builds the operational infrastructure for ongoing accuracy improvement, and establishes the human review processes that keep the system honest.

### Key Features

**Detection calibration.** Per-category adaptive thresholds that account for document volume — a category with 6 documents per week needs different statistical treatment than one with 300. Thin categories (judicialIndependence, elections, immigrationEnforcement) currently produce noisy structural scores that inflate false positive rates in baseline periods. The fix involves either Poisson-based confidence intervals for small samples or per-category threshold overrides. The goal: every category passes the baseline stability test (≤5-10% elevated weeks during normal governance periods) without sacrificing true positive detection.

**Layer 3 thematic drift restoration.** The thematic drift layer is currently in reinforcement-only mode — it can strengthen signals from other layers but can't independently detect events. This is because baseline centroids were computed from contaminated embeddings (content-less court docket stubs and metadata-only media documents that have since been cleaned up). After recomputing centroids from clean data, Layer 3 should be re-evaluated as an independent signal. Its unique value proposition is detecting _gradual_ semantic drift that no single week's analysis would catch — the slow reorientation of an agency's output from "oversight" language to "efficiency" language over months, invisible to per-document assessment but visible in the embedding trajectory.

**Admin review queue.** Human review of AI assessments is essential for ongoing calibration. When the AI flags a document as concerning, a domain expert should be able to confirm, override, or provide context. These decisions feed back into the system's understanding of what constitutes genuine erosion versus routine governance. The review queue surfaces the AI's work for human judgment without requiring humans to read every document.

**Feedback learning pipeline.** Systematic capture of human review decisions to improve detection over time. When reviewers consistently override the AI on a particular type of document (e.g., routine SEC filings that trigger false positives), the system proposes prompt adjustments or threshold changes. Every proposed change is human-approved and version-controlled — the system never silently modifies its own methodology.

**Additional data sources.** Three supplementary sources that fill specific category gaps: Oversight.gov IG reports (when an API becomes available or scraping proves reliable for all 75 IGs), Voting Rights Lab calibration data for LegiScan classification accuracy, and CBO reports for the fiscal category.

**Event retrospective harness.** A reusable tool for running known events through the complete detection pipeline retrospectively. When a new event occurs, the harness shows which layers detected it, which documents drove the detection, and what the system would have reported. This produces public methodology documentation, calibration benchmarks, and credibility artifacts for the open-source community.

**Cross-category synchrony detection.** When multiple categories are simultaneously elevated — civilService, executiveOversight, and judicialIndependence all flagged in the same week — that cross-category pattern is itself a signal above the sum of individual categories. This meta-signal detects coordinated institutional pressure that individual category monitors cannot see.

**Media coverage as independent signal.** Media coverage patterns — not the content of coverage, but the _patterns_ of coverage — are democracy health indicators. When a topic that normally generates diverse coverage across 30 outlets suddenly shows identical framing across 25 of them, something is shaping coverage. When a major government action generates almost no media scrutiny because the news cycle is dominated by something else, the absence of scrutiny is informative. This feature builds media-specific structural dimensions, media-specific baselines, and integrates media scrutiny as a convergence input alongside government document analysis.

**Platform polish.** First-time visitor onboarding, mobile-responsive layouts, performance optimization, and the ongoing UI improvements that make the system accessible to non-technical users.

### Implementation Details

| Item                                                     | Effort               | Prerequisite                                          |
| -------------------------------------------------------- | -------------------- | ----------------------------------------------------- |
| Per-category L1 threshold calibration                    | Medium               | Stable baseline data                                  |
| Layer 3 re-evaluation with clean centroids               | Medium               | Content cleanup complete, baselines recomputed        |
| Admin auth + review queue                                | Medium               | Dashboard operational                                 |
| Feedback learning pipeline                               | Medium-Large         | Review queue operational                              |
| Event retrospective harness                              | Large (~300 LOC)     | Three-layer system operational                        |
| Cross-category synchrony detection                       | Medium (~50-80 LOC)  | Convergence synthesis operational                     |
| Media coverage signal (GDELT Phase 7)                    | Large                | Media-specific baselines, convergence formula changes |
| Pass 1 pre-filtering (functional classifier)             | Small (~20 LOC)      | Layer 1 functional classifier operational             |
| AI model challenge set                                   | Medium               | Pass 1 + Pass 2 operational                           |
| Semantic variance decomposition (within/between cluster) | Medium (~80-120 LOC) | Layer 3 operational with clustering                   |
| Semantic escalation within functional buckets            | Medium-Large         | Layer 1 classifier + Layer 3 operational              |
| Pass 2 infrastructure theme tagging                      | Small                | Add before next baseline re-run                       |
| Onboarding + responsive + performance                    | Medium               | Dashboard feature-complete                            |

---

## Release 2: Project 2025 — Plan vs. Delivered

### Why It Matters

Project 2025, published by the Heritage Foundation, is a 920-page blueprint for restructuring the federal government. It proposes specific policy changes organized by agency — who to fire, what programs to cut, which regulations to reverse, how to restructure the civil service. Regardless of whether any administration formally endorses the document, it functions as a declared-intent baseline: a public, detailed plan against which government actions can be measured.

This creates a unique analytical opportunity. Most democracy monitoring compares government actions against _abstract principles_ (is judicial independence being eroded? is the civil service being politicized?). Those assessments require subjective judgment about what counts as erosion. Project 2025 comparison is different: it compares government actions against _specific, published proposals_. "Did the government do what this document said it should do?" is a concrete, auditable question with a factual answer.

The system can answer this question automatically because it already ingests the government documents that would implement the proposals — Federal Register rules, executive orders, DOJ enforcement changes, OPM workforce guidance. Matching these documents against embedded P2025 proposals is a retrieval problem, and the LLM judge that classifies matches (NOT_RELATED / LOOSELY_RELATED / IMPLEMENTS / EXCEEDS) produces an auditable explanation for each match.

The "EXCEEDS" classification is particularly important. When government actions go beyond what even Project 2025 proposed, that's a signal worth surfacing — it means the administration is moving faster or further than its own allies' blueprint anticipated.

### Key Features

**Proposal extraction and embedding.** The 920-page document needs systematic extraction into individual proposals, each with: target agency, mapped monitoring category, severity level, text, and embedding vector. Several organizations (Democracy Forward, Brookings P2025 tracker) have already extracted and categorized proposals — their work could serve as seed data with attribution, dramatically reducing the human extraction effort.

**Weekly matching pipeline.** Each week, newly ingested government documents are compared against all P2025 proposal embeddings via cosine similarity. Top candidates are evaluated by an LLM judge that classifies the relationship and provides reasoning. The judge's prompt: "The government published this document. Does it implement, exceed, or have nothing to do with this specific P2025 proposal? Explain why."

**Status tracking over time.** Each proposal has a persistent status (Not Started → In Progress → Implemented → Exceeded → Abandoned) that updates weekly based on new matches. This enables "implementation velocity" — how many proposals changed status this week, this month, this quarter? Is the pace of implementation accelerating or decelerating?

**"Exceeded" detection.** The most analytically novel feature. When the LLM judge determines that a government action goes beyond what P2025 proposed — more aggressive than the blueprint — that's a qualitatively different signal than mere implementation. Tracking which proposals are being exceeded, in which policy domains, reveals where the administration's ambitions extend beyond its declared allies' plan.

**Category integration.** P2025 match counts feed into the existing convergence scoring per monitoring category. A category with high structural/AI scores _and_ active P2025 implementation is qualitatively different from high scores alone — it adds the "declared intent" dimension to the "measured action" dimensions the system already tracks.

### Implementation Details

**Schema:**

- `p2025_proposals` table: id, chapter, target_agency, dashboard_category, severity, text, summary, embedding
- `p2025_matches` table: proposal_id, document_url, cosine_similarity, llm_classification, llm_confidence, llm_reasoning, human_reviewed
- `p2025_tracking` table: proposal_id, week_of, status, match_count (enables time-series analysis)

**Pipeline:**

1. Proposal extraction sprint — ingest existing third-party extractions or perform independent extraction. Human review required for quality.
2. Embed all proposals using the same embedding model as the document pipeline.
3. Weekly matcher: cosine similarity against new documents → top-K candidates → LLM judge classification → store matches with reasoning.
4. Status update: review new matches, update proposal status based on cumulative evidence.
5. Category integration: P2025 implementation velocity as a convergence input.

**UI:** `/p2025` page with headline statistic ("Of Y proposals tracked, X% show implementation activity"), status breakdown bar, per-area progress, and drill-down to individual proposals with their matched government documents and the AI's reasoning for each match.

**Effort:** Medium-Large. Proposal extraction depends on third-party data availability. Matcher pipeline is straightforward given existing embedding infrastructure. Status persistence is small. Category integration is small.

---

## Release 3: Rhetoric vs. Action

### Why It Matters

Democratic erosion often follows a pattern: officials first _say_ something, then they _do_ something. The rhetoric comes weeks or months before the policy. A president calls an agency "corrupt" and "wasteful" — three weeks later, DOGE enters the agency's offices and puts 10,000 employees on leave. A secretary of state announces a "reorganization" — within days, career staff are terminated and programs are cancelled.

This pattern is not unique to any administration. It is a structural feature of how governments signal, test, and implement policy changes. The lag between rhetoric and action is measurable, and the measurement itself is valuable: it tells the public what is likely coming next, how reliably officials follow through on stated intentions, and whether rhetoric is escalating faster than action (signaling worse to come) or decelerating (signaling a trial balloon that lost momentum).

No existing tool systematically measures this. Media covers rhetoric and actions separately. Fact-checkers verify individual claims. Democracy indices score outcomes annually. Nobody tracks the _temporal relationship_ between what officials say and what the government subsequently does, across every policy domain, with primary-source attribution.

Democracy Monitor can do this because it already ingests the government's formal actions (regulations, court filings, enforcement actions) and presidential statements (via the Compilation of Presidential Documents). Adding attributed rhetoric from the Congressional Record, cabinet agency newsrooms, and official social media accounts creates a complete picture of who said what, when, and whether corresponding government action followed.

### Key Features

**Congressional Record integration.** Full-text floor speeches from the Congressional Record via GovInfo API, parsed by speaker using the `unitedstates/congressional-record` open-source parser. Each document is one speaker's remarks on one topic, with party affiliation, state, and ICPSR ID metadata. This transforms 240K-character monolithic debate transcripts into individually assessable, attributed rhetoric documents. Volume: 75-491 entries per week across all five analysis periods (2017-2026). Speaker parsing is a solved problem — Stanford's Congressional Speech Dataset validated this approach across 14 million speeches from 1879 to 2022.

**Cabinet and VP rhetoric via agency newsrooms.** Every cabinet agency publishes speeches, transcripts, and press releases on .gov domains. The State Department publishes full press briefing transcripts and Secretary speeches with archived versions covering all baseline periods. DHS publishes Secretary statements directly relevant to immigration and law enforcement monitoring. DOJ (already integrated for press releases) extends to AG speeches and testimony. Each agency follows the same pipeline pattern: paginated listing → fetch full page → extract transcript → attribute to speaker → store with speaker metadata.

**Presidential social media.** For the current president, multiple third-party archives provide structured access to Truth Social posts: the CNN-maintained archive (JSON/CSV, updates every 5 minutes), the American Presidency Project at UCSB, and the Truthbrush open-source client from Stanford Internet Observatory. The gap between official record language and direct-to-public social media language is itself a signal — executive orders get formal FR language, but social media posts often use more aggressive framing that signals direction before policy follows.

**Cross-correlation lag analysis.** For each policy area, compute the cross-correlation between weekly rhetoric scores and weekly action scores at lags of 0-12 weeks. The peak correlation and its lag position quantify: "how long after officials say X does corresponding policy action appear?" This produces a per-policy-area metric that the public can track over time.

**Matched-pairs engine.** Linking _specific_ attributed statements ("Secretary of DHS said X on date Y") to _specific_ government actions ("DHS published rule Z three weeks later"). The approach: embed individual rhetoric statements and action documents, find cosine-similar pairs across the temporal lag window, LLM judge confirms the causal relationship. Each match is auditable — the user can see the original statement, the corresponding action, the time lag, and the AI's reasoning for connecting them.

**Speaker-level tracking.** With attributed rhetoric data, compute per-official rhetoric-to-action patterns. Which officials' rhetoric most reliably predicts policy action? Some officials serve as trial balloons (long lag, low conversion rate) while others make policy announcements (short lag, high conversion). Tracking these patterns per speaker reveals the administration's communication strategy.

**Ring analysis.** Rhetoric flows through concentric rings — from official record (Ring 1: Congressional Record, FR) to direct-to-public channels (Ring 2: social media, press conferences) to surrogate amplification (Ring 3: allied legislators, party leadership). When rhetoric appears in Ring 2 before Ring 1, or when Ring 3 surrogates test language that later appears in Ring 1 official actions, the progression pattern itself is informative. Measuring the lag between rings reveals how rhetoric is being operationalized.

### Implementation Details

**Phase 1 — Rhetoric sources** (build first, feeds everything else):

| Source                      | API                             | Coverage                        | Category routing                           |
| --------------------------- | ------------------------------- | ------------------------------- | ------------------------------------------ |
| Congressional Record (CREC) | GovInfo API                     | All 5 periods, 75-491/week      | Speaker-parsed, multi-category via content |
| State Department newsroom   | HTML scraping (.gov)            | Archived versions for baselines | immigrationEnforcement, executiveActions   |
| DHS newsroom                | HTML scraping (.gov)            | Secretary statements            | immigrationEnforcement, lawEnforcement     |
| DOJ AG speeches             | Extend existing DOJ API         | Already partially covered       | lawEnforcement, judicialIndependence       |
| Truth Social (presidential) | CNN archive / UCSB / Truthbrush | T2 + historical                 | Multi-category via content                 |
| VP remarks                  | Captured via CPD                | Already ingested                | Multi-category via NARA subjects           |

**Data model requirement**: `speaker` field on documents (or `speaker_id` linked to people table with name, role, party, agency). Design before building any fetcher — feeds matched-pairs, speaker tracking, and ring analysis.

**Phase 2 — Rhetoric analysis** (requires Phase 1 data):

| Component            | Effort | Description                                                                 |
| -------------------- | ------ | --------------------------------------------------------------------------- |
| Lag analysis service | Medium | Cross-correlation at 0-12 week lags per policy area                         |
| Matched-pairs engine | Large  | Embed + cosine similarity + LLM judge across temporal window                |
| Speaker tracking     | Medium | Per-official rhetoric-to-action conversion metrics                          |
| Ring analysis        | Medium | Cross-ring lag measurement and progression patterns                         |
| `/rhetoric` page     | Medium | Summary mode (lag table) + Detailed mode (matched pairs, speaker breakdown) |

---

## Release 4: Authoritarian Infrastructure Build-out

### Why It Matters

Plenty of organizations track what the government _says_ (executive orders, policy statements) and what the government _decides_ (court rulings, enforcement actions). Democracy Monitor already does this across 14 categories. But almost nobody systematically tracks whether the government is quietly building the _operational capacity_ to act at scale — the physical infrastructure, the personnel pipeline, the surveillance technology, the legal authorities, and the funding that would make authoritarian action _possible_ even before any decision to act is made.

This is the capability dimension. It answers a different question than the other three releases. Rhetoric vs. Action asks "are officials following through on what they say?" Project 2025 asks "are they following a published plan?" Infrastructure Build-out asks: "even if they haven't done X yet, could they do X tomorrow?"

The distinction matters because infrastructure is often built quietly, through routine procurement and hiring processes that don't generate the kind of headlines or legal challenges that executive orders and court rulings do. A detention facility contract filed in SAM.gov, 2,000 new ICE officer postings on USAJobs, a facial recognition technology procurement — each is individually a routine government action. Together, they represent a systematic expansion of enforcement capacity that the public has a right to understand.

The scenario that makes this feature urgent: the same week that P2025 matching shows implementation of Chapter 5's detention proposals (Release 2) and rhetoric escalates about "mass deportation operations" (Release 3), SAM.gov reveals new detention facility contracts and USAJobs shows an ICE hiring surge (Release 4). Any one of these signals is informative. All four together tell a story that no single data source reveals: rhetoric is being operationalized according to a published plan, and the operational capacity to execute at scale is being built in parallel.

### Key Features

**Detention capacity tracking.** Physical infrastructure for mass detention, measured through federal procurement data (SAM.gov API), private prison company filings (SEC EDGAR API for GEO Group and CoreCivic quarterly reports), and DHS statistical tables (encounters, detention bed counts, removals). The metric is concrete: total available detention bed capacity over time. Not "did the government say something about detention" but "how many people can the government detain tomorrow?"

**Personnel build-out tracking.** Organizational capacity for enforcement at scale, measured through federal hiring data (USAJobs.gov API — job postings by agency, series, grade, location) and budget justifications (GovInfo — staffing targets, academy class sizes, authorized vs. filled positions). When 2,000 new ICE officer postings appear in a single month, that's infrastructure build-out regardless of any accompanying rhetoric.

**Surveillance infrastructure tracking.** Technical capacity for monitoring at scale, measured through DHS technology procurement (SAM.gov — facial recognition, border surveillance, social media monitoring, biometric databases), FBI/NSA annual transparency reports, and federal grants to state/local law enforcement for surveillance equipment. The metric: surveillance technology spending and capability expansion over time.

**Legal infrastructure tracking.** Expansion of enforcement authority and reduction of legal constraints. Partially captured by existing sources (DOJ policy memos, consent decree withdrawals via CourtListener, AG opinions). Additional signals: new federal crime categories (LegiScan), mandatory minimum expansions, asset forfeiture fund balances, IRS enforcement budget shifts, OFAC sanctions expansion rate. The metric: how many enforcement tools exist and how broad is their scope — distinct from whether they're being _used_ (which existing categories already track).

**Financial infrastructure tracking.** Funding patterns that enable enforcement capacity. DOJ asset forfeiture fund reports, DHS budget execution reports, ICE detention funding vs. expenditure. The metric: enforcement spending growth rate relative to overall budget.

**Cross-feature convergence.** When detention capacity, personnel build-out, and surveillance procurement all accelerate in the same policy domain in the same timeframe, while P2025 proposals for that domain are being implemented (Release 2) and rhetoric about that domain is escalating (Release 3) — that convergence across four independent analytical dimensions is the strongest signal the system can produce. This is a higher-order version of the existing three-layer convergence: not "do structural, AI, and thematic analysis agree?" but "do rhetoric, blueprint, capability, and measured action all point in the same direction?"

### Implementation Details

**Data sources and feasibility:**

| Source                | API                | Historical                | Cost | Feasibility | Signal                                             |
| --------------------- | ------------------ | ------------------------- | ---- | ----------- | -------------------------------------------------- |
| SAM.gov               | Public REST        | Years of procurement data | Free | High        | Detention contracts, surveillance tech procurement |
| USAJobs.gov           | Public REST        | Job postings over time    | Free | High        | Law enforcement hiring by agency                   |
| SEC EDGAR             | Public REST        | All quarterly filings     | Free | High        | Private prison bed counts, occupancy, revenue      |
| GovInfo budget docs   | Already integrated | All analysis periods      | Free | High        | Staffing targets, academy class sizes              |
| FBI/NSA transparency  | Published PDFs     | Annual, low volume        | Free | Medium      | FISA stats, surveillance program scope             |
| State/local grant DBs | Varies by program  | Partial                   | Free | Lower       | Federal surveillance grants to local agencies      |

**Layer 1 structural dimensions (new):**

- **Detention**: bed capacity (contracted + operational), facility count, occupancy rate, new contract volume
- **Personnel**: active postings by agency, hiring rate vs. attrition, academy class size, authorized-vs-filled ratio
- **Surveillance**: technology procurement spend, contract count by capability type, grant volume to state/local
- **Legal**: enforcement authority count, asset forfeiture fund balance, consent decree status changes
- **Financial**: enforcement budget growth rate, appropriated-vs-requested gap, interagency transfer volume

**Build order:** Start with SAM.gov + USAJobs.gov (highest feasibility, most concrete indicators). Build detention capacity and personnel tracking first — least ambiguous metrics. Surveillance and legal infrastructure follow — more interpretive, require careful baseline calibration.

**Effort:** Large per sub-dimension. Each requires a new fetcher, new structural dimensions, new baselines, and calibration against all analysis periods. The cross-feature convergence framework should be designed before building any individual sub-dimension, so data flows into a unified analytical framework from the start.

---

## Cross-Feature Convergence

Releases 2, 3, and 4 are most powerful when they converge. Any single signal is informative; all four analytical dimensions lighting up simultaneously for the same policy domain tells a story that no individual data source reveals.

**The convergence scenario:** (1) This language in a government document maps to Project 2025 Chapter 5's proposal to increase ICE detention capacity (Release 2 — P2025). (2) The president and DHS Secretary begin talking about "mass deportation operations" (Release 3 — Rhetoric). (3) In weeks 3-8, SAM.gov shows new detention facility contracts, USAJobs shows an ICE officer posting surge, and CBP's budget justification requests a 40% capacity increase (Release 4 — Infrastructure). (4) Meanwhile, the existing detection layers show DHS rulemaking volume spiking, CourtListener immigration filings surging, and DOJ press releases shifting topic distribution toward immigration enforcement (existing system — government document analysis).

The cross-feature convergence score operates per category per week: not "are multiple layers concerned about lawEnforcement" (existing within-category convergence) but "are rhetoric, P2025 implementation, infrastructure build-out, and measured government action all accelerating in the same policy domain at the same time?"

**Design constraint:** The data model decisions for Release 3 (speaker attribution, statement-to-action linking) must anticipate Release 2 matching and Release 4 infrastructure tracking. Design the cross-feature convergence schema before building any release.

**Build order:** Release 2 (P2025) first — matcher pipeline is well-specified and requires no new data sources. Release 3 (rhetoric sources) second — builds the primary-source data that feeds lag analysis. Release 4 (infrastructure) third — requires the most new data source integration. Cross-feature convergence ships after all three releases have baseline data.

---

## Appendix: Technical Backlog

Items that improve the platform's internal quality but don't constitute user-facing features. These are implementation-level improvements tracked for sprint planning.

| ID    | Item                                            | Layer      | Effort       | Notes                                                                                        |
| ----- | ----------------------------------------------- | ---------- | ------------ | -------------------------------------------------------------------------------------------- |
| R-F1  | Pass 1 pre-filtering with functional classifier | L2         | Small        | Skip P1 for `financial_regulatory`, `cultural_ceremonial` — saves ~15-20% AI cost            |
| R-F2  | Sprint 21 keyword overlay deprecation           | Keywords   | Medium       | Simplify admin overlay for annotation use; remove scoring pathway                            |
| R-F6  | Semantic escalation within functional buckets   | L3         | Medium-Large | Per-bucket centroid drift — catches substance changes within stable structure                |
| R-F7  | AI model challenge set                          | L2         | Medium       | ~50-100 curated test documents for model update regression testing                           |
| R-F8  | Semantic variance decomposition                 | L3         | Medium       | Within-cluster vs. between-cluster variance — distinguishes stylistic from substantive drift |
| R-F11 | Pass 2 infrastructure theme tagging             | L2         | Small        | Boolean fields: detentionIncarceration, surveillanceApparatus, criminalizationOfOpposition   |
| R-F12 | Per-category L1 threshold calibration           | L1         | Medium       | Adaptive thresholds for thin categories (<20 docs/week)                                      |
| R-F13 | Layer 3 independent signal re-evaluation        | L3         | Medium       | Re-evaluate after clean baseline recomputation                                               |
| —     | Oversight.gov IG reports (when API available)   | Sources    | Medium       | All 75 IGs — currently no API, community scraper spotty                                      |
| —     | VRL calibration dataset for LegiScan            | Validation | Small        | Ground-truth labels for state voting legislation                                             |
| —     | CBO reports pipeline                            | Sources    | Small        | Low-volume fiscal signal                                                                     |
| —     | MediaCloud investigation                        | Sources    | Small-Medium | API spike to determine if historical full-text access is viable                              |

---

## Status

_(Updated as releases progress)_

| Release                                   | Status          | Notes                                                                                   |
| ----------------------------------------- | --------------- | --------------------------------------------------------------------------------------- |
| 1. Detection Quality & Platform Hardening | Planning        | Individual items at various stages of specification                                     |
| 2. Project 2025: Plan vs. Delivered       | Design complete | Schema and matcher specified; proposal extraction pending; requires no new data sources |
| 3. Rhetoric vs. Action                    | Design complete | Rhetoric sources validated (2026-03-03); implementation not started                     |
| 4. Authoritarian Infrastructure Build-out | Design complete | Data source feasibility validated; implementation not started                           |
