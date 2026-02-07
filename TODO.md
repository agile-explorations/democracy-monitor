# TODO

Items are grouped by priority. Work top-down within each tier.

---

## P0 — Critical (assessment correctness + misleading UX)

### Assessment Methodology
- [x] Add word-boundary protection to keyword matching — "mass" should not match "Massachusetts" (regex `\b` or tokenize-then-match)
- [x] Require 2+ capture-tier keyword matches with corroboration before triggering "Capture" status (single match → Drift at most)
- [x] Rename "confidence" to "data coverage" throughout UI and types — current metric measures volume, not judgment quality
- [x] Add explicit disclaimer to assessment output: "Automated keyword analysis — not a substitute for expert judgment"

### UX — First Impressions
- [x] Replace "Warning" fallback during loading with a skeleton/spinner state so cards don't flash alarming status before assessment completes
- [x] Invert information hierarchy: show assessment summary as the default view; move raw RSS feeds behind a "View Sources" toggle

---

## P1 — High (reduce false positives + improve discoverability)

### Assessment Methodology
- [x] Add context-aware filtering: only match keywords against title + summary (exclude note field and agency metadata)
- [x] Decouple authority weighting from content-word matching — authority now determined by agency field, not content keywords
- [x] Add "unknown/insufficient data" status for categories with < 3 feed items instead of defaulting to Warning
- [x] Tune governance classification thresholds — rhetoric-only signals capped at competitive_authoritarian (action score >= 0.3 required for alarming tiers)

### RAG Pipeline — give AI actual document content (pgvector)
AI currently receives only document titles — not full text. This makes AI assessment, debate, and legal analysis superficial. Most of the infrastructure already exists but isn't wired together.

