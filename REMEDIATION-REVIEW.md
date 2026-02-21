# Review of SIGNAL_GAP_REMEDIATION.md

**Reviewer:** Claude Code (codebase-aware)
**Date:** 2026-02-19
**Context:** This review is based on direct inspection of the codebase, database queries against backfilled data, and testing of external dependencies. The remediation spec was produced by Claude Online from the SIGNAL-GAP-ANALYSIS.md document.

---

## Overall Assessment

The erosion type framework (A/B/C) is the strongest contribution — it names the detection gaps precisely and makes the prioritization logic legible. The observation that the system is strong on Type A (formal institutional override), weak on Type B (operational hollowing), and blind on Type C (non-compliance/refusal) is accurate and well-evidenced by the backfill results.

The phased approach is correctly sequenced: fix misleading UI first, expand within existing sources, then tackle architecture. The design constraints on the rhetoric cross-feed (Phase 19) — evidence weights, news-only ceiling, credibility preservation — are well-reasoned.

There are several technical issues that need correction before this spec can be implemented. Details below.

---

## Issues

### 1. Sprint Numbering Conflicts with Existing ROADMAP

The spec proposes "Sprint 16–19" in the Implementation Sequence. The project's ROADMAP.md already has Sprints 15.1–26 planned, and **Sprint 19 is already shipped** (week detail page, merged to main). Sprint 18 is also shipped (category detail page).

The Implementation Sequence needs to either use different numbering (e.g., Sprint R1–R4) or be integrated into the existing ROADMAP by displacing/merging with the planned sprints 20–26. This isn't cosmetic — the ROADMAP + GitHub Milestones are how we track work, and conflicting sprint numbers will cause real confusion.

### 2. Federal Register API `OR` Syntax Is Likely Invalid

The spec uses boolean `OR` operators in FR query terms throughout Phases 17 and 20:

```
conditions[term]=civil+service+OR+federal+workforce+OR+government+employee
conditions[term]=inspector+general+AND+removal+OR+vacancy+OR+acting+OR+appointment
```

The existing codebase (15+ sprints, all working) uses only space-separated terms which the FR API treats as implicit AND:

```
term=schedule+f+civil+service
term=impoundment+rescission+deferral+withholding+appropriation
```

No code in the project uses `OR` or `AND` operators in FR API calls. The FR API documentation is currently returning 302 redirects (inaccessible), so this can't be verified from docs alone, but the strong prior from 15 sprints of working code is that the API treats `OR` as literal text, not a boolean operator.

**Every signal query in Phases 17 and 20 that uses `OR` syntax needs to be reworked.** Options:

- Multiple separate signal definitions (one per term group) — this is the pattern used throughout the codebase today
- Broader single-term queries with downstream keyword filtering
- A quick curl test to confirm API behavior before finalizing

### 3. Document Class Multiplier Changes Are Breaking, Not Additive

Phase 17.3 proposes new multipliers but silently changes existing values:

| Class           | Current (`scoring-config.ts`) | Proposed | Change |
| --------------- | ----------------------------- | -------- | ------ |
| executive_order | 1.5                           | 2.0      | +33%   |
| final_rule      | 1.3                           | 1.5      | +15%   |
| notice          | 0.5                           | 1.0      | +100%  |

These affect ALL existing scoring — every document ever scored. Changing `notice` from 0.5 to 1.0 doubles every notice-class document's `final_score`. This requires re-scoring all documents and re-running all baselines. The new presidential document classes (`proclamation: 1.3`, `presidential_notice: 1.5`) are fine additions, but the existing class changes need explicit justification and acknowledgment that this is a breaking change requiring full re-baseline.

### 4. `classifyByTopic()` Doesn't Exist — And the Mapping Has a Critical Gap

Phase 19.4 references "the existing `classifyByTopic()` function (created during the rhetoric gap analysis)." This function doesn't exist. What exists is:

- `classifyPolicyAreaWithScore()` in `lib/services/intent-data-service.ts` — classifies text into 5 policy areas
- `POLICY_AREA_CATEGORIES` in `lib/data/category-topics.ts` — maps 5 policy areas → assessment categories

**Critical gap:** The `POLICY_AREA_CATEGORIES` mapping only covers 6 of 11 categories:

```typescript
export const POLICY_AREA_CATEGORIES: Record<PolicyArea, string[]> = {
  rule_of_law: ['courts', 'igs'],
  civil_liberties: ['courts', 'executiveActions'],
  elections: ['elections'],
  media_freedom: ['mediaFreedom'],
  institutional_independence: ['rulemaking', 'executiveActions', 'igs'],
};
```

Five categories are **intentionally unmapped**: `civilService`, `fiscal`, `military`, `hatch`, `infoAvailability`. These are the categories with the worst signal gaps — the exact ones the cross-feed is meant to help. As designed, the cross-feed would route rhetoric to courts, elections, mediaFreedom, rulemaking, executiveActions, and igs — but NOT to civilService, fiscal, or military.

The fix: either extend `POLICY_AREA_CATEGORIES` to cover all 11 categories, add new policy areas, or implement a direct keyword-based topic classifier that routes rhetoric documents to categories based on keyword dictionary overlap rather than the 5-area classification.

### 5. `InsufficientData` Status Has Large Blast Radius

Phase 16 proposes adding `InsufficientData` to `StatusLevel` (currently `'Stable' | 'Warning' | 'Drift' | 'Capture'`). The spec estimates "~50–80 lines changed across 4–5 files." The actual impact is significantly larger:

