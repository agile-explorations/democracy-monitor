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

- [x] Add pgvector extension to PostgreSQL and add `embedding vector(1536)` column to `documents` table (new Drizzle migration)
- [x] Build ingest step: when feed items are fetched, extract full content — Federal Register API `abstract` field, RSS article body via link fetch + readability extraction, HTML page content
- [x] Store extracted documents in `documents` table with full content (deduplicate by URL)
- [x] Generate embeddings via `embedBatch()` and store in the vector column
- [x] Build retrieval query: given a category + assessment context, find top-K most relevant document chunks via pgvector cosine similarity
- [x] Augment AI prompts with retrieved content — populate the `summary` field that assessment/debate/legal prompts already accept
- [x] Add content extraction + embedding cache to avoid redundant work on each assessment cycle

**Enables downstream:**

- Rhetoric→action trajectory (semantic similarity tracks theme migration from rhetoric to action sources)
- Authoritarian infrastructure tracking (contract documents, executive orders can be embedded and clustered)
- Trend analysis on _content_ not just keyword counts

### UX — Discoverability & Clarity

- [x] Replace the small AI checkbox with a prominent "AI Analysis" button with loading state
- [x] Hide implementation details (provider, model, latency) behind a developer toggle; show plain-language summary to end users
- [x] Add methodology tooltips to StatusPill (hover for explanation) and "auto-assessed" label
- [x] Add "Data Coverage" label to ConfidenceBar in progressive disclosure Layer 1
- [x] Fix vocabulary inconsistency: align system-health labels (Operational/Degraded/Down) with category-level labels (Stable/Warning/Drift/Capture) or explain the distinction

---

## P1.5 — High (analytical depth — rhetoric→action tracking)

### Rhetoric Sources (currently only Federal Register + WH press releases)

**Tier 1 — No API cost, high value:**

- [x] Parse White House press conference transcripts (whitehouse.gov publishes full text) — unscripted Q&A captures raw rhetoric that polished press releases omit
- [x] Add RSS feeds from major wire services as rhetoric proxy (AP, Reuters, NPR) — when something is said on Truth Social, major outlets report it within hours; tag as `sourceTier: 2`
- [x] Add keyword-filtered Google News RSS or similar aggregator for administration rhetoric coverage
- [ ] Parse GovInfo Congressional Record API for rhetoric from allied legislators — floor speeches and statements often preview policy direction

**Tier 2 — API cost or scraping complexity:**

- [ ] X/Twitter API integration for administration officials (VP, cabinet, press secretary) — $100+/mo basic tier; evaluate ROI
- [ ] Truth Social aggregation — no public API; evaluate third-party aggregators (e.g., Factba.se, media cloud archives) or RSS-bridge-style scraping
- [ ] C-SPAN transcript parsing for congressional hearings and floor speeches

**Tier 3 — Future / requires moderation:**

- [ ] Community-submitted rhetoric with source verification (link + screenshot required, moderator approval before inclusion)

### Intent Keywords — Missing Coverage

- [x] Add "domestic terrorist" political labeling keywords to `civil_liberties` rhetoric: "far-left radical", "domestic terrorist", "enemy within", "radical left", "communist"
- [x] Add election federalization keywords to `elections` rhetoric+action: "federalize elections", "federal election control", "take over state elections", "national election authority"
- [x] Audit all 5 policy areas for keyword gaps against current real-world rhetoric and executive actions

### Authoritarian Infrastructure Tracking — coverage gap analysis

**Currently tracked well (3/10):**

- Loyalist placement / civil service capture (`civilService`, `igs` categories)
- Fiscal leverage / impoundment (`fiscal` category)
- Government transparency / information control (`infoAvailability` category)

**Partially tracked (4/10) — need signal expansion:**

