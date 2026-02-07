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
- [ ] Add context-aware filtering: skip keyword matches inside proper nouns, datelines, and boilerplate headers
- [ ] Decouple authority weighting from content-word matching — weight by source domain reliability, not keyword presence in domain name
- [ ] Add "unknown/insufficient data" status for categories with < 3 feed items instead of defaulting to Warning
- [ ] Tune governance classification thresholds — common political rhetoric ("executive authority", "unitary executive") should not alone push scores into alarming tiers

### UX — Discoverability & Clarity
- [ ] Replace the small AI checkbox with a prominent "Get AI Analysis" button with brief explanation of what it does
- [ ] Hide implementation details (provider, model, latency) behind a developer toggle; show plain-language summary to end users
- [ ] Add a brief "How this works" tooltip or info icon to each category card explaining the assessment methodology
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

### Authoritarian Infrastructure Tracking (new analytical layer)
- [ ] Design "infrastructure buildup" tracking — monitor creation of *capabilities* that could be repurposed (e.g., detention centers built for immigration enforcement that could hold political opponents; involuntary commitment powers that could expand in scope)
- [ ] Add signals for detention facility construction/expansion (ICE contracts, DHS facility announcements)
- [ ] Add signals for new executive powers that grant authority over individual liberty (executive orders on commitment, designation authorities, emergency powers)
- [ ] Track "dual-use" legal precedents: powers created for one stated purpose whose legal basis permits broader application
- [ ] Surface infrastructure concerns in the Intent section with explicit "stated purpose vs. available capacity" framing

### Rhetoric → Action Trajectory (new analytical layer)
- [ ] Track when specific rhetoric themes (e.g., "opponents are terrorists") first appear, and whether corresponding policy actions follow over time
- [ ] Add time-series view to Intent section: rhetoric score and action score per policy area plotted over weeks/months
- [ ] Add "escalation alerts" when a theme moves from rhetoric-only to rhetoric+action (e.g., "designate as terrorists" appeared in rhetoric 8 weeks ago; now "detained without charge" appearing in action feeds)
- [ ] Store historical intent statements in DB to enable trajectory analysis (currently stateless — no memory of past assessments)

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