**Existing pieces:**
- `lib/services/embedding-service.ts` — `embedText()`, `embedBatch()`, `cosineSimilarity()` already built
- `lib/db/schema.ts` — `documents` table has `title`, `content`, `url`, `category` columns (but nothing populates it)
- `lib/ai/prompts/assessment.ts` — prompt template already supports a `summary` field per item (but it's never populated)
- Embedding provider abstraction in `lib/ai/provider.ts` with availability checks

**Pipeline to build:**
- [ ] Add pgvector extension to PostgreSQL and add `embedding vector(1536)` column to `documents` table (new Drizzle migration)
- [ ] Build ingest step: when feed items are fetched, extract full content — Federal Register API `abstract` field, RSS article body via link fetch + readability extraction, HTML page content
- [ ] Store extracted documents in `documents` table with full content (deduplicate by URL)
- [ ] Generate embeddings via `embedBatch()` and store in the vector column
- [ ] Build retrieval query: given a category + assessment context, find top-K most relevant document chunks via pgvector cosine similarity
- [ ] Augment AI prompts with retrieved content — populate the `summary` field that assessment/debate/legal prompts already accept
- [ ] Add content extraction + embedding cache to avoid redundant work on each assessment cycle

**Enables downstream:**
- Rhetoric→action trajectory (semantic similarity tracks theme migration from rhetoric to action sources)
- Authoritarian infrastructure tracking (contract documents, executive orders can be embedded and clustered)
- Trend analysis on *content* not just keyword counts

### UX — Discoverability & Clarity
- [x] Replace the small AI checkbox with a prominent "AI Analysis" button with loading state
- [ ] Hide implementation details (provider, model, latency) behind a developer toggle; show plain-language summary to end users
- [x] Add methodology tooltips to StatusPill (hover for explanation) and "auto-assessed" label
- [x] Add "Data Coverage" label to ConfidenceBar in progressive disclosure Layer 1
- [ ] Fix vocabulary inconsistency: align system-health labels (Operational/Degraded/Down) with category-level labels (Stable/Warning/Drift/Capture) or explain the distinction

---

## P1.5 — High (analytical depth — rhetoric→action tracking)

### Rhetoric Sources (currently only Federal Register + WH press releases)

**Tier 1 — No API cost, high value:**
- [ ] Parse White House press conference transcripts (whitehouse.gov publishes full text) — unscripted Q&A captures raw rhetoric that polished press releases omit
- [ ] Add RSS feeds from major wire services as rhetoric proxy (AP, Reuters, NPR) — when something is said on Truth Social, major outlets report it within hours; tag as `sourceTier: 2`
- [ ] Add keyword-filtered Google News RSS or similar aggregator for administration rhetoric coverage
- [ ] Parse GovInfo Congressional Record API for rhetoric from allied legislators — floor speeches and statements often preview policy direction

**Tier 2 — API cost or scraping complexity:**
- [ ] X/Twitter API integration for administration officials (VP, cabinet, press secretary) — $100+/mo basic tier; evaluate ROI
- [ ] Truth Social aggregation — no public API; evaluate third-party aggregators (e.g., Factba.se, media cloud archives) or RSS-bridge-style scraping
- [ ] C-SPAN transcript parsing for congressional hearings and floor speeches

**Tier 3 — Future / requires moderation:**
- [ ] Community-submitted rhetoric with source verification (link + screenshot required, moderator approval before inclusion)

### Intent Keywords — Missing Coverage
- [ ] Add "domestic terrorist" political labeling keywords to `civil_liberties` rhetoric: "far-left radical", "domestic terrorist", "enemy within", "radical left", "communist"
- [ ] Add election federalization keywords to `elections` rhetoric+action: "federalize elections", "federal election control", "take over state elections", "national election authority"
- [ ] Audit all 5 policy areas for keyword gaps against current real-world rhetoric and executive actions

### Authoritarian Infrastructure Tracking — coverage gap analysis

**Currently tracked well (3/10):**
- Loyalist placement / civil service capture (`civilService`, `igs` categories)
- Fiscal leverage / impoundment (`fiscal` category)
- Government transparency / information control (`infoAvailability` category)

**Partially tracked (4/10) — need signal expansion:**
- [ ] `courts`: Add signals for *structural* judicial changes (jurisdiction stripping, court packing proposals, judicial appointment pace) — currently only tracks compliance with existing orders
- [ ] `military`: Add signals for *emergency power declarations* (IEEPA invocations, national emergency declarations, Insurrection Act preparations) — currently only tracks deployment keywords
- [ ] `elections`: Add *action* signals for election official replacement, voting infrastructure changes, mail-in ballot restrictions, voter roll purges — currently rhetoric keywords only
- [ ] `media_freedom` (intent policy area): Promote to a full dashboard category with dedicated signals — press credential revocations, FOIA denial rates, journalist subpoenas, libel law changes

**Not tracked at all (3/10) — need new categories or signals:**

- [ ] **Detention & incarceration infrastructure**: ICE/DHS facility construction and contract awards, FEMA emergency facility readiness, converted warehouse/military base detention capacity, private prison contract expansion. Sources: USAspending.gov contract data, DHS press releases, FOIA logs, Congressional oversight reports
- [ ] **Surveillance apparatus**: Biometric database expansion, facial recognition deployment (CBP, ICE, local police), social media monitoring contracts, data broker partnerships (LexisNexis/Palantir government contracts), cell-site simulator (Stingray) acquisition. Sources: USAspending.gov, EFF/ACLU tracking, DHS privacy impact assessments
- [ ] **Criminalization of opposition**: DOJ investigation patterns (politically targeted vs. routine), IRS audit targeting, "domestic terrorist" designations of political groups, prosecution of protesters, weaponized use of material support statutes. Sources: DOJ press releases, PACER federal case filings, ACLU case tracker

### Authoritarian infrastructure — design considerations
- [ ] Design "stated purpose vs. available capacity" framing — every infrastructure item should show: (1) what it was built/authorized for, (2) what its legal basis permits, (3) historical precedents for repurposing
- [ ] Track "dual-use" legal precedents: powers created for one stated purpose whose legal basis permits broader application
- [ ] Consider a dedicated "Infrastructure" section separate from the 9 category cards — infrastructure buildup is cross-cutting and doesn't fit neatly into one category

### Rhetoric → Action Trajectory (new analytical layer)
- [ ] Track when specific rhetoric themes (e.g., "opponents are terrorists") first appear, and whether corresponding policy actions follow over time
- [ ] Add time-series view to Intent section: rhetoric score and action score per policy area plotted over weeks/months
- [ ] Add "escalation alerts" when a theme moves from rhetoric-only to rhetoric+action (e.g., "designate as terrorists" appeared in rhetoric 8 weeks ago; now "detained without charge" appearing in action feeds)
- [ ] Store historical intent statements in DB to enable trajectory analysis (currently stateless — no memory of past assessments)

---

## OSS-P0 — Open-Source Blockers (must fix before publishing)

- [x] Add LICENSE file (MIT)
- [x] `.env.local` already gitignored (was never tracked)
- [x] Remove `.claude/settings.local.json` from git tracking and add `.claude/` to `.gitignore`
- [x] Expand `.gitignore` (coverage/, .DS_Store, .vscode/, .idea/, *.swp, OS files, IDE files)
- [x] Update `package.json`: remove `"private": true`, add `license`, `description`, `repository`, `author`, `keywords`, `bugs`, `homepage`

## OSS-P1 — Open-Source High Priority (contributors will look for these)

### Documentation
- [ ] Rewrite README.md: project mission, how it works, screenshots/demo link, architecture overview, how to run locally, how to contribute, license badge
- [ ] Add CONTRIBUTING.md: dev setup, code style, how to write tests, PR guidelines, issue reporting
- [ ] Add CODE_OF_CONDUCT.md (Contributor Covenant)
- [ ] Decide on CLAUDE.md: keep for AI-assisted dev, and/or add ARCHITECTURE.md for human contributors

### Code Quality
- [ ] Narrow `any` types in API routes and parsers (consider Zod schemas for external API responses)
- [ ] Run dead-import analysis (`ts-prune` or `eslint-plugin-unused-imports`)
- [ ] Decide whether to keep or trim COMPREHENSIVE_ENHANCEMENT_PLAN.md (56KB internal planning doc)

### Test Coverage (currently ~39% of services, 0% of API routes/components)
- [ ] Add API route smoke tests (proxy, assess-status, federal-register at minimum)
- [ ] Add tests for `feed-service.ts` (core data fetching, untested)
- [ ] Add tests for cache layer fallback logic (`lib/cache/index.ts`)
- [ ] Add tests for remaining services (ai-assessment, uptime, suppression-detection)

---

## P2 — Medium (robustness + depth)

### Assessment Methodology
- [ ] Add negation detection — "no evidence of purge" should not trigger capture-tier alert
- [ ] Weight recent items higher than older items in assessment scoring
- [ ] Add cross-category corroboration: if only 1 of 9 categories shows Capture while others are Stable, flag as potential false positive

### UX — Progressive Disclosure
- [ ] Add loading indicator for Deep Analysis tab content (debate + legal analysis can be slow)
- [ ] Improve debate view readability — add role labels, visual distinction between prosecutor/defense/arbitrator
- [ ] Add "What does this status mean?" expandable section per status level in the legend

### Trends & Historical Data
- [ ] Backfill historical keyword snapshots on first deployment using Federal Register API date-range queries (26 weeks x 6 categories)
- [ ] Handle categories without FR signals (igs, military, infoAvailability) — show "insufficient data" or use FR term search as proxy
- [ ] Add time-series chart component (recharts) to visualize keyword frequency over time in Deep Analysis
- [ ] Wire up render.yaml cron job stub to record weekly trend snapshots

---

## P3 — Low (polish + testing)

### Demo Mode
- [ ] Add Playwright e2e tests using demo scenarios (mixed, stable, crisis, degrading)
- [ ] Add synthetic time-series data to demo fixtures for trend charts (once charts exist)

### General Polish
- [ ] Audit all categories for keyword dictionary completeness and false-positive risk
- [ ] Add unit tests for word-boundary matching once implemented
- [ ] Add integration test that verifies "Warning" is never shown as initial render state