- [ ] `courts`: Add signals for _structural_ judicial changes (jurisdiction stripping, court packing proposals, judicial appointment pace) — currently only tracks compliance with existing orders
- [ ] `military`: Add signals for _emergency power declarations_ (IEEPA invocations, national emergency declarations, Insurrection Act preparations) — currently only tracks deployment keywords
- [ ] `elections`: Add _action_ signals for election official replacement, voting infrastructure changes, mail-in ballot restrictions, voter roll purges — currently rhetoric keywords only
- [ ] `media_freedom` (intent policy area): Promote to a full dashboard category with dedicated signals — press credential revocations, FOIA denial rates, journalist subpoenas, libel law changes

**Not tracked at all (3/10) — need new categories or signals:**

- [ ] **Detention & incarceration infrastructure**: ICE/DHS facility construction and contract awards, FEMA emergency facility readiness, converted warehouse/military base detention capacity, private prison contract expansion. Sources: USAspending.gov contract data, DHS press releases, FOIA logs, Congressional oversight reports
- [ ] **Surveillance apparatus**: Biometric database expansion, facial recognition deployment (CBP, ICE, local police), social media monitoring contracts, data broker partnerships (LexisNexis/Palantir government contracts), cell-site simulator (Stingray) acquisition. Sources: USAspending.gov, EFF/ACLU tracking, DHS privacy impact assessments
- [ ] **Criminalization of opposition**: DOJ investigation patterns (politically targeted vs. routine), IRS audit targeting, "domestic terrorist" designations of political groups, prosecution of protesters, weaponized use of material support statutes. Sources: DOJ press releases, PACER federal case filings, ACLU case tracker

### Authoritarian infrastructure — design considerations

- [ ] Design "stated purpose vs. available capacity" framing — every infrastructure item should show: (1) what it was built/authorized for, (2) what its legal basis permits, (3) historical precedents for repurposing
- [ ] Track "dual-use" legal precedents: powers created for one stated purpose whose legal basis permits broader application
- [ ] Consider a dedicated "Infrastructure" section separate from the 9 category cards — infrastructure buildup is cross-cutting and doesn't fit neatly into one category

### AI Assessment Lifecycle

- [x] Move AI assessment calls to snapshot creation and store results (currently triggered per page load)

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
- [x] Expand `.gitignore` (coverage/, .DS_Store, .vscode/, .idea/, \*.swp, OS files, IDE files)
- [x] Update `package.json`: remove `"private": true`, add `license`, `description`, `repository`, `author`, `keywords`, `bugs`, `homepage`

## OSS-P1 — Open-Source High Priority (contributors will look for these)

### Documentation

- [x] Rewrite README.md: project mission, how it works, demo mode, architecture overview, how to run locally, how to contribute, license badge
- [x] Add CONTRIBUTING.md: dev setup, code style, how to write tests, PR guidelines, issue reporting
- [x] Add CODE_OF_CONDUCT.md (Contributor Covenant v2.1)
- [ ] Add ARCHITECTURE.md for human contributors — explain the _why_ behind the proxy pattern, assessment methodology, caching strategy, and client-only rendering decision (keep CLAUDE.md for AI-assisted dev)
- [ ] Document React pattern decisions (component style, state management, error handling, naming) — either in ARCHITECTURE.md or a dedicated `docs/react-patterns.md`

### Code Quality — completed

- [x] Narrow `any` types — added `ContentItem` type, replaced all `any` in services/API routes/parsers/components
- [x] Dead-import analysis — ran `ts-prune`; 3 unused components found (DailyDigest, SourceBadge, SuppressionAlert) but kept for future wiring
- [x] Removed COMPREHENSIVE_ENHANCEMENT_PLAN.md (obsolete; all phases complete; TODO.md is current roadmap)

### Code Quality — automated enforcement

Without automated guardrails, code standards are suggestions. These items create a quality floor that doesn't depend on any contributor's discipline or tooling.

**CI pipeline (do this first — everything else builds on it):**

