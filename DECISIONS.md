# Decisions & Retrospectives

This file captures what was planned vs what was built, spec deviations, key decisions, and lessons learned for each sprint. Read this alongside relevant spec sections before starting a new sprint.

**Spec documents referenced:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` (cited as "V3 Addendum §X")
- `UI DESIGN SPECIFICATION V3.md` (cited as "UI Spec §X")
- `ASSESSMENT_METHODOLOGY.md`

---

## Sprints 11-12 (condensed)

Sprints 11, 12, and 12.1 built the seed data pipeline: import/export framework, Biden 2024 baseline backfill with AI Skeptic, review report, interactive CLI review, and DB-centric review flow. Key decisions that remain relevant:

- **DB-centric review flow** (Sprint 12.1): `alerts` table is the single source of truth for review state. Both CLI and future UI read/write through `review-queue.ts`. JSON export is for audit only.
- **UI Spec §10A deviation**: Changed from JSON-as-primary-store to DB-centric flow. Interactive CLI mirrors planned UI review page using the same `getPendingReviews()` / `resolveReview()` API.
- **`reviewedDocuments` on EnhancedAssessment** (not in original spec): Stores top 10 source documents at assessment time. Essential for human reviewers.
- **ReviewFeedbackSchema**: Shared contract (CLI, UI, `apply-decisions.ts`) with 4 feedback types: `falsePositiveKeywords`, `missingKeywords`, `suppressionSuggestions`, `tierChanges`.

---

## Sprint 13: AI Skeptic Structured Feedback + Keyword Tuning Pipeline

**Planned:** Extend AI Skeptic prompt for structured keyword feedback, pre-populate feedback in interactive review, build aggregate report generator, create `apply-decisions.ts`, regression test fixtures.

**Actual:** Delivered as planned. All 7 work items shipped. No spec deviations — this sprint builds pipeline tooling not covered by the UI spec.

**Key decisions:**

- **AI response schema extension**: Added optional `suggestedAction` (keep/remove/move_to_warning/move_to_drift/move_to_capture) and `suppressionContext` to each keyword verdict. Optional fields ensure backward compatibility with existing stored assessments.
- **`extractAiFeedback()` as pure function**: Maps AI verdicts to `ReviewFeedback` fields — `false_positive` → `falsePositiveKeywords`, `suppressionContext` → `suppressionSuggestions`, tier move actions → `tierChanges`. Testable, no I/O.
- **Aggregate thresholds**: FP rate ≥50% for removal recommendation, ≥2 occurrences for tier change or suppression recommendation. Conservative — first cycle will validate these thresholds.
- **`apply-decisions.ts` regenerates entire file**: Rather than AST manipulation or string patching, it serializes the modified rules object to TypeScript source. Simpler and less fragile. Requires `prettier --write` after.
- **`lib/seed/**` added to ESLint max-lines exemption\*\*: Seed CLI files are growing CLI tools that don't benefit from the 300-line limit.

---

## Forward-Looking Decisions

### Keyword refinement workflow (remaining steps)

Sprint 13 built the tooling (items 1, 3, 5 below). Remaining steps for Sprint 14+:

1. ~~AI Skeptic pre-populates feedback~~ — **Done** (Sprint 13)
2. **missingKeywords from rhetoric analysis** — Sprint 14. Not from AI — from WH/GDELT frequency analysis. Preserves keyword layer independence.
3. ~~Post-session aggregate report~~ — **Done** (Sprint 13, `--aggregate` flag)
4. **Double human review** — Sprint 14. Human reviews per-item, then approves aggregate recommendations.
5. ~~Changes in code via apply-decisions.ts~~ — **Done** (Sprint 13, `pnpm seed:apply`)
6. **Validate with re-run** — Sprint 14. Re-run baseline with `--skip-fetch --skip-ai` after applying changes.

**Rationale** (unchanged): Two-layer assessment independence. AI feedback routed through human approval at two levels. Missing keywords from rhetoric, not AI.

### Baseline strategy (Sprint 14-15)

- **Biden 2022** (primary) — Steady state normal governance
- **Biden 2021** — First-year-in-term baseline
- **Obama 2013** — Cross-president validation (risk: WH archive URL structure differs)
- **Biden 2024** (legacy) — Kept for comparison, not primary

### Updated sprint sequence

- ~~Sprint 13:~~ **Done** — AI Skeptic structured feedback + keyword tuning pipeline
- **Sprint 14:** Biden 2022 baseline + rhetoric-based `missingKeywords` + first keyword refinement cycle
- **Sprint 15:** Biden 2021 + Obama 2013 baselines + cross-baseline validation framework

See ROADMAP.md for full sequence.