**Status ordering system** (`lib/services/status-ordering.ts`): `STATUS_ORDER` is `['Stable', 'Warning', 'Drift', 'Capture']`. Functions `statusIndex()`, `statusDistance()`, `clampToCeiling()`, and `resolveDowngrade()` all depend on array position. Where does `InsufficientData` sit? Before Stable? It's not on the severity spectrum at all — it's orthogonal.

**AI Skeptic ceiling constraint**: If keyword assessment returns `InsufficientData`, should the AI Skeptic run? Probably not — there's nothing to review. But `enhancedAssessment()` in `ai-assessment-service.ts` unconditionally runs the AI on keyword results.

**15+ files import `StatusLevel`**: Every consumer needs to handle the new variant — assessment service, AI service, review queue, evidence balance, demo scenarios, prompts, enhanced assessment types, etc.

**Stored data**: Existing assessments in the DB have `status='Warning'` with `insufficientData: true` in the detail JSON. Adding a new status means old and new data represent the same concept differently.

**Simpler alternative**: Handle `InsufficientData` as a **display concern only**. Keep `Warning` in the pipeline but check `detail.insufficientData` in UI components to render a distinct badge (gray "No Data" instead of yellow "Warning"). This achieves the same user-facing fix with ~20 lines of UI changes and zero pipeline/type system changes.

### 6. `applicableFrom` Changes the Keyword Data Structure

Keywords are currently simple string arrays:

```typescript
// In assessment-rules.ts
capture: ['schedule f', 'mass termination', ...],
drift: ['reclassification', 'excepted service', ...],
```

The `applicableFrom` metadata (§18.3) requires objects:

```typescript
warning: [{ keyword: 'doge', applicableFrom: '2025-01-20' }, ...]
```

This is a breaking change to the data structure consumed by: the keyword matching loop (`assessment-service.ts`), the suppression system, the AI Skeptic prompt builder, the export/import pipeline, baseline calibration scripts, and every test that constructs keyword data. The "~30 lines for temporal matching logic" estimate understates the ripple effects.

**Simpler alternative**: The spec itself suggests `lib/data/admin-specific-keywords.ts` as a separate file. Use that approach exclusively — a separate overlay file that the matching loop merges based on document date, without changing the core `string[]` data structure.

### 7. oversight.gov Is Back Online

The original SIGNAL-GAP-ANALYSIS.md stated oversight.gov has been "down since Oct 2025." **As of 2026-02-19, oversight.gov is operational.** It serves IG reports, features CIGIE's annual report, tracks $3.1B in identified savings (FY 2026 YTD), and provides searchable access to audits, investigations, and recommendations.

This changes the oversight picture:

- The `oversightGovDown: 'drift'` special rule in `assessment-rules.ts` may be auto-escalating the igs category to Drift when the site is actually reachable — this should be verified and potentially removed or made dynamic
- The IG/oversight category has a functioning primary source that the `html_oversight_gov` signal scraper can use, though the scraper may need updating if the site changed during its downtime
- The "Source Coverage Gaps" section of the spec should be updated — oversight.gov is no longer a gap, but the scraper's compatibility with the current site should be verified

### 8. No Test Specifications

The project has 1021 tests and enforces coverage thresholds via pre-push hooks. Each phase should specify what tests are needed. Key areas:

- Evidence weighting (§19.2): pure function tests for weight application
- News-only ceiling (§19.3): unit tests verifying ceiling enforcement
- `applicableFrom` date filtering (§18.3): boundary tests
- `InsufficientData` rendering (if kept as display-layer fix): component tests
- Cross-feed topic classification: tests verifying rhetoric docs route to correct categories

### 9. No Re-Backfill Strategy

Phases 17, 18, and 19 each require re-running baselines and re-backfilling Trump 2025 data. The spec says "re-run" but doesn't address:

- **Circular dependency**: Keywords need baseline calibration (§18.6), but baselines need final keywords. What's the iteration strategy?
- **Cost estimates**: 4 baselines × AI assessment at expanded keyword volume could be significant
- **Data management**: Should existing scored data be wiped or versioned? The `document_scores` table has a unique constraint on `url` — re-scoring the same documents will conflict

### 10. `document_scores.document_id` Is NULL for Backfilled Data

All 9 non-zero scored documents from the Trump 2025 backfill have `document_id = NULL` in the `document_scores` table — JOIN to `documents` fails. The cross-feed (Phase 19) needs reliable document linking to track evidence source types per scored document. This pre-existing data integrity issue should be noted as a prerequisite fix.

---

## Suggestions

1. **Merge Implementation Sequence into ROADMAP.md** rather than maintaining two parallel sprint plans. The remediation phases can slot in as sprints 15.2–15.5, or replace/reorder sprints 20–24.

2. **Test FR API before finalizing signal queries.** A 5-minute curl test (`curl "https://www.federalregister.gov/api/v1/documents.json?conditions[term]=inspector+OR+general"` vs `conditions[term]=inspector+general`) saves hours of rework.

3. **Handle InsufficientData at the display layer** (check `detail.insufficientData` in UI) rather than adding a new status level to the type system. Much smaller blast radius, same user-facing result.

4. **Use a separate admin-specific keywords file** rather than changing the core keyword data structure with `applicableFrom` metadata.

5. **Extend `POLICY_AREA_CATEGORIES`** to cover all 11 categories before building the cross-feed, or build a new topic classifier that works directly from category keyword dictionaries.

6. **Verify the oversight.gov scraper** (`html_oversight_gov` signal) still works against the live site, and consider making the `oversightGovDown` rule dynamic (check site availability at runtime) rather than hardcoded.

7. **Fix `document_scores.document_id` NULL values** before building the evidence-source-type tracking in Phase 19.