- [x] Add GitHub Actions workflow: run `pnpm lint`, `pnpm build` (catches type errors), and `pnpm test` on every PR to `main`
- [x] Add coverage floor check — prevent test coverage from _decreasing_ (not a target, just a ratchet)

**Formatting:**

- [x] Add Prettier with opinionated config — eliminates style debates in code review
- [x] Add `pnpm format` and `pnpm format:check` scripts to `package.json`
- [x] Run Prettier on existing codebase (one-time commit, separate from any functional changes)

**Pre-commit hooks:**

- [x] Add `husky` + `lint-staged` — run lint and format check on staged files so broken code never lands in a commit
- [x] Tighten lint-staged to `eslint --max-warnings 0` after fixing 6 existing `exhaustive-deps` warnings

**ESLint — tighten React pattern enforcement:**
Current `.eslintrc.json` is nearly empty (just `next/core-web-vitals`). Add rules to codify the patterns already used in this codebase:

- [x] Add `eslint-plugin-react` rules: `function-component-definition` (function declarations), `destructuring-assignment` (in signature), `no-unstable-nested-components`, `hook-use-state` (enforce `[value, setValue]` naming), `jsx-no-useless-fragment`
- [x] Add `eslint-plugin-import` rules: `order` (consistent import grouping + alphabetize), `no-duplicates`, `consistent-type-specifier-style` (enforce `import type`)
- [x] Add rule to flag unnecessary `import React` (not needed with Next.js JSX transform)
- [x] Establish event handler naming convention (`handle*` for internal handlers, `on*` for callback props) and document in patterns guide

**Semgrep/OpenGrep — project-specific patterns ESLint can't express:**
OpenGrep (Apache 2.0 fork of Semgrep) lets you write AST-pattern rules in YAML. Better fit for an OSS project than Semgrep's tightened license.

- [x] Add `.opengrep/` directory with custom rule files
- [x] Rule: useEffect fetch calls must be wrapped in try/catch with explicit error handling (current codebase has mix of silent failures, empty catch blocks, and proper handling)
- [x] Rule: ban single-object `useState` for unrelated state (enforce separate `useState` calls)
- [x] Rule: flag `import React from 'react'` when only JSX is used (supplement ESLint rule)
- [x] Add `pnpm lint:patterns` script and integrate into CI pipeline
- [x] Document the _why_ behind each custom rule so contributors understand intent, not just constraint

### Test Coverage (currently ~39% of services, 0% of API routes/components)

- [ ] Add API route smoke tests (proxy, assess-status, federal-register at minimum)
- [ ] Add tests for `feed-service.ts` (core data fetching, untested)
- [ ] Add tests for cache layer fallback logic (`lib/cache/index.ts`)
- [ ] Add tests for remaining services (ai-assessment, uptime, suppression-detection)
- [ ] Establish test coverage norm in CONTRIBUTING.md: new logic requires tests, bug fixes require a regression test

### Contributor Experience

**GitHub issue templates (`.github/ISSUE_TEMPLATE/`):**

- [x] Add `bug_report.yml` — structured form: steps to reproduce, expected vs actual behavior, environment
- [x] Add `feature_request.yml` — structured form: problem statement, proposed solution, alternatives considered
- [x] Add `new_signal.yml` — project-specific: category, source URL, source type (RSS/API/HTML), why this signal matters (lets non-developers contribute signal ideas)
- [x] Add `config.yml` — link to Discussions for general questions

**"Good first issue" curation:**

- [x] Create `good first issue` label on the repo (exists as GitHub default)
- [ ] Create GitHub Issues from TODO candidates when ready to invite contributors:
  - "Add negation detection" (P2) — well-defined NLP task, isolated to assessment-service
  - "Add loading indicator for Deep Analysis tab" (P2) — small UI task
  - "Fix vocabulary inconsistency" between health/category labels (P1)
  - "Hide implementation details behind developer toggle" (P1)

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
