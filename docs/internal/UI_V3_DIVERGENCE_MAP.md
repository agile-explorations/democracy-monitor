# UI Specification V3 → Architecture Proposal: Divergence Map

**Purpose**: The UI Design Specification V3 was written against the original keyword-severity architecture. The Architecture Proposal replaces that architecture with three-layer triangulated detection. This document maps every point where the UI spec references concepts that have changed, to serve as the checklist for a UI spec V4 rewrite.

**Recommendation**: Rather than patching V3 incrementally, write a UI spec V4 that uses the Architecture Proposal as its backend reference. The information architecture (page structure, four-layer depth model, reading level toggle, visual language principles) largely carries forward. The data model, status system, and visualization content all change.

---

## Structural Changes (affect multiple sections)

### Status System

| UI Spec V3                              | Architecture Proposal                                       | Impact                                                          |
| --------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Stable / Warning / Drift / Capture      | Stable / Elevated / Divergent / Confirmed Concern / No Data | All status pills, color mappings, status definitions throughout |
| Single severity score drives status     | Convergence across 3 independent layers drives status       | Status determination logic, card design, detail page header     |
| "InsufficientData" renders as "Warning" | "No Data" is its own explicit status                        | No Data handling throughout                                     |

### Scoring Model

| UI Spec V3                                   | Architecture Proposal                                                                                   | Impact                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Decay-weighted score (single number)         | Composite structural score + AI flag rate + thematic drift score                                        | All sparklines, trend charts, sort-by-score, ×baseline comparisons  |
| Severity mix (Critical/Drift/Warning counts) | Layer pattern (structural/semantic/thematic normal/elevated)                                            | Week summary cards, category cards, all severity-mix visualizations |
| Per-document keyword severity score          | Per-document: functional classification (Layer 1) + Pass 1/2 assessment (Layer 2) + embedding (Layer 3) | Document table columns, document detail, sorting                    |
| `document_scores.final_score`                | Convergence status derived from three independent layer outputs                                         | Any reference to "score" as a single number                         |

### AI System

| UI Spec V3                                          | Architecture Proposal                                                                      | Impact                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| AI Skeptic (confirms or lowers keyword assessment)  | AI Two-Pass (Pass 1 flags, Pass 2 assesses independently)                                  | AI reviewer notes display, ceiling constraint label, all AI-related UI |
| AI Skeptic "ceiling constraint" — can't raise score | Pass 2 independently assesses; no ceiling constraint concept                               | §5.4 ceiling constraint label — remove entirely                        |
| Single AI assessment per document                   | Pass 1 structured signal + Pass 2 detailed assessment with citations and counter-arguments | AI notes panel redesign                                                |

### Keywords

| UI Spec V3                                                    | Architecture Proposal                                                   | Impact                                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Keywords drive detection and scoring                          | Keywords are annotations only — no scoring role                         | Keyword explorer becomes annotation browser; no "keyword health" concept |
| Suppression audit (keywords that matched but were suppressed) | No suppression concept — keywords don't score, so nothing to suppress   | Remove suppression audit entirely                                        |
| Keyword match highlighting in documents                       | Keyword annotation highlighting in documents (visual only, not scoring) | Rename/reframe throughout                                                |
| "Top keywords for that week"                                  | "Top keyword annotations" or replace with "top Pass 2 findings"         | Hover tooltips, week summary                                             |

---

## Per-Section Divergences

### §2.1 Page Structure

- **Add**: `/overview` — Administration Overview page (primary entry point)
- **Update**: `/` landing page role changes from "The Big Picture" to "This Week" — overview page takes "The Big Picture" role
- **Keep**: All other routes largely unchanged

### §2.3 Four-Layer Depth Model

- **Update**: Layer 2 "Context" example references "Decay-weighted score chart, top keyword matches" → should reference "Convergence indicator, structural deviation chart, top AI findings"
- **Update**: Layer 3 "Evidence" references "suppressed matches" → remove suppression concept
- **Update**: Table mapping Summary/Detailed mode content per page needs rewrite for new data model

### §4.1 Landing Page Layout

- **Update**: Add link to Administration Overview
- **Update**: Category cards show convergence indicator instead of severity score
- **Remove**: "INFRASTRUCTURE CONVERGENCE CALLOUT" — replaced by cross-category synchrony on overview page (or keep as complementary)

### §4.2 Category Card Design

- **Replace**: Decay-weighted score with composite structural deviation or convergence status
- **Replace**: Severity mix badge with convergence indicator (three dots/bars for Layer 1/2/3)
- **Replace**: ×baseline comparison (single number) with long-horizon drift indicator
- **Add**: Long-horizon context line ("X% above historical baseline")

### §4.6 Category Ordering

- **Update**: "By concern level (sorted by decay-weighted score)" → "By concern level (sorted by convergence status, then composite structural deviation)"

### §4.7 Data Integrity Banner

- **Keep**: Concept is sound and carries forward. Implementation may change based on coverage health monitoring.

