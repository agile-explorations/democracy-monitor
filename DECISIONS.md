# Decisions & Retrospectives

This file captures what was planned vs what was built, spec deviations, key decisions, and lessons learned for each sprint. Read this alongside relevant spec sections before starting a new sprint.

**Spec documents referenced:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` (cited as "V3 Addendum §X")
- `UI DESIGN SPECIFICATION V3.md` (cited as "UI Spec §X")
- `ASSESSMENT_METHODOLOGY.md`

---

## Sprint 11: Seed Data Framework + Baseline & T2 Backfill

**Planned:** Build import/export pipeline, run Biden 2024 baseline and T2 backfill with AI Skeptic enabled.

**Actual:** Delivered as planned. Additionally fixed GDELT retry/backoff logic, military signal coverage gaps, and created a migration journal documenting schema changes.

**Key decisions:**

- `loadEnvConfig()` moved to CLI entry blocks (not module scope) so exported functions are testable without environment setup
- `process.exit()` replaced with `throw` in exported functions — callers handle exit
- Shared `assess-week` module extracted to avoid duplicating assessment logic between `backfill.ts` and `backfill-baseline.ts`

**Lessons learned:**

- GDELT API returns 429s frequently; exponential backoff with jitter is essential
- GDELT occasionally returns malformed JSON; graceful skip + continue is the right pattern
- WH archive returns all results in a single paginated response (~6600 items for Biden term)

---

## Sprint 12: AI Skeptic Review Report + Decisions Template

**Planned:** Generate targeted review report from AI Skeptic output, create decisions schema for human review.

**Actual:** Delivered review report generator + Zod-validated decisions schema + JSON template generator. Report extracted 706 items across 4 flag types (false_positive keywords, ambiguous keywords, status downgrades, low-confidence assessments), with each keyword verdict as a separate item.

**Spec deviations:**

- UI Spec §10A.2: Report used FlagType-based extraction (per-keyword flags as separate items) rather than per-assessment items. This was corrected in Sprint 12.1.

**Key decisions:**

- Used Zod for decisions schema validation (runtime + type safety)
- JSON template as primary working store for human review decisions

---

## Sprint 12.1: Review Flow Alignment + Baseline Coverage

**Planned:** Align review report flagging with UI spec (~114 items not 706), build interactive CLI review flow, add FR signals for igs/infoAvailability, update resolveReview() for full feedback.

**Actual:** All work items delivered. Biden 2024 baseline re-run with fresh data capturing `reviewedDocuments` field. 253 review items generated (more than estimated 114 due to fresh AI assessments across all categories including new signals).

**Spec deviations:**

- UI Spec §10A.2: Changed from JSON-as-primary-store to **DB-centric review flow**. The `alerts` table (via `flagForReview()` → `getPendingReviews()` → `resolveReview()`) is the single source of truth. JSON export available for audit/portability but not the working store. Rationale: one reader for Sprint 13's `apply-decisions.ts`, CLI and future UI share the same code path, less merge/sync logic.
- UI Spec §10A.3-4: Interactive CLI mirrors the planned UI review page. Same data, different interface. CLI uses readline; UI will use the same `getPendingReviews()` / `resolveReview()` API.
- `reviewedDocuments` field added to `EnhancedAssessment` type — not in original spec. Stores the top 10 source documents (title, url, date) that the AI reviewed during assessment. Essential for human reviewers to verify AI recommendations.

**Key decisions:**

- **DB-centric review:** `alerts` table is the single source of truth for review state. Both CLI and future UI read/write through `review-queue.ts`. Sprint 13's `apply-decisions.ts` reads from alerts table only.
- **Pure function / readline separation:** All display formatting and argument building are pure functions (testable). Readline wrappers are thin and untested. This pattern worked well — 100% of the interactive review logic is covered by unit tests.
- **ReviewFeedbackSchema:** Shared contract between CLI, UI, and `apply-decisions.ts` with 4 feedback types: `falsePositiveKeywords`, `missingKeywords`, `suppressionSuggestions`, `tierChanges`. Designed to feed Sprint 13's keyword tuning.
- **FR signals for igs + infoAvailability:** Added 4 new Federal Register signals to fill coverage gaps. These categories previously had keyword dictionaries but zero baseline data.

**Lessons learned:**

- **Always capture source data at assessment time.** The original pipeline discarded `ContentItem[]` after assessment. When we needed to show reviewers what documents the AI looked at, we had to add `reviewedDocuments` to the type and re-run the baseline. Design assessments to be self-contained — include everything needed for review.
- **Manual testing reveals UX issues that unit tests miss.** The interactive review worked perfectly in tests, but manual testing revealed: (1) `[Y/n/s]` was unclear — changed to `[Y]es / [n]o, override / [s]kip`; (2) evidence items alone weren't enough — reviewers need actual document titles/URLs to verify AI recommendations.
- **Flagging criteria produce more items than estimated.** The ~114 estimate was based on analyzing existing data. Fresh AI assessments with new signals produced 253 flagged items. Estimates based on existing data are lower bounds.
- **Pre-commit hooks catch formatting issues.** Always run `npx prettier --write` on modified files before committing. OpenGrep `toDateString` pattern caught a `.toISOString().split('T')[0]` that should have used the shared utility.

---

## Forward-Looking Decisions

### Keyword refinement workflow (Sprint 13+)

Decided 2026-02-11. The interactive review process will include structured feedback for keyword dictionary improvement:

1. **AI Skeptic pre-populates feedback:** `falsePositiveKeywords`, `suppressionSuggestions`, `tierChanges` are generated during AI assessment and pre-populated for the human reviewer to approve/edit during interactive review.
2. **missingKeywords from rhetoric analysis:** Not from AI — from the rhetoric pipeline (WH archive, GDELT). Frequency analysis: "term X appears in N rhetoric documents for category Y but isn't in assessment-rules.ts." This preserves keyword layer independence from AI.
3. **Post-session aggregate report:** After completing all reviews, synthesize feedback into specific, actionable recommendations for keyword dictionary changes. Patterns across many reviews, not per-item suggestions.
4. **Double human review:** Human reviews each assessment (per-item), then approves each aggregate recommendation. Two gates before any keyword change is applied.
5. **Changes in code:** `apply-decisions.ts` writes changes to `assessment-rules.ts`. Methodology is versioned in git. Every change is auditable and revertible.
6. **Validate with re-run:** After applying changes, re-run baseline and review again to confirm improvement.

**Rationale:** The two-layer assessment (keyword + AI Skeptic) provides independent cross-checks. If AI directly dictates keyword changes, the layers become coupled and we lose independence. By routing AI feedback through human approval at two levels, and sourcing missing keywords from rhetoric (not AI), we maintain the keyword layer as human-curated and evidence-based.

### Baseline strategy (Sprint 14-15)

Decided 2026-02-11. Switching from Biden 2024 as primary baseline to a multi-baseline approach:

- **Biden 2022** — Primary "steady state normal governance" baseline. Year 2, post-transition, settled operations. Best signal for "what does normal look like."
- **Biden 2021** — First-year-in-term baseline. More executive orders, policy changes, appointee turnover. Normal but elevated activity.
- **Obama 2013** — Second first-year-in-term baseline (second term). Different president, same party. Cross-president validation that first-year patterns are consistent.

**Rationale:** Biden 2024 was an election year with lame-duck dynamics — elevated activity not representative of normal governance. Biden 2022 is cleaner. Two first-year baselines allow distinguishing "new administration doing normal things energetically" from "patterns that didn't exist in any prior normal baseline."

**Risk:** Obama 2013 WH archive URL structure differs from Biden-era. GDELT should work. Verify data availability before committing.

### Updated sprint sequence (Sprints 13-15)

- **Sprint 13:** AI Skeptic structured feedback + pre-populated interactive review + aggregate report generator + `apply-decisions.ts` writing to `assessment-rules.ts`
- **Sprint 14:** Biden 2022 baseline + rhetoric-based `missingKeywords` analysis + first keyword refinement cycle (review → aggregate → apply → re-run → validate)
- **Sprint 15:** Biden 2021 + Obama 2013 baselines + cross-baseline validation framework

See ROADMAP.md for full updated sequence.