### §4.8 Source Health Summary Bar

- **Keep**: Carries forward directly.

### §4.9 Confidence Degradation

- **Update**: Confidence now relates to Layer 3 bootstrap period, audit false-negative rates, and model version currency — not just data availability.

### §5.1A API Endpoints

- **Rewrite entirely**: All endpoints need to serve three-layer data instead of keyword scores
- Old: `summary` returns decay-weighted score, baseline comparison, keyword counts
- New: `summary` returns convergence status, per-layer scores, long-horizon drift, AI narrative excerpt

### §5.2 Trend Chart Design

- **Replace**: "Decay-weighted score over time" primary line with "composite structural deviation over time"
- **Replace**: Single baseline band with three-layer visualization (Architecture Proposal's three-panel design)
- **Remove**: Chart toggle tabs (decay-weighted, running avg, running sum, high-water, severity mix) — these are artifacts of the single-score model
- **Add**: Three-panel design from Architecture Proposal: Structural Signature, AI Assessment Distribution, Thematic Drift

### §5.3 Evidence Panel

- **Replace**: "Matched keywords + suppressed keywords" with "Pass 1/2 assessments + keyword annotations"
- **Remove**: Suppression audit entirely
- **Add**: Pass 2 citations, counter-arguments, erosion type classification

### §5.4 AI Reviewer Notes

- **Replace**: AI Skeptic display with Pass 1 + Pass 2 display
- **Remove**: Ceiling constraint concept and label
- **Add**: Pass 2 counter-arguments (visible by default), cited passages, comparative context

### §5A Week Detail Page

- **Replace**: "Total Score: 12.4" with convergence status + layer breakdown
- **Replace**: "Severity Mix: 1C 3D 8W" with layer pattern indicator
- **Replace**: "vs. Baseline: 3.9×" with long-horizon drift percentage

### §6 Methodology Page

- **Rewrite**: Scoring formula section to describe three-layer detection instead of keyword scoring
- **Replace**: Keyword explorer with annotation browser
- **Remove**: §6.3 Keyword health section — keywords no longer drive detection
- **Add**: Convergence synthesis explanation, threshold definitions, layer descriptions

### §7 Infrastructure Convergence

- **Review**: Cross-cutting themes (detention × surveillance × criminalization) may map to cross-category synchrony detection. Evaluate whether this page merges with the overview page or remains separate.

### §8 Rhetoric → Action

- **Review**: Rhetoric cross-feed fix changes how rhetoric documents relate to categories. This page's data model may need updates.
- **Remove**: §8.4 Rhetoric-to-keyword gaps — keywords no longer drive detection, so "gaps" in keyword coverage aren't meaningful

### §9 P2025 Comparison

- **Review**: Largely independent of the detection architecture change. May carry forward mostly unchanged.

### §9A Source Health Page

- **Keep**: Carries forward. Potentially enhanced by coverage health monitoring (roadmap item R-F4).

### §10 Admin Interface

- **Update**: Human review queue now reviews Pass 2 assessments instead of AI Skeptic assessments
- **Remove**: Expert keyword submission form — keywords are annotations, not detection inputs. (Or repurpose as "annotation suggestion" form.)
- **Update**: Methodology proposals may shift focus from keyword proposals to signal query proposals

### §12 Export/CSV

- **Update**: Export columns change from keyword-based fields to three-layer fields

### §13 Baseline Selector

- **Keep**: Concept carries forward. Implementation details change (baseline bands show structural deviation ranges, not score ranges).

### §14 Embeddable Widgets

- **Update**: CategoryCard props change (convergenceStatus instead of decayWeightedScore, layerIndicator instead of severityMix)
- **Add**: AdministrationOverview as embed candidate (compact version of the overview page for journalists)

### §15 Implementation Priorities

- **Rewrite**: Phase sequencing changes. Administration Overview moves to Phase 1. Three-panel category detail replaces single trend chart.

---

## What Carries Forward Unchanged

These sections are architecture-independent and transfer directly to V4:

- §1 Competitive Landscape & Differentiation (positioning statement)
- §2.2 Navigation structure (add /overview route)
- §2.4 Reading Level Toggle concept
- §3 Visual Language (design principles, color system, typography)
- §4.5 First-time visitor onboarding (update content, keep pattern)
- §4.7 Data Integrity Banner (concept and levels)
- §4.8 Source Health Summary Bar
- §14.3 Component Design Pattern (props-driven, self-contained)
- Dark/light mode system
- Responsive design approach
- "Experimental" badge policy

---

## Recommendation

Write UI Spec V4 after Sprint R3 (when all three layers are operational and producing real data). At that point:

1. The Architecture Proposal's dashboard section defines what needs to be visualized
2. Real three-layer output provides concrete examples for mockups
3. The Administration Overview page can be designed against actual Trump T2 backfill data
4. The four baselines provide real comparison numbers

The Architecture Proposal's Dashboard Visualization section (§ "Dashboard Visualization") serves as the interim UI specification for Sprint R4 implementation.
