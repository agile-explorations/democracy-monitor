# Democracy Monitor — UI Design Specification

## Document Purpose

This specification defines the user interface design for Democracy Monitor, informed by competitive landscape research, audience analysis, and the full V3 implementation. It covers information architecture, visual language, component design, and responsive behavior.

**Primary audience (launch)**: U.S. open-source developers who care about democracy and will scrutinize methodology before contributing.

**Primary audience (within one month)**: The general American public. The default experience must be immediately comprehensible to a non-technical user. Developer-oriented features (methodology explorer, document tables, scoring formulas) are available via progressive disclosure but never required.

**Core positioning**: "The existing tools measure expert opinion about democratic health. Democracy Monitor measures the documentary record itself."

---

## 1. Competitive Landscape & Differentiation

### 1.1 Existing Tools

| Tool                                     | Method                                 | Cadence                    | Granularity                     |
| ---------------------------------------- | -------------------------------------- | -------------------------- | ------------------------------- |
| V-Dem                                    | Expert survey (400+ indicators)        | Annual                     | Country-level                   |
| Freedom House                            | Expert scoring                         | Annual                     | Country-level                   |
| Economist Democracy Index                | Expert survey (60 indicators)          | Annual                     | Country-level                   |
| Bright Line Watch                        | Expert + public surveys                | Quarterly                  | Principle-level (31 principles) |
| Protect Democracy / Auth. Warning Survey | Expert polling (~1,000 scholars/day)   | Daily rolling avg          | 6 category scores               |
| Century Foundation Democracy Meter       | Expert panel scoring (23 subquestions) | Annual (launched Jan 2026) | Category-level                  |
| Peace & Justice Law Center Threat Index  | Manual composite (9 measures)          | Periodic updates           | Category-level                  |
| U.S. Democratic Institutions Monitor     | Manual editorial curation              | Ad-hoc updates             | Event-level (no scoring)        |

### 1.2 Democracy Monitor's Unique Position

**What no existing tool does:**

- Automated analysis of the actual government documentary record (Federal Register, GAO, SCOTUS, etc.)
- Per-document scoring with full auditability (every assessment traces to specific keywords in specific documents)
- Weekly cadence from primary sources
- Cross-cutting infrastructure convergence detection (detention × surveillance × criminalization)
- Comparison against a declared-intent baseline (Project 2025)
- Open-source methodology ("methodology as code") inviting community scrutiny

**Framing for the UI**: "This is not an expert opinion index. This is an automated analysis of the public documentary record. Here's what the government published, here's how we scored it, here's the full methodology. Scrutinize it yourself."

---

## 2. Information Architecture

### 2.1 Page Structure

```
/                           Landing page — "The Big Picture"
/category/[key]             Category detail — "The Full Story" (11 routes)
/category/[key]/week/[date] Week detail — "What Happened This Week" (drill-down)
/methodology                Methodology explorer — "How This Works"
/infrastructure             Infrastructure convergence — "Cross-Cutting Patterns"
/rhetoric                   Rhetoric → Action tracking — "Words Into Policy"
/p2025                      Project 2025 comparison — "Blueprint vs. Reality"
/health                     Source health & data integrity — "Can We See?"
/admin/login                Admin authentication (shared-secret token)
/admin/reviews              Human review queue (behind admin token)
/admin/proposals            Methodology proposals from all sources (behind admin token)
/admin/submissions          Expert keyword submission form (behind admin token)
```

**Dropped routes from current codebase:**

- `/history` (all-category trajectory chart) — subsumed by per-category trend charts on `/category/[key]` detail pages and the convergence-over-time chart on `/infrastructure`. No dedicated multi-category overlay page in this design.
- `/digest/[date]` (daily digest archive) — dropped. Weekly cadence is the primary rhythm; daily digests added noise without analytical value.
- `/sources` (data source documentation) — replaced by `/health`, which shows live operational status instead of static documentation.

Note: API/export documentation lives in the GitHub repository, not on the public site. Developers will find it there.

### 2.2 Navigation

**Top bar** (persistent across all pages):

- Logo + "Democracy Monitor" wordmark (left)
- Nav links: Overview | Methodology | Infrastructure | Rhetoric | P2025 | Health (center)
- Reading level toggle: "Summary" / "Detailed" (right) — see §2.4
- Dark/light mode toggle (right, next to reading level) — respects system preference by default
- "Experimental" badge (always visible) — see §6.1

**Mobile**: Hamburger menu for nav links. Reading level toggle remains visible.

### 2.3 Four-Layer Depth Model

Every piece of data in the system can be explored at four levels of depth. The UI uses progressive disclosure — each layer reveals more detail:

| Layer              | Audience          | What They See                                                                         | Example                                                                  |
| ------------------ | ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **1. Signal**      | General public    | Status indicator + one-sentence summary                                               | "Elevated risk signals in judicial compliance"                           |
| **2. Context**     | Engaged citizen   | Trend chart + key evidence + AI reviewer notes                                        | Decay-weighted score chart, top keyword matches, "How we could be wrong" |
| **3. Evidence**    | Analyst / OSS dev | Full document list, suppression audit, all four cumulative views, baseline comparison | Per-document scores, suppressed matches with reasons, severity breakdown |
| **4. Methodology** | Contributor       | Source code links, scoring formulas, config values, export endpoints                  | `scoring-config.ts` contents, worked examples, data export               |

Layers 1-2 appear on the landing page. Layers 3-4 appear on detail pages via Detailed mode.

**This model applies consistently across all pages:**

| Page                  | Layer 1-2 (Summary mode)                                   | Layer 3-4 (Detailed mode)                                                                                                                     |
| --------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Landing page**      | Category cards with sparklines, status, summary            | Card shows baseline comparison, severity breakdown                                                                                            |
| **Category detail**   | Assessment summary, trend chart, top evidence              | Document table, suppression audit, all chart views, semantic drift, methodology links                                                         |
| **Week detail**       | Week summary cards, top keyword matches, AI notes          | Full document table with per-doc scores, suppression audit, methodology links for keywords that fired                                         |
| **Infrastructure**    | Convergence status, theme intensity bars, summary sentence | Full keyword match lists per theme, suppression details, convergence score formula, methodology links                                         |
| **Rhetoric → Action** | Summary table (what's said → what's done, lag weeks)       | Dual sparklines, correlation charts, full keyword lists, matched pairs with doc links, confidence statistics, rhetoric-to-keyword gaps (§8.4) |
| **P2025**             | Headline percentage, progress bar, top 3-5 recent matches  | Full proposal table, escalation alerts with LLM reasoning, per-match confidence, human review status                                          |

### 2.4 Reading Level Toggle

Two modes, persisted via localStorage:

**"Summary" mode** (default for all users — 10th grade reading level):

- This is the PRIMARY experience, not a simplified version of "Detailed"
- Plain-language category names (already implemented: "Government Worker Protections" not "Civil Service")
- Shorter descriptions, no jargon, no acronyms without explanation
- Clean chart with sensible defaults (decay-weighted only, no toggles)
- Shows: status, trend, top 3 evidence items, AI summary, "How we could be wrong"
- Hides: suppression audit, raw keyword lists, scoring formulas, JSONB data, document class breakdown
- Design the Summary experience FIRST, then add Detailed on top of it

**"Detailed" mode** (for developers, analysts, contributors):

- Technical category keys shown alongside plain names
- Full descriptions with legal/institutional context
- All chart variants available via toggle tabs
- Shows: everything Summary shows, plus suppression audit, full keyword lists, document class breakdown, baseline comparison band, semantic drift, scoring formula references
- Sortable/filterable document table with export

**Implementation**: The toggle does NOT change the page layout or navigation — it controls the verbosity and visibility of content within components. This avoids maintaining two separate UIs. Components render conditionally based on a `readingLevel` context value.

---

## 3. Visual Language

### 3.1 Design Principles

1. **Evidence over judgment.** Show the data trail, not just conclusions. Every number should be clickable to its source.
2. **Context over alarm.** Numbers in isolation are meaningless. Always show relative to baseline, historical range, or comparison.
3. **Transparency over polish.** The system's limitations should be as visible as its findings. "Experimental" badges, confidence intervals, and "how we could be wrong" are first-class UI elements, not footnotes.
4. **Restraint over spectacle.** No pulsing red alerts, no alarm bells, no countdown timers. The subject matter is serious enough that sensationalism undermines credibility.

### 3.2 Color System

**Move away from traffic-light (red/yellow/green) to a single-hue intensity scale.**

Rationale:

- Traffic lights imply binary verdicts ("good" vs. "bad"). The spec explicitly frames outputs as risk signals, not verdicts.
- ~8% of men have red-green color blindness. A red/green system is exclusionary.
- A single-hue scale communicates "more" vs. "less" intensity rather than moral judgment.

**Primary scale** (for status tiers): Slate → Indigo progression

| Tier    | Color         | Hex       | Usage                                      |
| ------- | ------------- | --------- | ------------------------------------------ |
| Stable  | Slate gray    | `#94A3B8` | Neutral — within baseline range            |
| Warning | Light indigo  | `#818CF8` | Mildly elevated — isolated signals         |
| Drift   | Medium indigo | `#6366F1` | Structurally concerning — pattern emerging |
| Capture | Deep indigo   | `#4338CA` | Severe — institutional integrity at risk   |

**Supporting colors (light mode):**

- Background: `#FAFBFC` (near-white, slight cool tone)
- Card background: `#FFFFFF`
- Text primary: `#1E293B` (slate-900)
- Text secondary: `#64748B` (slate-500)
- Borders: `#E2E8F0` (slate-200)
- Accent (links, interactive): `#4F46E5` (indigo-600)
- Suppressed/muted: `#CBD5E1` (slate-300, for suppressed keywords)
- Baseline band: `#F1F5F9` with `#E2E8F0` border (subtle shading on charts)

**Supporting colors (dark mode):**

- Background: `#0F172A` (slate-900)
- Card background: `#1E293B` (slate-800)
- Text primary: `#F1F5F9` (slate-100)
- Text secondary: `#94A3B8` (slate-400)
- Borders: `#334155` (slate-700)
- Accent (links, interactive): `#818CF8` (indigo-400)
- Suppressed/muted: `#475569` (slate-600, for suppressed keywords)
- Baseline band: `#1E293B` with `#334155` border

**Dark mode implementation**: Use CSS custom properties (variables) for all colors. Toggle via `prefers-color-scheme` media query (system default) with a manual override toggle in the header. Store preference in localStorage. The single-hue indigo intensity scale works naturally in both modes — lighter tints for Stable/Warning in dark mode, darker fills for Drift/Capture.

**Dark mode additional specifics:**

- **Chart colors**: Lines and fills need higher contrast on dark backgrounds. Use indigo-400 (not indigo-600) for the primary line, and increase baseline band opacity from 5% to 10%.
- **Experimental badge**: Use indigo-900 background with indigo-200 text (dark) vs. indigo-50 background with indigo-700 text (light).
- **Admin interface**: Admin pages use the same dark mode system — no separate admin theme.
- **Export buttons**: Use `--color-text-secondary` for export button text in both modes, ensuring they remain unobtrusive.
- **Status icons**: The Unicode icons (—, △, ▲, ◆) should use `--color-text-primary` in both modes — they get their semantic meaning from the adjacent color fill, not from their own color.

**Accessibility requirements:**

- All status tiers must be distinguishable without color alone (use icons + text labels)
- Minimum 4.5:1 contrast ratio for text on backgrounds (WCAG AA)
- Chart lines must use pattern/dash differentiation in addition to color

**Status icons** (paired with color, never color alone):

| Tier    | Icon                  | Concept                       |
| ------- | --------------------- | ----------------------------- |
| Stable  | `—` (dash) or `○`     | Baseline, unremarkable        |
| Warning | `△` (open triangle)   | Attention, not alarm          |
| Drift   | `▲` (filled triangle) | Elevated, pattern forming     |
| Capture | `◆` (diamond)         | Severe, institutional concern |

### 3.3 Typography

| Element                   | Font                                 | Size | Weight |
| ------------------------- | ------------------------------------ | ---- | ------ |
| Page title                | System sans-serif (Inter if loaded)  | 24px | 600    |
| Section header            | System sans-serif                    | 18px | 600    |
| Card title                | System sans-serif                    | 16px | 600    |
| Body text                 | System sans-serif                    | 14px | 400    |
| Caption / metadata        | System sans-serif                    | 12px | 400    |
| Code / methodology values | Monospace (JetBrains Mono if loaded) | 13px | 400    |

Use system font stack for performance: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

### 3.4 Spacing & Layout

- Base unit: 4px
- Card padding: 24px
- Card gap: 16px
- Section gap: 32px
- Max content width: 1200px (centered)
- Category grid: 3 columns on desktop, 2 on tablet, 1 on mobile

---

## 4. Landing Page — "The Big Picture"

The landing page answers: "What is this, and should I care?"

### 4.1 Page Structure (top to bottom)

```
┌─────────────────────────────────────────────────────────────┐
│  Header: "Democracy Monitor"                                │
│  Subtitle: "Automated analysis of the U.S. government       │
│  documentary record"                                        │
│  [Experimental] badge    [Last updated: date]               │
│  Reading level: [Summary ○ | ● Detailed]                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  DATA INTEGRITY BANNER (if not "high")                      │
│  See §4.7 — appears above everything when data sources      │
│  are degraded. Most prominent element on the page when      │
│  active.                                                    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  POSITIONING STATEMENT (2-3 sentences)                      │
│  "Democracy Monitor reads government documents published    │
│  in the Federal Register and scores them using transparent, │
│  auditable keyword analysis. Unlike expert opinion indices,  │
│  every assessment traces to specific documents and specific │
│  keywords. The methodology is open source."                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SOURCE HEALTH SUMMARY BAR                                  │
│  See §4.8 — compact bar showing source availability.        │
│  Always visible. Links to /health for full detail.          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  INFRASTRUCTURE CONVERGENCE CALLOUT (if active)             │
│  Compact banner showing convergence status across the       │
│  three cross-cutting themes. Only shows if ≥1 theme active. │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CATEGORY GRID (11 cards, 3 columns)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│  │ Card     │ │ Card     │ │ Card     │                    │
│  │          │ │          │ │          │                    │
│  └──────────┘ └──────────┘ └──────────┘                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│  │ Card     │ │ Card     │ │ Card     │                    │
│  └──────────┘ └──────────┘ └──────────┘                    │
│  ... (11 total, last row has 2 cards)                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  METHODOLOGY FOOTER                                         │
│  Brief explanation + links to /methodology and GitHub       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Category Card Design

Each card is the primary unit of the landing page. It shows Layer 1 (Signal) and Layer 2 (Context) information.

```
┌─────────────────────────────────────────────┐
│  ▲ Government Worker Protections    Drift   │  ← status icon + name + tier label
│  civilService                               │  ← technical key (Detailed mode only)
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  ╱╲    ╱╲                           │    │  ← sparkline (8 weeks of decay-weighted score)
│  │ ╱  ╲╱╱  ╲─╱╲─                      │    │     with baseline band shaded behind
│  │─          ╲╱                        │    │
│  └─────────────────────────────────────┘    │
│  Current: 12.4    Baseline avg: 3.2         │  ← decay-weighted score vs baseline
│  (3.9× baseline)                            │  ← relative to baseline, in parentheses
│                                             │
│  Summary: "Elevated keyword signals related  │  ← AI-generated or template summary
│  to workforce reclassification and excepted  │     (Summary mode: 1-2 sentences)
│  service expansion."                         │     (Detailed mode: + top keywords)
│                                             │
│  12 docs this week · 4 flagged              │  ← document count context
│                                             │
│  [View details →]                           │  ← link to /category/civilService
│                                             │
│  ⚠ Experimental · How this works →          │  ← always present
└─────────────────────────────────────────────┘
```

**Sparkline design:**

- Shows last 8 weeks (matching the decay half-life)
- Decay-weighted score as the primary line
- Baseline average as a horizontal reference line (dashed)
- Baseline ±1 stddev as a subtle shaded band
- No axis labels (space-constrained) — hover for values on desktop
- On mobile, sparkline is full-width below the title row

**Card sorting**: Cards are sorted by current decay-weighted score (descending). Most-concerning categories appear first. This is more useful than alphabetical and immediately communicates "here's what to look at."

**"Stable" cards**: Categories at or near baseline get a visually quieter treatment — lighter border, compressed layout. They shouldn't dominate the page.

### 4.3 Infrastructure Convergence Banner

Only appears when ≥1 infrastructure theme is active. Sits between the positioning statement and the category grid.

```
┌─────────────────────────────────────────────────────────────┐
│  ◆ Infrastructure Convergence: Active                       │
│                                                             │
│  Detention ████████░░ (12)   Surveillance ████░░░░░░ (6)   │
│  Criminalization ██░░░░░░░░ (3)                             │
│                                                             │
│  "Two of three authoritarian infrastructure dimensions      │
│  show concurrent activity across multiple categories."      │
│                                                             │
│  [View analysis →]                                          │
└─────────────────────────────────────────────────────────────┘
```

Intensity bars show match counts per theme. The bar fill uses the indigo intensity scale. The sentence is auto-generated from the convergence level (emerging/active/entrenched).

### 4.4 No Single Aggregate Number

**Deliberate design choice**: The landing page does NOT show a single "democracy score" across all categories. Reasons:

- It implies false precision (an average of 11 different institutional dimensions is meaningless)
- It invites misuse ("the score went from 47 to 52, democracy is improving!")
- It obscures the actual story (which specific institutions are under stress?)
- It would undermine credibility with the OSS developer audience who will immediately ask "how do you average judicial compliance with press freedom?"

Instead, the grid of 11 cards _is_ the overview — it shows the pattern across all categories simultaneously, like a small-multiples visualization. Users can see at a glance which categories are elevated and which are stable.

### 4.5 First-Time Visitor Onboarding

A dismissible overlay for first-time visitors (detected via localStorage flag). Appears once, never again after dismissal.

**Design**: A semi-transparent overlay with a centered card (max 500px wide). Not a multi-step tour — a single, scannable explainer.

```
┌─────────────────────────────────────────────┐
│                                         [✕] │
│  Welcome to Democracy Monitor               │
│                                             │
│  This site automatically reads government   │
│  documents published in the Federal         │
│  Register — executive orders, rules, and    │
│  notices — and looks for patterns that      │
│  may signal changes to democratic           │
│  institutions.                              │
│                                             │
│  Three things to know:                      │
│                                             │
│  1. This is not expert opinion.             │
│     Every assessment traces to specific     │
│     documents and specific keywords.        │
│                                             │
│  2. This is experimental.                   │
│     The methodology is under active         │
│     development and has not been            │
│     validated by domain experts.            │
│                                             │
│  3. This is open source.                    │
│     The full methodology, keyword           │
│     dictionaries, and scoring formulas      │
│     are public. Scrutinize them.            │
│                                             │
│  [Got it — show me the data]                │
│                                             │
│  How this works →  (link to /methodology)   │
└─────────────────────────────────────────────┘
```

**Behavior:**

- Appears on first visit to any page (not just landing)
- Dismissed by clicking the button, the ✕, or clicking outside the overlay
- Sets `localStorage.dm_onboarded = true`
- Never appears again unless localStorage is cleared
- Does NOT appear if `readingLevel` is already set in localStorage (returning user who cleared cookies but previously configured preferences)

### 4.6 Card Ordering Toggle

A small toggle above the category grid allowing users to switch between two ordering modes:

```
Sort by: [● Concern level] [○ Category group]
```

**"Concern level" (default):** Cards sorted by current decay-weighted score, descending. Most-concerning categories appear first. The layout changes week to week.

**"Category group":** Cards in a fixed order, grouped by institutional domain:

| Group                      | Categories                                | Rationale                                    |
| -------------------------- | ----------------------------------------- | -------------------------------------------- |
| Executive Power            | civilService, indices, rulemaking         | Direct measures of executive branch activity |
| Oversight & Accountability | igs, fiscal, hatch                        | Watchdog and accountability mechanisms       |
| Rule of Law                | courts, military                          | Legal compliance and use of force            |
| Public Sphere              | elections, mediaFreedom, infoAvailability | Democratic participation and transparency    |

Each group gets a subtle label above its cards (e.g., "Executive Power" in small caps, slate-400). The grouping helps users understand the institutional structure without needing to read 11 individual descriptions.

**Persistence:** Ordering preference stored in localStorage alongside readingLevel and colorScheme.

### 4.7 Data Integrity Banner (Global)

The data integrity banner appears on **every page** (landing, category detail, week detail, infrastructure, rhetoric, P2025, health) when the meta-assessment `dataIntegrity` is anything other than `high`. It sits below the header and above all page content. It is the single most important element when active — more important than any keyword-based assessment.

**Design principle**: When the system can't see clearly, it says so before saying anything else.

**Four levels, from least to most prominent:**

**Implementation note:** The threshold boundaries between these four levels are defined as named constants in `lib/methodology/scoring-config.ts` (e.g., `DATA_INTEGRITY_MODERATE_THRESHOLD`, `DATA_INTEGRITY_LOW_THRESHOLD`, `DATA_INTEGRITY_CRITICAL_THRESHOLD`). The UI reads the `dataIntegrity` field from the meta-assessment API response — it does not compute the level client-side.

**`high` — not displayed.** The system is operating normally. No banner.

**`moderate` — informational, muted.**

```
┌─────────────────────────────────────────────────────────────┐
│  ⓘ Data availability: moderate                              │
│  Some sources are responding with reduced volume.           │
│  Assessments may not reflect the complete picture.          │
│  [Source details →]                                         │
└─────────────────────────────────────────────────────────────┘
```

- Background: slate-100 (light) / slate-800 (dark)
- Left border: 4px solid slate-400
- Icon: ⓘ info circle
- Collapsible after reading (user can dismiss for this session)

**`low` — warning, attention-getting.**

```
┌─────────────────────────────────────────────────────────────┐
│  △ Data availability: low                                   │
│  Multiple data sources are unavailable or silent.           │
│  Assessments below are based on incomplete data and         │
│  should be interpreted with caution.                        │
│  3 of 8 sources healthy · Volume at 40% of expected         │
│  [View source health →]                                     │
└─────────────────────────────────────────────────────────────┘
```

- Background: indigo-50 (light) / indigo-950 (dark)
- Left border: 4px solid indigo-400
- Icon: △ warning triangle
- NOT dismissible — persists as long as condition holds

**`critical` — alarm, dominant visual element.**

```
┌─────────────────────────────────────────────────────────────┐
│  ◆ DATA SOURCES CRITICALLY DEGRADED                         │
│                                                             │
│  The majority of government data sources this system        │
│  depends on are unavailable or silent. Assessments below    │
│  should NOT be treated as reliable indicators of            │
│  institutional health.                                      │
│                                                             │
│  1 of 8 sources healthy · Confidence capped at 30%          │
│  The absence of data may itself be a significant signal.    │
│                                                             │
│  [View source health details →]                             │
└─────────────────────────────────────────────────────────────┘
```

- Background: indigo-100 (light) / indigo-900 (dark)
- Full-width, prominent padding (24px vertical)
- Left border: 4px solid indigo-600
- Icon: ◆ filled diamond (capture-tier)
- Bold title, larger text than other levels
- NOT dismissible
- The sentence "The absence of data may itself be a significant signal" always appears at critical level — this is the V3 addendum's central thesis

**On non-landing pages**: The banner appears in condensed form (single line with expand-to-full on click) to avoid overwhelming detail pages, but it is always present:

```
┌─────────────────────────────────────────────────────────────┐
│  ◆ Data sources critically degraded — assessments may be    │
│  unreliable  [Details ▾]                                    │
└─────────────────────────────────────────────────────────────┘
```

### 4.8 Source Health Summary Bar

Always visible on the landing page, positioned between the positioning statement and the infrastructure convergence banner. A compact, single-line summary with a link to the full `/health` page.

**When all sources healthy:**

```
┌─────────────────────────────────────────────────────────────┐
│  Sources: ●●●●●●●● 8/8 healthy                [Details →] │
└─────────────────────────────────────────────────────────────┘
```

- Dots are filled circles in green-500 (an exception to the "no traffic lights" rule — source health is operational status, not a risk judgment)
- Extremely compact — single line, minimal visual weight
- `[Details →]` links to `/health`

**When some sources degraded:**

```
┌─────────────────────────────────────────────────────────────┐
│  Sources: ●●●●●◐○○ 5 healthy · 1 degraded · 2 unavailable │
│                                                [Details →] │
└─────────────────────────────────────────────────────────────┘
```

- ● filled = healthy, ◐ half-filled = degraded/silent, ○ empty = unavailable
- Source counts shown as text
- When <100% healthy, the bar gets a subtle background tint to draw attention

**Color scheme for source dots:**

- Healthy ●: green-500 (light) / green-400 (dark)
- Degraded/Silent ◐: amber-500 (light) / amber-400 (dark)
- Unavailable ○: slate-400 (light) / slate-500 (dark)

Note: This is one of the few places traffic-light-adjacent colors (green/amber) are used. The rationale is that source health is purely operational status ("is this API responding?"), not a risk judgment about institutional health. The indigo scale is reserved for institutional risk signals.

**Implementation note:** These operational status colors (green-500, amber-500, slate-400) are hardcoded constants, not derived from the indigo design tokens. They should be defined as named constants (e.g., `SOURCE_STATUS_HEALTHY_COLOR`, `SOURCE_STATUS_DEGRADED_COLOR`, `SOURCE_STATUS_UNAVAILABLE_COLOR`) to prevent a future refactor from accidentally "fixing" them into the indigo scale.

### 4.9 Confidence Degradation on Category Cards

When a category's assessment confidence is degraded due to source health issues, the category card shows a subtle indicator _above_ the status tier label. This communicates "we're less certain than usual about this assessment" without overwhelming the card layout.

**Design**: A small icon with hover/click detail, not a full sentence.

```
┌─────────────────────────────────────────────┐
│  ⚠︎ Limited data                              │  ← confidence degradation indicator
│  ▲ Government Worker Protections    Drift   │  ← normal status row
│  ...                                        │
└─────────────────────────────────────────────┘
```

**Indicator states:**

- **No indicator**: Confidence is normal. Nothing displayed.
- **`⚠︎ Limited data`**: Source health is degraded for this category. Shown in amber-500 text, small font (12px). On hover (desktop) or tap (mobile), shows a tooltip:

  > "3 of 5 sources for this category are unavailable. This assessment is based on incomplete data. [View source health →]"

- **`◆ Unreliable`**: Source health is critical for this category. Shown in indigo-600 text. On hover/tap:

  > "Most sources for this category are unavailable. This assessment should not be treated as reliable. Confidence capped at 30%. [View source health →]"

**On the category detail page**: The same indicator appears in the page header, but expanded into a full notice bar (not just an icon) when confidence is degraded:

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠︎ Data availability reduced — 3 of 5 sources unavailable   │
│  This assessment is based on incomplete data and may not    │
│  reflect the full picture. [View source health →]           │
├─────────────────────────────────────────────────────────────┤
│  ▲ Following Court Orders                         Drift    │
│  ...                                                        │
└─────────────────────────────────────────────────────────────┘
```

This notice appears _above_ the status, consistent with the V3 addendum's requirement that reduced data reliability takes visual priority over the assessment itself.

---

## 5. Category Detail Page — "The Full Story"

Route: `/category/[key]` (e.g., `/category/courts`)

This page answers: "What exactly is happening in this category, and why should I trust the assessment?"

### 5.1 Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to overview                                         │
│                                                             │
│  ▲ Following Court Orders                         Drift    │
│  courts · Last assessed: Feb 8, 2026 · 47 docs this week  │
│  [Experimental]                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ASSESSMENT SUMMARY                                         │
│  AI-generated contextual summary (reading-level-aware)      │
│  "How we could be wrong" section (always visible)           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  TREND CHART (large, primary visualization)                 │
│  Default: decay-weighted score over time                    │
│  Toggle: [Decay-weighted | Running avg | Running sum |      │
│           High-water mark | Severity mix]                   │
│  Baseline band always visible                               │
│  Annotations for known events (if backtested)               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  EVIDENCE PANEL (two columns on desktop)                    │
│  ┌─────────────────────┐ ┌────────────────────────┐         │
│  │ WHAT TRIGGERED THIS │ │ WHAT WAS SUPPRESSED    │         │
│  │ Matched keywords    │ │ Suppressed matches     │         │
│  │ with doc links      │ │ with reasons           │         │
│  │ grouped by tier     │ │ (Detailed mode only)   │         │
│  └─────────────────────┘ └────────────────────────┘         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  AI REVIEWER NOTES (Detailed mode, or collapsed in Summary) │
│  Keyword review, recommended status, downgrade reasoning,   │
│  evidence for/against, what would change their mind         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  DOCUMENT TABLE (sortable, filterable)                      │
│  Per-document scores, classes, multipliers, match details   │
│  [Export CSV →]                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SEMANTIC DRIFT (Detailed mode only)                        │
│  "This week's language shift is 2.8× normal variation"      │
│  Chart: drift over time with noise floor band               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  METHODOLOGY SIDEBAR (or collapsible section)               │
│  Keywords for this category (all tiers)                     │
│  Suppression rules for this category                        │
│  Scoring config values                                      │
│  [View source on GitHub →]                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.1A Required API Endpoints

The category detail page and week detail page require API endpoints that do not yet exist. The current API only serves raw feed data (`/api/proxy`) and assessments (`/api/assess-status`). New endpoints needed:

| Endpoint                                      | Returns                                                                                                             | Used By                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `GET /api/category/[key]/summary`             | Current status, decay-weighted score, baseline comparison, AI assessment summary, document counts, confidence level | Category detail header, landing page cards |
| `GET /api/category/[key]/weekly`              | Array of weekly aggregates (score, doc count, severity mix, top keywords)                                           | Trend chart, sparklines                    |
| `GET /api/category/[key]/week/[date]`         | Single week: all documents with scores, keyword matches, suppressed matches, AI assessment                          | Week detail page                           |
| `GET /api/category/[key]/documents?from=&to=` | Paginated document list with scores and match details                                                               | Document table                             |
| `GET /api/meta-assessment`                    | Data integrity level, source counts, volume normality, coverage breadth                                             | Data integrity banner, source health bar   |
| `GET /api/baselines`                          | Available baselines with mean/stddev per category                                                                   | Baseline selector, sparkline bands         |

These endpoints should be defined in the backend specification and built before or in parallel with the UI phases that consume them.

### 5.2 Trend Chart Design

The primary chart shows decay-weighted score over time. It is the centerpiece of the detail page.

**Elements:**

- **Primary line**: Decay-weighted score (solid, indigo-600, 2px)
- **Baseline band**: Mean ± 1 stddev from default baseline (shaded `#F1F5F9` with `#E2E8F0` borders)
- **Baseline label**: "Biden 2024 baseline" in small text on the band
- **Baseline selector** (Detailed mode): Multi-select pills to overlay multiple baselines simultaneously (see §13). Each selected baseline adds its own reference band. Maximum 2 baselines at once. Only changes the reference band and relative comparison — underlying scores are unaffected.
- **X-axis**: Weeks since inauguration (Jan 20, 2025), labeled with dates
- **Y-axis**: Score (auto-scaled)
- **Hover**: Tooltip with exact values, document count, top keywords for that week
- **Click**: Clicking a data point navigates to the week detail page (`/category/[key]/week/[date]`). Pointer cursor on hover to signal interactivity.
- **Annotations**: Vertical dashed lines at known events (if historical validation data exists), with labels

**Chart toggles** (tabs above the chart):

- Decay-weighted (default) — "How concerned should we be right now?"
- Running average — "Is the average week getting better or worse?"
- Running sum — "How much total institutional stress has accumulated?"
- High-water mark — "How does now compare to the worst it's been?"
- Severity mix — "What proportion of signals are severe vs. mild?"

In Summary mode, only show the decay-weighted chart with simpler axis labels. In Detailed mode, show the toggle tabs.

**Backend dependencies:** Several chart views require backend features that are built in later sprints:

- "Semantic drift visualization" requires baseline embedding centroids (V3 Addendum Sprint F — Novel Threat Detection).
- "High-water mark" requires persisted historical maximum scores per category (computed during weekly aggregation).
- "Severity mix" requires per-tier weekly aggregates to already be stored (V3 Addendum Sprint A — Source Health schema, which adds weekly_aggregates table).
- Baseline overlay selector requires baseline period statistics to be pre-computed and stored.

Chart toggles that depend on unavailable data should be disabled with a tooltip: "Requires [feature] — coming soon."

### 5.3 Evidence Panel

Two-column layout on desktop, stacked on mobile.

**Left column — "What triggered this assessment":**

- Keywords grouped by tier (Capture → Drift → Warning)
- Each keyword shows: the keyword, the document title (linked to Federal Register), and ~100 chars of context
- Count badge: "3 capture · 7 drift · 12 warning"

**Right column — "What was suppressed" (Detailed mode only):**

- Keywords that matched but were suppressed or downweighted
- Each shows: keyword, suppression rule that fired, reason
- This is a credibility feature — it shows the system actively prevents false positives

### 5.4 AI Reviewer Notes

Displays the skeptical AI assessment. In Summary mode, show a collapsed summary ("AI reviewer agrees with Drift assessment, confidence 0.82"). In Detailed mode, show the full breakdown:

- **Keyword review**: For each matched keyword, the AI's assessment of whether it's a genuine concern or false positive
- **Recommended status**: Same or lower than keyword engine result. **The AI can never raise the severity — the keyword engine is the ceiling.** The UI should display this constraint explicitly: "The AI reviewer can confirm or recommend lowering the automated assessment, but cannot raise it."
  - **Implementation note:** This ceiling constraint is enforced backend-side (in the AI assessment service, not just in the UI). The UI label is a transparency feature, not a client-side enforcement mechanism. The backend should return the ceiling level as part of the AI assessment response so the UI can display: "AI assessment capped at [level] (keyword engine ceiling)."
- **Downgrade reasoning**: If AI recommends lower status, why
- **Evidence for**: What supports the concerning assessment
- **Evidence against**: What suggests things aren't as bad (REQUIRED — this always appears)
- **How we could be wrong**: At least 2 alternative interpretations
- **What would change our mind**: What evidence would warrant escalation

### 5.5 Document Table

Sortable, filterable table of all documents scored in this category.

| Column     | Description                                        |
| ---------- | -------------------------------------------------- |
| Date       | Published date                                     |
| Title      | Document title (linked to source)                  |
| Class      | Document class (executive_order, final_rule, etc.) |
| Score      | Final score (severity × class multiplier)          |
| Matches    | Count by tier: "1C · 2D · 3W"                      |
| Suppressed | Count of suppressed matches                        |

**Filters**: By tier (show only docs with capture matches), by class, by date range.
**Export**: CSV download button.

---

## 5A. Week Detail Page — "What Happened This Week"

Route: `/category/[key]/week/[date]` (e.g., `/category/courts/week/2025-02-03`)

Accessed by: clicking a data point on the trend chart, or clicking a week row in the document table.

This page answers: "What exactly happened in this category during this specific week?"

**Design decision: Full page, not modal.** The week detail is a standalone page (not a modal overlay) for three reasons:

1. **Shareability**: A contributor can send someone "look at what happened the week of Feb 3" as a direct URL
2. **Deep-linking**: Blog posts, academic papers, and news articles can link directly to a specific week's evidence
3. **Content volume**: The keyword matches, document table, and AI notes are substantial — a modal would feel cramped

The back-link ("← Back to Following Court Orders") keeps the category context one click away.

**URL stability requirement:** Since these pages are designed for sharing and deep-linking, they must be independently loadable — navigating directly to `/category/courts/week/2025-02-03` must work without any prior navigation state. The page fetches all needed data on mount via the `GET /api/category/[key]/week/[date]` endpoint (see §5.1A). No client-side state from the parent category page is required.

### 5A.1 Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Following Court Orders                           │
│                                                             │
│  Week of February 3, 2025                                   │
│  Following Court Orders (courts)                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  WEEK SUMMARY                                               │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│  │ Total     │ │ Documents │ │ Severity  │ │ vs.       │   │
│  │ Score     │ │ Scored    │ │ Mix       │ │ Baseline  │   │
│  │  12.4     │ │    47     │ │ 1C 3D 8W  │ │ 3.9×      │   │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  POSITION IN CONTEXT (mini chart)                           │
│  Sparkline of recent weeks with THIS week highlighted       │
│  Shows where this week falls in the trajectory              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  TOP KEYWORD MATCHES (grouped by tier)                      │
│                                                             │
│  ◆ Capture (1 match)                                        │
│    "contempt of court" — found in:                          │
│    • DOJ Notice re: Immigration Order Compliance [link]     │
│                                                             │
│  ▲ Drift (3 matches)                                        │
│    "delayed compliance" — found in 2 documents:             │
│    • Agency Response to Court-Ordered Deadline [link]       │
│    • Status Report on Injunction Compliance [link]          │
│    "emergency stay sought" — found in:                      │
│    • Motion for Emergency Stay of Preliminary... [link]     │
│                                                             │
│  △ Warning (8 matches)                                      │
│    "injunction issued" — found in 3 documents...            │
│    "judicial review" — found in 5 documents...              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SUPPRESSED MATCHES (Detailed mode)                         │
│  Keywords that matched but were contextually suppressed     │
│  "court packing" — suppressed: co-occurred with "FDR"       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  AI REVIEWER ASSESSMENT FOR THIS WEEK                       │
│  (If AI assessment was run for this period)                 │
│  Status recommendation, confidence, reasoning               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ALL DOCUMENTS THIS WEEK (sortable table)                   │
│  Date | Title | Class | Score | Matches | Suppressed        │
│  (every document scored in this category for this week)     │
│  [Export this week as CSV →]                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5A.2 Accessing the Week View

**From the trend chart**: Clicking any data point on the trend chart navigates to the week detail page for that week. The cursor should indicate clickability (pointer cursor, slight highlight on hover).

**From the document table**: A "View week →" link in the table when grouped by week.

**From the URL**: Direct linking (e.g., shared by a contributor analyzing a specific week).

### 5A.3 Week Summary Cards

Four stat cards at top provide immediate context:

| Card             | Value                                    | Meaning                      |
| ---------------- | ---------------------------------------- | ---------------------------- |
| Total Score      | Sum of finalScore for all docs this week | Raw magnitude of signals     |
| Documents Scored | Count                                    | Volume context               |
| Severity Mix     | "1C · 3D · 8W" (counts by tier)          | Composition of signals       |
| vs. Baseline     | "3.9× baseline" or "Within baseline"     | Relative to reference period |

---

## 6. Methodology Page — "How This Works"

Route: `/methodology`

This page is critical for the OSS developer audience. It answers: "Why should I trust this system?"

### 6.1 Experimental Badge & Confidence Framework

Every page shows a persistent badge. The badge text varies by validation status:

| Status         | Badge          | Meaning                                                  |
| -------------- | -------------- | -------------------------------------------------------- |
| Pre-validation | "Experimental" | System has not been backtested against historical events |
| Post-backtest  | "Calibrating"  | Backtested but actively tuning parameters                |
| Validated      | "Validated"    | Backtested, calibrated, and peer-reviewed                |

Currently: all categories show "Experimental."

Badge includes a tooltip: "This assessment uses automated keyword analysis of government documents. Methodology is open source and under active development. View methodology →"

### 6.2 Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  How Democracy Monitor Works                                │
│                                                             │
│  "This project treats methodology as code. Every            │
│  assumption is versioned, reviewable, and testable."        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SIDEBAR NAV              MAIN CONTENT                      │
│  ┌──────────────┐ ┌──────────────────────────────────┐      │
│  │ Overview     │ │                                  │      │
│  │ Data Sources │ │  (selected section content)      │      │
│  │ Scoring      │ │                                  │      │
│  │ Keywords     │ │                                  │      │
│  │ Suppression  │ │                                  │      │
│  │ Doc Classes  │ │                                  │      │
│  │ Aggregation  │ │                                  │      │
│  │ Baselines    │ │                                  │      │
│  │ AI Reviewer  │ │                                  │      │
│  │ Infra Overlay│ │                                  │      │
│  │ Keyword Hlth │ │   (Detailed mode only)           │      │
│  │ Limitations  │ │                                  │      │
│  │ API / Export │ │                                  │      │
│  └──────────────┘ └──────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Key Sections

**Scoring section**: Show the actual formula with a worked example.

```
Example: A Federal Register final rule matching 2 capture keywords and 1 warning keyword.

captureScore = 4 × log₂(2 + 1) = 4 × 1.585 = 6.34
driftScore   = 0 × 2 = 0
warningScore = 1 × 1 = 1
severityScore = 6.34 + 0 + 1 = 7.34
classMultiplier = 1.3 (final_rule)
finalScore = 7.34 × 1.3 = 9.54
```

**Keywords section**: Interactive explorer. Select a category → see all keywords organized by tier. Expand a keyword → see its suppression rules (if any) and domain tag. Link to the source file on GitHub.

**Limitations section**: Prominently placed, not buried. Covers:

- Context-blindness of keyword matching
- Keyword dictionary bias (written by developer, not domain experts)
- Severity tier subjectivity
- Federal Register data bias (informal actions are invisible)
- Baseline sensitivity
- No inter-rater reliability testing

**Keyword Health section** (Detailed mode only): Shows the keyword health report from V3 Addendum § 13.3. This helps OSS contributors identify where the keyword dictionaries need work.

Content (sourced from `GET /api/methodology/keyword-health`):

- **Noisy keywords**: Keywords that fire frequently but are often suppressed or overridden. Table with columns: keyword, category, tier, times fired, times suppressed, noise ratio, recommendation. Sorted by noise ratio descending. A high noise ratio means this keyword needs better suppression rules or a tier demotion.

- **Dormant keywords**: Keywords that have never fired (or haven't fired in many weeks). Table with columns: keyword, category, tier, weeks since last fired, recommendation. Note displayed: "Dormant keywords aren't necessarily bad — some may be correctly waiting for an event that hasn't happened yet."

- **Tier change recommendations**: System-generated suggestions that a keyword should move up or down a tier, based on accumulated human review decisions and AI disagreements. Table with columns: keyword, category, current tier, recommended tier, evidence. These are informational — actual changes go through the proposal review workflow at `/admin/proposals`.

- **Volume threshold recommendations**: Empirically-derived suggestions for adjusting the volume thresholds (document count triggers) per category, based on observed distributions during the baseline period. Shows current vs. recommended thresholds with the statistical basis (e.g., "Based on 95th percentile of Biden 2024 baseline").

---

## 7. Infrastructure Convergence Page

Route: `/infrastructure`

### 7.1 Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Authoritarian Infrastructure Patterns                      │
│  Cross-cutting analysis across all 11 categories            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CONVERGENCE STATUS                                         │
│  Current level: Active / Emerging / Entrenched / None       │
│  Convergence score: [number]                                │
│  Active themes: 2 of 3                                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  THREE THEME PANELS (side by side on desktop)               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ Detention &  │ │ Surveillance │ │ Criminaliz.  │        │
│  │ Incarceration│ │ Apparatus    │ │ of Opposition│        │
│  │              │ │              │ │              │        │
│  │ Intensity: 12│ │ Intensity: 6 │ │ Intensity: 3 │        │
│  │ 8 keywords   │ │ 4 keywords   │ │ 2 keywords   │        │
│  │ across 4     │ │ across 2     │ │ across 1     │        │
│  │ categories   │ │ categories   │ │ category     │        │
│  │              │ │              │ │              │        │
│  │ [keyword     │ │ [keyword     │ │ [keyword     │        │
│  │  matches...] │ │  matches...] │ │  matches...] │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CONVERGENCE OVER TIME (chart)                              │
│  Shows convergence score weekly, with theme breakdown       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Rhetoric → Action Page

Route: `/rhetoric`

This page answers: "Are officials following through on what they say?"

**Data dependencies:**

- The `intent_weekly` table and rhetoric-fetcher service already exist and can power the Summary-mode table (policy area, top rhetoric keyword, top action keyword, lag in weeks).
- The Detailed-mode "matched pairs" visualization (§8.3) — linking specific rhetoric statements to specific government actions with document references — requires a statement-to-action matching engine that does not yet exist. This is new backend work, not covered by the current V3 Addendum sprints.
- The rhetoric-to-keyword gaps section (§8.4) depends on V3 Addendum Sprint G (Rhetoric Pipeline).
- **Recommendation:** Build Summary mode first with existing data; defer Detailed mode matched-pairs to a later sprint that adds the matching engine.

### 8.1 Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Are Words Becoming Policy?                                 │
│  Tracking when political rhetoric translates into           │
│  government action                                          │
│  [Experimental]                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  (Summary or Detailed content — see below)                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Summary Mode — "Are Words Becoming Policy?"

A simple, scannable table — one row per policy area. No charts, no correlation math. Communicates the finding, not the method.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Policy Area        What's Being Said → What's Being Done   │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Rule of Law        "weaponized DOJ"   → fired investigators│
│                     Rhetoric leads action by ~3 weeks       │
│                                                             │
│  Civil Liberties    "enemy within"     → detained without   │
│                                          charge             │
│                     Rhetoric leads action by ~5 weeks       │
│                                                             │
│  Elections          "rigged election"  → No action pattern  │
│                                          detected yet       │
│                                                             │
│  Media Freedom      "fake news"        → revoked press      │
│                                          credentials        │
│                     Rhetoric leads action by ~2 weeks       │
│                                                             │
│  Institutional      "fire them all"    → fired inspector    │
│  Independence                            general            │
│                     Rhetoric leads action by ~4 weeks       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  How this works: We track two separate sets of keywords —   │
│  one for political rhetoric, one for government actions —   │
│  and measure how long it takes for rhetoric themes to       │
│  appear as policy actions.                                  │
│  [View full methodology →]                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Each row shows:

- Policy area name
- Top rhetoric keyword detected (in quotes, representing "what's being said")
- Top action keyword detected (representing "what's being done")
- Lag in weeks, or "No action pattern detected yet" if correlation is below threshold
- Arrow (→) connecting rhetoric to action for visual flow

Rows with detected patterns are visually emphasized (standard text). Rows with no pattern are muted (slate-400 text).

### 8.3 Detailed Mode — Full Analysis

Adds to the Summary view:

For each policy area:

- **Dual sparklines**: Rhetoric score and action score over time, overlaid on the same chart
- **Lag analysis chart**: Cross-correlation by lag (0–12 weeks), showing the peak
- **Keyword breakdown**: Full list of rhetoric keywords detected this period, full list of action keywords
- **Matched pairs**: Specific rhetoric→action keyword pairs with dates and document links
- **Confidence note**: "Correlation: 0.72 at 3-week lag (moderate confidence)" — the statistical backing for the Summary-mode claim

### 8.4 Rhetoric-to-Keyword Gaps (Detailed Mode)

Below the per-policy-area analysis, a section showing rhetoric phrases that have no corresponding action keywords. This surfaces the output of the rhetoric-to-keyword pipeline (V3 Addendum §13.6) to the public, making methodology gaps transparent.

```
┌─────────────────────────────────────────────────────────────┐
│  Emerging Rhetoric Without Monitoring Keywords               │
│                                                             │
│  These phrases are appearing in political rhetoric but      │
│  our keyword dictionaries don't yet have corresponding      │
│  terms to detect government actions related to them.        │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ "nationalize elections"                                  ││
│  │ Policy area: Elections · Active for 4 weeks              ││
│  │ Frequency: ~6 appearances/week · Trend: emerging ↑      ││
│  │ Gap: No matching action keywords or category keywords    ││
│  │ ⓘ Keyword proposals have been generated and are         ││
│  │   awaiting review.                                      ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ "defund the courts"                                     ││
│  │ Policy area: Rule of Law · Active for 2 weeks           ││
│  │ Frequency: ~3 appearances/week · Trend: emerging ↑      ││
│  │ Gap: No matching action keywords                         ││
│  │ ⓘ Keyword proposals have been generated and are         ││
│  │   awaiting review.                                      ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  This section updates weekly. When proposals are approved   │
│  and keywords are added, the corresponding gap disappears.  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Each gap card shows:

- The rhetoric phrase (in quotes)
- Policy area and how many weeks it's been active
- Weekly frequency and trend direction (emerging ↑, stable →, declining ↓)
- Gap type: which dictionary is missing coverage (action keywords, category keywords, or both)
- Status note: whether proposals have been generated, and whether they're pending, approved, or rejected

**Why this is public**: Showing methodology gaps builds trust with the OSS audience. It says "here's what we know we're missing" — which is more credible than pretending complete coverage. It also serves as an implicit invitation: "see a gap? Contribute."

**Filtering**: Only show gaps where the phrase has been active for ≥2 weeks (per the backend spec's noise filter). Phrases that appear once and vanish are not shown.

---

## 9. Project 2025 Page

Route: `/p2025`

This page answers: "How much of the plan has been implemented?"

**Data dependencies:**

- 14 seed proposals exist in `lib/data/p2025/seed-proposals.ts` with a keyword matcher and LLM judge in `p2025-matcher.ts`.
- However, no persisted implementation-tracking status exists — the "% implemented" headline stat, per-proposal status (Not Started / In Progress / Implemented / Exceeded / Abandoned), and match counts all require a `p2025_tracking` table or equivalent that stores matcher results across weekly runs.
- The "Exceeded" detection requires LLM reasoning about whether government actions go beyond what the proposal called for — this is currently a single-run assessment, not a persisted status.
- **Recommendation:** The P2025 page needs a backend sprint to add persistent tracking before the UI can render meaningful progress data. The seed proposals and matcher exist, but the aggregation and status persistence layer does not.

### 9.1 Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Blueprint vs. Reality                                      │
│  Tracking government actions against Project 2025 proposals │
│  [Experimental]                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  (Summary or Detailed content — see below)                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Summary Mode — "Blueprint vs. Reality"

A single headline stat with a visual breakdown, plus the most recent matches. Immediately comprehensible without any methodological context.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Of [Y] Project 2025 proposals tracked:                     │
│                                                             │
│  ████████████████░░░░░░░░░░░░░░░░░░░░░░░░  34%             │
│                                                             │
│  ■ Implemented (12%)  ■ In Progress (18%)  ■ Exceeded (4%) │
│  □ Not Started (64%)  ▤ Abandoned (2%)                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  By area:                                                   │
│  Executive Power      ████████████░░░░░░░░  52%             │
│  Oversight            ████████░░░░░░░░░░░░  38%             │
│  Rule of Law          ██████░░░░░░░░░░░░░░  28%             │
│  Public Sphere        ████░░░░░░░░░░░░░░░░  18%             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Most recent matches:                                       │
│                                                             │
│  ◆ "Reclassify federal employees for at-will removal"       │
│    Status: Implemented                                      │
│    Matched: Executive Order on Schedule F (Jan 28, 2025)    │
│                                                             │
│  ▲ "Bring independent agencies under White House review"    │
│    Status: In Progress                                      │
│    Matched: OIRA Directive on Regulatory Review (Feb 3)     │
│                                                             │
│  ◆ "Redirect DOJ resources to immigration enforcement"      │
│    Status: Exceeded                                         │
│    Matched: 3 documents (view details →)                    │
│                                                             │
│  [View all proposals →]                                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  How this works: We extracted discrete policy proposals     │
│  from the 920-page Project 2025 document and automatically │
│  match them against new government actions using AI.        │
│  Matches are classified as implementing, exceeding, or      │
│  unrelated to each proposal.                                │
│  [View full methodology →]                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key design choices for Summary mode:**

- The headline stat is a percentage, not a raw count — immediately interpretable
- The horizontal bar uses a muted multi-segment style (not traffic-light colors)
- "Exceeded" proposals are called out distinctly — these represent escalation beyond the declared plan
- Only 3-5 most recent matches shown, with one-sentence summaries
- Each match links to the category detail page where the matched document lives
- The "How this works" footer grounds the automated nature of the analysis

### 9.3 Detailed Mode — Full Proposal Tracker

Adds to the Summary view:

**Escalation alerts section:**

```
┌─────────────────────────────────────────────────────────────┐
│  ◆ Actions Exceeding the Blueprint                          │
│                                                             │
│  These government actions go beyond what Project 2025       │
│  proposed — the administration is doing more than the       │
│  plan called for in these areas.                            │
│                                                             │
│  • [proposal summary] — exceeded because: [LLM reasoning]  │
│    Evidence: [document links]                               │
│  • ...                                                      │
└─────────────────────────────────────────────────────────────┘
```

**Full proposal table** (sortable, filterable):

| Column        | Description                                                    |
| ------------- | -------------------------------------------------------------- |
| Chapter       | P2025 chapter reference                                        |
| Proposal      | One-sentence summary                                           |
| Target Agency | Which agency the proposal targets                              |
| Category      | Dashboard category mapping                                     |
| Severity      | Low / Medium / High / Extreme                                  |
| Status        | Not Started / In Progress / Implemented / Exceeded / Abandoned |
| Matched Docs  | Count of matched government documents                          |
| Confidence    | LLM classification confidence (0-1)                            |
| Reviewed      | Whether a human has confirmed the match                        |

**Filters**: By status, by category, by severity, by human-reviewed status.

**Export**: CSV download of full proposal table with match details.

---

## 9A. Source Health Page — "Can We See?"

Route: `/health`

This page answers: "Are the data sources this system depends on working, and how has their availability changed over time?"

This is a public page — visible to all users, linked from the main navigation and from the source health summary bar on the landing page (§4.8). The V3 addendum establishes that source health is "the most honest thing you can show," so this page is not hidden behind admin authentication.

### 9A.1 Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Can We See?                                                │
│  Monitoring the health of government data sources           │
│  [Experimental]                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  META-ASSESSMENT SUMMARY                                    │
│  Data integrity: [high/moderate/low/critical]               │
│  Source availability: 6/8 (75%)                             │
│  Volume normality: 80% of expected                          │
│  Coverage breadth: 9/11 categories with adequate data       │
│  Transparency trend: stable / declining / rapidly declining │
│  Week-over-week volume change: -12%                         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  HISTORICAL AVAILABILITY CHART                              │
│  Line chart: percentage of sources healthy over time        │
│  (weekly cadence, going back to system start)               │
│  Overlay: total document volume as area fill                │
│  Shows whether availability is trending down                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SOURCE ALERTS (if any)                                     │
│  Cards for each active alert — canary silences, volume      │
│  drops, unavailable sources. Sorted by severity.            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PER-SOURCE DETAIL TABLE                                    │
│  Expandable rows for each data source                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Source              Status    Vol.    Expected  Resp.   ││
│  │─────────────────────────────────────────────────────────││
│  │ ● Federal Register  healthy   42      40        120ms  ││
│  │ ● GAO Reports RSS   healthy    3       2        450ms  ││
│  │ ◐ SCOTUS Opinions   silent     0       1        200ms  ││
│  │ ○ White House       unavail.  —       —        timeout ││
│  │ ...                                                    ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Expandable detail per source:                              │
│  • Category dependency: which categories use this source    │
│  • Canary status: is this a canary source?                  │
│  • Last successful check: date/time                         │
│  • Consecutive failures: count                              │
│  • Volume trend: mini sparkline of doc count over 8 weeks   │
│  • Response time trend: mini sparkline over 8 weeks         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SOURCE TIER EXPLANATION (Detailed mode)                    │
│  Describes Tier 1-4 source priority framework:              │
│  which sources are government-controlled vs. independent    │
│  Why alternative sources matter if primary sources degrade  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  "WHY THIS MATTERS" FOOTER                                  │
│  "This system monitors government documents to assess       │
│  institutional health. If those documents stop being        │
│  published, the system can't see — and that silence may     │
│  itself be the most important signal."                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9A.2 Source Status Icons

Consistent with the source health summary bar (§4.8):

| Status      | Icon     | Color (light) | Color (dark) |
| ----------- | -------- | ------------- | ------------ |
| healthy     | ● filled | green-500     | green-400    |
| degraded    | ◐ half   | amber-500     | amber-400    |
| silent      | ◐ half   | amber-500     | amber-400    |
| unavailable | ○ empty  | slate-400     | slate-500    |

`degraded` and `silent` share the same icon but have different labels and tooltip explanations. Silent is distinguished in the detail expansion with: "This source is responding but returning no new documents. Expected: ~20/week."

### 9A.3 Historical Availability Chart

A line chart showing source health over time. Primary line: percentage of sources in `healthy` status each week. Secondary fill: total document volume (normalized against baseline) as a semi-transparent area below the line.

This chart is the key tool for detecting **gradual degradation** — the V3 addendum's concern that "each week has 5% fewer documents than the last, and no single week triggers an alert." The trend line makes slow decline visible.

**Annotations**: Mark any week where a canary source went silent, or where the meta-assessment level changed.

### 9A.4 Transparency Trend Indicator

A prominent callout showing the direction of data availability:

- **Improving** (↑): More sources responding, volume increasing — no special treatment
- **Stable** (→): No significant change — no special treatment
- **Declining** (↓): Sources degrading or volume dropping — amber highlight
- **Rapidly declining** (↓↓): Multiple sources lost in a short period — indigo highlight, same visual weight as a drift-tier category assessment

The trend is computed from `weekOverWeekVolumeChange` and consecutive weeks of decline in the meta-assessment.

---

## 10. Responsive Design

### 10.1 Breakpoints

| Breakpoint | Width      | Layout                                                                      |
| ---------- | ---------- | --------------------------------------------------------------------------- |
| Desktop    | ≥1024px    | Full experience: 3-column grid, side-by-side panels, all chart controls     |
| Tablet     | 768–1023px | 2-column grid, stacked panels, chart controls in dropdown                   |
| Mobile     | <768px     | 1-column, cards compressed, charts full-width, drill-down as separate views |

### 10.2 Mobile-Specific Behavior

- **Landing page**: Cards stack vertically, sorted by score. Sparklines go full-width below title.
- **Category detail**: Sections stack vertically. Evidence panel columns stack. Document table becomes a card list (one card per document).
- **Charts**: Full-width, with simpler axis labels. Hover interactions replaced by tap-to-reveal.
- **Methodology**: Sidebar nav becomes a dropdown/accordion at top of page.
- **Reading level toggle**: Always visible in header. Defaults to Summary on mobile.

**Feature visibility by breakpoint:**

| Feature                | Desktop (≥1024)        | Tablet (768-1023)      | Mobile (<768)          |
| ---------------------- | ---------------------- | ---------------------- | ---------------------- |
| Category grid columns  | 3                      | 2                      | 1                      |
| Sparkline position     | Inline in card         | Inline in card         | Full-width below title |
| Evidence panel         | 2 columns side-by-side | 2 columns side-by-side | Stacked, collapsed     |
| Chart toggle tabs      | Horizontal tabs        | Dropdown selector      | Dropdown selector      |
| Document table         | Full table             | Full table             | Card list              |
| Baseline selector      | Multi-select pills     | Multi-select pills     | Hidden (desktop only)  |
| Semantic drift section | Visible (Detailed)     | Visible (Detailed)     | Hidden                 |
| Methodology sidebar    | Sidebar                | Sidebar                | Top dropdown           |
| Admin nav              | Horizontal             | Horizontal             | Hamburger              |

### 10.3 Progressive Disclosure on Mobile

Mobile users should get a useful experience at Layer 1-2 without needing to scroll through Layer 3-4 content. Use collapsible sections:

- Assessment summary: always visible
- Trend chart: always visible
- Evidence panel: collapsed by default ("View 23 keyword matches ▸")
- AI reviewer notes: collapsed
- Document table: collapsed ("View 47 documents ▸")
- Semantic drift: hidden (desktop only)

---

## 10A. Human Review Queue — Admin Interface

Route: `/admin/reviews` (not in public navigation — accessed directly by project maintainers)

This page answers: "Where does the AI disagree with the keyword engine, and what should we do about it?"

### 10A.1 Authentication — Shared Secret Token

Admin pages are protected by a shared-secret cookie mechanism. No user database, no OAuth, no sessions — just one secret token set via environment variable.

**Backend specification:**

**Environment variable:**

```
ADMIN_SECRET_TOKEN=<random-64-char-hex-string>
```

Generate with: `openssl rand -hex 32`

**Token-setting route** (`pages/api/admin/auth.ts`):

```
POST /api/admin/auth
Body: { "token": "the-secret-token" }

If token matches ADMIN_SECRET_TOKEN:
  → Set HTTP-only cookie: dm_admin_token=<token>, SameSite=Strict, Secure, Path=/admin, Max-Age=30 days
  → Return 200 { success: true }

If token does not match:
  → Return 401 { error: "Invalid token" }
  → Rate limit: max 5 attempts per IP per hour (prevent brute force)
```

**Middleware** (`middleware.ts` or `lib/middleware/admin-auth.ts`):

```
For all routes matching /admin/* and /api/admin/* (except /api/admin/auth):
  → Check for dm_admin_token cookie
  → If cookie value === ADMIN_SECRET_TOKEN → allow request
  → If cookie missing or invalid → return 401 (API routes) or redirect to /admin/login (page routes)
```

**Logout route** (`pages/api/admin/logout.ts`):

```
POST /api/admin/logout
  → Clear dm_admin_token cookie
  → Return 200
```

**Security notes:**

- The token is never sent to the client in page HTML or JavaScript — it only exists in the cookie and the environment variable
- HTTP-only flag prevents JavaScript from reading the cookie (XSS protection)
- SameSite=Strict prevents CSRF
- Secure flag ensures cookie only sent over HTTPS (in production)
- Rate limiting on the auth endpoint prevents brute force
- Token is rotatable: change the env var, all existing cookies become invalid, reviewers re-authenticate
- **Single-admin limitation:** This mechanism shares one token across all reviewers, so audit trails track the `reviewer` name field (self-reported), not an authenticated identity. This is acceptable for a small maintainer team but is not suitable for multi-organization admin scenarios. See §10A.6 for future multi-reviewer considerations.
- **Existing API gap:** The current `pages/api/reviews.ts` has no auth middleware — it must be updated to require the admin cookie before the review queue ships.

**UI specification:**

**Login page** (`/admin/login`):

```
┌─────────────────────────────────────────────┐
│                                             │
│  Democracy Monitor — Admin Access           │
│                                             │
│  Enter the admin token to access the        │
│  review queue.                              │
│                                             │
│  Token: [________________________________]  │
│                                             │
│  [Authenticate]                             │
│                                             │
│  ⓘ The admin token is set by the project   │
│  maintainer via environment variable.       │
│  Contact the maintainer if you need access. │
│                                             │
└─────────────────────────────────────────────┘
```

- Single input field (type="password" to mask the token)
- Submit calls `POST /api/admin/auth` with the token
- On success: redirect to `/admin/reviews`
- On failure: show inline error "Invalid token" (no details about why)
- After 5 failed attempts: show "Too many attempts. Try again in an hour."
- No "forgot token" flow — this is intentional. Contact the maintainer.

**Authenticated state:**

- All `/admin/*` pages show a small "Authenticated · [Logout]" indicator in the top-right
- Logout clears the cookie and redirects to `/admin/login`

### 10A.2 Context

When the AI reviewer recommends a status downgrade of ≥2 levels, or recommends a downgrade with confidence <0.7, the assessment is flagged for human review via `flagForReview()`. The review queue surfaces these disagreements for project maintainers to resolve.

This is an **admin-only** feature — not visible to public users. It does not appear in the main navigation. Access is via direct URL, protected by the shared-secret token (§10A.1).

### 10A.3 Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Human Review Queue                                         │
│  [X pending reviews]    [Show resolved ▾]                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PENDING REVIEWS (sorted by flagged date, newest first)     │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Following Court Orders — Week of Feb 3, 2025           ││
│  │ Flagged: Feb 8, 2025                                   ││
│  │                                                        ││
│  │ Keyword engine says: Drift                             ││
│  │ AI recommends:       Warning (confidence: 0.65)        ││
│  │ Gap: 1 level, low confidence → flagged                 ││
│  │                                                        ││
│  │ AI reasoning:                                          ││
│  │ "The 'delayed compliance' matches refer to routine     ││
│  │ procedural timeline extensions, not willful defiance.   ││
│  │ The 'emergency stay sought' is standard appellate       ││
│  │ practice..."                                           ││
│  │                                                        ││
│  │ Top keyword matches:                                   ││
│  │ • "delayed compliance" (drift) — 2 documents          ││
│  │ • "emergency stay sought" (drift) — 1 document        ││
│  │ • "injunction issued" (warning) — 3 documents         ││
│  │                                                        ││
│  │ Documents: 47 total, 6 flagged [View week →]           ││
│  │                                                        ││
│  │ ┌─────────────────────────────────────────────────────┐││
│  │ │ YOUR DECISION                                      │││
│  │ │                                                    │││
│  │ │ Final status: [○ Capture] [○ Drift] [● Warning]   │││
│  │ │               [○ Stable]                           │││
│  │ │                                                    │││
│  │ │ Reasoning:                                         │││
│  │ │ [                                              ]   │││
│  │ │ [  Free-text explanation of your decision       ]   │││
│  │ │ [                                              ]   │││
│  │ │                                                    │││
│  │ │ Reviewer: [your name / handle                  ]   │││
│  │ │                                                    │││
│  │ │ [Submit decision]    [Skip for now]                │││
│  │ └─────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  (more pending reviews...)                                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  RESOLVED REVIEWS (collapsed by default)                    │
│  Same layout but read-only, showing the decision made       │
│  Sortable by date, category, reviewer                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 10A.4 Review Decision Fields

When a reviewer submits a decision, the following is stored via `resolveReview()`:

**Core decision fields:**

| Field       | Type        | Description                                                       |
| ----------- | ----------- | ----------------------------------------------------------------- |
| alertId     | number      | The flagged assessment ID                                         |
| finalStatus | StatusLevel | The reviewer's chosen status (Stable / Warning / Drift / Capture) |
| reason      | string      | Free-text explanation of the decision                             |
| reviewer    | string      | Name or handle of the reviewer                                    |
| resolvedAt  | timestamp   | Auto-set on submission                                            |

**Feedback fields** (V3 Addendum — optional, collapsible section labeled "Help improve the system"):

These fields feed the feedback learning loop (V3 Addendum § 13). They're shown below the core decision in a collapsible "Help improve the system" section, collapsed by default. Filling them in is optional but valuable — each one teaches the system to make better assessments.

```
┌─────────────────────────────────────────────────────────────┐
│  ▸ Help improve the system (optional)                       │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  False positive keywords (keywords that fired incorrectly): │
│  [  delayed compliance  ] [×]                               │
│  [  emergency stay sought  ] [×]                            │
│  [+ Add keyword]                                            │
│                                                             │
│  Missing keywords (keywords that should have fired):        │
│  [  _________________________________  ]                    │
│  [+ Add keyword]                                            │
│                                                             │
│  Suppression suggestions (context terms that should         │
│  suppress a keyword in future):                             │
│  [  _________________________________  ]                    │
│  [+ Add suggestion]                                         │
│                                                             │
│  Tier change suggestions:                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Keyword: [delayed compliance    ]                       ││
│  │ Current: drift  →  Suggested: [warning ▾]               ││
│  │ Reason:  [routine procedural language             ]     ││
│  └─────────────────────────────────────────────────────────┘│
│  [+ Add tier change suggestion]                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Add-row pattern**: Each feedback field uses a simple add-row pattern. Click "+ Add keyword" to add another input row. Each row has a remove (×) button. Tier change suggestions use a small inline form with the keyword name, a dropdown for the suggested tier, and a reason text field.

**Pre-population**: The false positive keywords section is pre-populated with the matched keywords from the flagged assessment. The reviewer can remove the ones that were valid and leave the ones that were false positives.

**Important**: The reviewer can choose ANY status level — they are not constrained to the AI's recommendation or the keyword engine's result. The human is the final authority. However, if the reviewer chooses a status HIGHER than the keyword engine result, the UI should show a confirmation: "You are raising the status above what the keyword engine detected. This overrides the normal ceiling constraint. Are you sure?"

### 10A.5 How Resolved Reviews Surface in Public UI

When a review is resolved, the decision affects the public-facing assessment:

- The category detail page shows: "Human reviewer adjusted this assessment from [keyword status] to [final status]: [reason]" in the AI Reviewer Notes section
- The week detail page shows the same annotation
- The resolved review is included in data exports with the reviewer's reasoning

This creates a transparent audit trail: automated assessment → AI review → human review → final decision. Every step is visible.

### 10A.6 Future: Multi-Reviewer Workflow

For the initial launch, a single reviewer resolves each flag. Future enhancements could include:

- Multiple reviewers per flag (requiring consensus)
- Domain-expert assignments (route judicial flags to legal reviewers)
- Reviewer reputation tracking (how often does reviewer X agree with the AI vs. the keyword engine?)

These are not in scope now but the data model (`reviewer` field, separate `resolvedAt` timestamp) supports them.

---

## 10B. Methodology Proposals — Admin Interface

Route: `/admin/proposals` (behind shared-secret token, same as review queue)

This page answers: "What has the system learned from our feedback, and should we accept its suggestions?"

### 10B.1 Context

Multiple subsystems generate proposals that need human review before becoming active methodology changes:

- **Suppression learning** (V3 Addendum §13.2): When human reviewers flag false positives, the system proposes suppression rules that would have prevented them.
- **Novel threat detection** (V3 Addendum §13.5): When documents are semantically unusual but invisible to keywords, the system proposes new keywords to detect similar documents in the future.
- **Rhetoric-to-keyword pipeline** (V3 Addendum §13.6): When rhetoric phrases have no corresponding action keywords, the system proposes keywords to close the gap.
- **Keyword health** (V3 Addendum §13.3): When keywords are consistently noisy or never fire, the system proposes tier changes.
- **Expert submissions** (V3 Addendum §13.7): Trusted domain experts submit keyword proposals through the admin interface (see §10C).

All proposals flow through the same review pipeline and appear on this page. The `proposalSource` field distinguishes where each came from.

This is a separate workflow from the review queue: the review queue is reactive (resolve flagged assessments as they come in), while proposal review is periodic (review a batch of system-generated suggestions weekly or monthly).

### 10B.2 Admin Navigation

All admin pages share a minimal admin nav bar:

```
┌─────────────────────────────────────────────────────────────┐
│  DM Admin  [Reviews (3)] [Proposals (5)] [Submit Keywords]  │
│                                  Authenticated · [Logout]   │
└─────────────────────────────────────────────────────────────┘
```

Count badges show pending items on Reviews and Proposals. "Submit Keywords" links to the expert submission form (§10C). This replaces the standalone "Authenticated · [Logout]" indicator from §10A.1 — the admin nav is shared across all admin pages.

### 10B.3 Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Methodology Proposals                                       │
│  [X pending]  [Show approved ▾]  [Show rejected ▾]          │
│                                                             │
│  Filter by source:                                           │
│  [All] [Suppression] [Novelty] [Rhetoric] [Expert] [Health] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PENDING PROPOSALS (sorted by occurrence count, desc)        │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Proposal #42 — "RICO charge" in courts                  ││
│  │ Type: new_rule · Generated: Mar 15, 2025                ││
│  │ Based on: 3 feedback records                            ││
│  │                                                        ││
│  │ Proposed rule:                                         ││
│  │ When "RICO charge" matches, SUPPRESS if document also  ││
│  │ contains: "drug trafficking", "organized crime",        ││
│  │ "racketeering enterprise"                               ││
│  │                                                        ││
│  │ Rationale:                                             ││
│  │ "RICO charge appeared in 3 documents about routine      ││
│  │ organized crime prosecutions. Reviewers consistently    ││
│  │ identified these as false positives."                   ││
│  │                                                        ││
│  │ Example documents this would have affected:             ││
│  │ ✓ "Federal Grand Jury Returns RICO Indictment in       ││
│  │    Drug Trafficking Case" — would suppress (correct)    ││
│  │ ✓ "RICO Charges Filed Against Cartel Members" —        ││
│  │    would suppress (correct)                             ││
│  │ ✗ "DOJ Files RICO Charges Against Political Donor      ││
│  │    Network" — would NOT suppress (correct: genuine)     ││
│  │                                                        ││
│  │ Test validation:                                        ││
│  │ ✓ Passes all existing true-positive test fixtures       ││
│  │ ✓ Would have prevented 3 known false positives          ││
│  │                                                        ││
│  │ ┌─────────────────────────────────────────────────────┐││
│  │ │ [Approve]  [Reject]                                │││
│  │ │ Notes: [________________________________]          │││
│  │ └─────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  (more pending proposals...)                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 10B.4 Proposal Card Details

Each proposal card shows:

- **Source badge**: A colored label indicating where the proposal came from:
  - `Suppression` (slate) — from false positive feedback
  - `Novelty` (indigo) — from semantic novelty detection
  - `Rhetoric` (amber) — from rhetoric-to-keyword gap analysis
  - `Expert` (green) — from expert keyword submission (links to submission details in §10C)
  - `Health` (slate) — from keyword health recommendations
- **Header**: Proposal ID, the keyword, the category, the proposal type (new rule / extend rule / new negation / add keyword / change tier)
- **Proposed rule or keyword**: In plain language. For suppression proposals: "When [keyword] matches, suppress if document also contains [terms]." For keyword additions: "Add [keyword] to [category] at [tier] tier." Not raw code.
- **Rationale**: Why the system (or expert) thinks this change is needed
- **Example documents**: 2-3 documents showing what the rule/keyword would have affected. Checkmarks (✓) for correct behavior, crosses (✗) for cases where the rule correctly does NOT suppress. For keyword additions: documents the keyword would have matched in the past 4 weeks (backtest results).
- **Test validation**: Whether the proposal passes existing true-positive test fixtures. A failing validation is a hard block — the card shows "⚠ This proposal would suppress N true positive test cases" in red and the Approve button is disabled.
- **Batch context** (expert submissions only): If the proposal is part of a batch (`batchLabel`), show the batch name and how many other proposals are in the same batch. "Part of: Election federalization keywords (3 proposals)" — clicking the batch name filters to show all proposals in that batch.
- **Decision**: Approve or Reject buttons, with an optional notes field

**Novelty detection proposals** have additional context:

```
┌─────────────────────────────────────────────────────────────┐
│  [Novelty] Proposal #87 — "federal election authority"      │
│  in elections · Generated: Mar 22, 2025                     │
│                                                             │
│  This document was flagged as semantically unusual:         │
│  "Executive Order on Federal Election Administration        │
│  Reform" — 3.2× normal variation from baseline,             │
│  but invisible to existing keywords.                        │
│                                                             │
│  AI triage assessment:                                      │
│  "This document describes a novel consolidation of          │
│  election oversight under executive authority. No existing  │
│  keyword covers this pattern."                              │
│                                                             │
│  Suggested keyword: "federal election authority"            │
│  Suggested tier: drift                                      │
│  Backtest: would have matched 0 documents in past 4 weeks  │
│                                                             │
│  ✓ Passes all existing true-positive test fixtures          │
│                                                             │
│  [Approve]  [Reject]                                        │
│  Notes: [________________________________]                  │
└─────────────────────────────────────────────────────────────┘
```

### 10B.5 After Approval

When a proposal is approved:

1. The suppression rule is added to `lib/data/suppression-rules.ts`
2. A regression test case is auto-appended to `__tests__/fixtures/scoring/false-positives.ts`
3. The proposal status changes to `implemented` with the reviewer's name and timestamp
4. The card moves to the "Approved" section

The UI should show a confirmation: "Approving this proposal will add a suppression rule and a regression test. The rule will take effect on the next scoring run."

---

## 10C. Expert Keyword Submission — Admin Interface

Route: `/admin/submissions` (behind shared-secret token)

This page answers: "I'm a domain expert and I've spotted a gap in the keyword dictionaries. How do I suggest a fix?"

### 10C.1 Context

Domain experts (constitutional lawyers, political scientists, journalists covering democratic erosion) are the people most likely to spot keyword deficiencies, but the least likely to submit a GitHub pull request. This form provides a structured way for trusted experts to submit keyword proposals that route through the same proposal review pipeline as automated proposals.

**Admin-only, not public.** Trusted experts receive the admin token from the project maintainer. This avoids the need for public abuse prevention (rate limiting, CAPTCHA, bulk pattern detection). Anyone without the token can suggest keywords via GitHub issues, which maintainers can then formalize through this form.

### 10C.2 Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Submit Keyword Proposals                                    │
│                                                             │
│  Suggest new keywords, tier changes, or suppression rules   │
│  for the monitoring system. Each submission is backtested   │
│  and routed through the proposal review pipeline.           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  YOUR IDENTITY                                              │
│  Name / handle: [________________________________]          │
│  Credentials:   [________________________________]          │
│                 (optional: "election law researcher",        │
│                 "FOIA reporter")                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SUBMISSION TYPE                                            │
│  (○ Add keywords) (○ Change tier) (○ Add suppression rule)  │
│  (○ General suggestion)                                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  KEYWORDS                                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Keyword:  [nationalize elections               ]        ││
│  │ Category: [elections ▾]                                  ││
│  │ Tier:     [drift ▾]                                     ││
│  │ Rationale:[Administration rhetoric about               ]││
│  │           [federalizing election administration...     ] ││
│  └─────────────────────────────────────────────────────────┘│
│  [+ Add another keyword]                                    │
│                                                             │
│  Batch label (optional):                                    │
│  [Election federalization keywords          ]               │
│  Groups related keywords for batch review                   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  REASONING (required, minimum 50 characters)                │
│  [                                                        ] │
│  [  The administration has begun publicly discussing       ] │
│  [  nationalizing federal election administration...       ] │
│  [                                                        ] │
│                                                             │
│  EVIDENCE (optional)                                        │
│  [https://example.com/article                       ] [×]   │
│  [+ Add evidence URL]                                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Submit for review]                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 10C.3 After Submission

On successful submission, the UI shows:

```
┌─────────────────────────────────────────────────────────────┐
│  ✓ Submission received                                      │
│                                                             │
│  3 keyword proposals created (IDs: #156, #157, #158)        │
│                                                             │
│  Backtest results:                                          │
│  • "nationalize elections" — would have matched 3 docs      │
│    in past 4 weeks  [View documents →]                      │
│  • "federal election authority" — 0 matches                 │
│  • "national election commission" — 0 matches               │
│                                                             │
│  These proposals are now in the review queue at             │
│  /admin/proposals, tagged as expert submissions.            │
│                                                             │
│  [Submit another]  [Go to proposals →]                      │
└─────────────────────────────────────────────────────────────┘
```

The backtest results give the expert immediate feedback: "Would this keyword have caught anything?" Zero matches isn't necessarily bad (the keyword may target a future action), but matches confirm the keyword is relevant to the document landscape.

### 10C.4 Submission History

Below the form, a collapsible section shows the authenticated user's previous submissions (based on the name/handle they used):

```
┌─────────────────────────────────────────────────────────────┐
│  ▸ Your previous submissions (4 total)                      │
│  ─────────────────────────────────────────────────────────  │
│  Mar 15 · "Election federalization keywords" (3 keywords)   │
│           Status: 2 approved, 1 under review                │
│  Feb 28 · "FOIA obstruction terms" (2 keywords)             │
│           Status: accepted                                  │
│  ...                                                        │
└─────────────────────────────────────────────────────────────┘
```

Submission status is derived from the linked proposal records: all approved = "accepted", some approved = "partially accepted", all rejected = "rejected", none reviewed yet = "under review".

---

## 11. Charting Library Recommendation

### 11.1 Recommendation: Recharts (keep) or Nivo

Given the existing codebase uses Recharts, the pragmatic recommendation is to **stay with Recharts** for standard line/bar charts and add **custom SVG** for the sparklines and infrastructure intensity bars.

If a migration is desired later, **Nivo** (built on D3) offers better out-of-the-box responsive behavior and theming. But the migration cost doesn't justify it for the initial design implementation.

### 11.2 Chart Specifications

**Sparkline** (landing page cards):

- SVG, 200×40px (responsive width)
- Single line, 2px stroke
- Shaded area fill below line (10% opacity of line color)
- Horizontal baseline reference line (dashed, slate-400)
- Baseline ±1σ band (5% opacity fill)
- No axes, no labels, no grid — pure shape
- Hover: small tooltip with week + value (desktop only)

**Trend chart** (category detail):

- Recharts LineChart, responsive
- Primary line: 2px solid
- Baseline band: ReferenceArea component
- Annotations: ReferenceLine + label
- Tooltip: custom component showing week summary
- Y-axis: auto-scaled with 20% headroom above max
- X-axis: every 4th week labeled (to prevent crowding)

**Severity mix chart** (category detail, toggle):

- Recharts StackedAreaChart
- Three areas: capture (deep indigo), drift (medium indigo), warning (light indigo)
- Proportional (0-100%) or absolute values (toggle)

---

## 12. Data Export for External Analysis

### 12.1 Rationale

Export serves three purposes:

- **Credibility**: "Don't trust our visualizations? Here's the raw data, check our work."
- **Research enablement**: Journalists and academics can do their own analysis, compare against V-Dem or Bright Line Watch, and cite specific data points.
- **OSS transparency**: Developers can reproduce scoring independently.

### 12.2 What Is Downloadable

| Data                | Format    | Where in UI                                      | What It Contains                                                                                                            |
| ------------------- | --------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Weekly aggregates   | CSV, JSON | "Download" button on trend charts                | Category, week, total severity, document count, severity mix, match counts by tier, top keywords                            |
| Per-document scores | CSV       | "Export CSV" button on document tables           | Document title, URL, date, category, class, multiplier, final score, match counts, matched keywords, suppressed keywords    |
| Methodology config  | JSON      | "Download methodology" link on /methodology page | Full keyword dictionaries, severity weights, suppression rules, class multipliers, convergence thresholds, baseline configs |

### 12.3 What Is NOT Downloadable

- **Raw document content** — available from the Federal Register directly; we don't redistribute
- **Embeddings** — proprietary model output, large, not useful without context
- **AI assessment raw responses** — cost money to generate, contain model-specific artifacts
- **Full database dumps** — no bulk export of the entire DB

### 12.4 Export Caveats

Every export file includes a preamble header:

```
# Democracy Monitor — Data Export
# Generated: 2026-02-09
# Methodology version: 1.0.0-experimental
# IMPORTANT: This data is produced by automated keyword analysis
# of government documents. It has NOT been validated by domain
# experts. See https://democracymonitor.org/methodology for
# full methodology and limitations.
# License: [TBD — consider CC BY 4.0 for data, AGPL for code]
```

**Action required:** Resolve the license decision before implementing the export feature. The preamble template should use a placeholder that is easy to update globally (a named constant in `lib/data/export-config.ts`, not a hardcoded string in each export function).

### 12.5 UI Integration

Export is contextual, not a dedicated page:

- **Document table** (category detail, week detail): "Export CSV →" button above the table, exports the current filtered view
- **Trend chart** (category detail): "Download data →" link below the chart, exports weekly aggregates for this category
- **Methodology page**: "Download full methodology as JSON →" link in the sidebar
- Each export button uses a subtle secondary style (not a primary action) to avoid clutter

### 12.6 Rate Limiting

1 request/second per IP on export endpoints. No authentication required (public data).

---

## 13. Baseline Comparison (Multi-Overlay, Not Composite)

### 13.1 Design Decision: Overlay, Not Merge

Users can compare against multiple baselines simultaneously, but baselines are **never merged into a composite**. Each selected baseline renders as its own reference band on charts.

**Why not composite:** A merged baseline of Biden 2024 + Obama 2013 doesn't represent any actual period of governance. It's a statistical artifact that obscures rather than illuminates. Separate overlays let users see "this week is 3.9× Biden 2024 but only 2.1× Obama 2013" — which is far more informative.

### 13.2 UI Implementation

On the trend chart (category detail page, Detailed mode only):

```
Baseline: [✓ Biden 2024] [✓ Obama 2013] [  Biden 2021]
```

- Multi-select pills (not checkboxes — pills are more compact and visually distinct)
- Each selected baseline adds its own reference band to the chart in a different shade
- Maximum 2 baselines displayed simultaneously (3 bands = visual clutter). This is a UI constraint enforced client-side — the chart component should accept an arbitrary number of baseline bands (future-proof), with the selection UI limiting to 2.
- Default: Biden 2024 only (the primary reference)
- Each band is labeled on the chart: "Biden 2024 avg ± 1σ" in small text
- The "×baseline" number on category cards always uses the default baseline (Biden 2024)

### 13.3 Baseline Band Colors

| Baseline             | Light Mode Band                              | Dark Mode Band                   |
| -------------------- | -------------------------------------------- | -------------------------------- |
| Biden 2024 (default) | `#F1F5F9` fill, `#E2E8F0` border             | `#1E293B` fill, `#334155` border |
| Obama 2013           | `#FEF3C7` fill (amber-100), `#FDE68A` border | `#422006` fill, `#92400E` border |
| Biden 2021           | `#DCFCE7` fill (green-100), `#BBF7D0` border | `#052E16` fill, `#166534` border |

Colors are muted and desaturated so they don't compete with the primary data line.

---

## 14. Embeddable Widget Architecture

### 14.1 Embed-Ready Components (Build Now, Embed Later)

Three components are designed as embed-ready from the start:

| Component                           | Embed Use Case                                                                            | Self-Contained?                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **CategoryCard**                    | Journalist embeds "Following Court Orders" card in an article about judicial independence | Yes — sparkline, score, status, summary, link back to site  |
| **InfrastructureConvergenceBanner** | Researcher embeds the cross-cutting convergence status in a paper about authoritarianism  | Yes — three theme bars, convergence level, summary sentence |
| **P2025Scoreboard**                 | News organization embeds the implementation percentage in P2025 coverage                  | Yes — progress visualization, category breakdown, link back |

### 14.2 Components NOT Designed for Embedding

| Component              | Why Not                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Full category grid** | Too large (11 cards). Dominates any host page. If someone wants the full picture, link to the site.                |
| **Rhetoric → Action**  | Too complex for a self-contained embed. Defer until the feature matures and we know which visualization resonates. |
| **Trend charts**       | Require too much context (axis labels, baseline bands, interactivity) to work well at embed sizes.                 |

### 14.3 Component Design Pattern

All embed-candidate components follow the same pattern:

```tsx
interface CategoryCardProps {
  // All data passed in — no internal fetching
  category: string;
  title: string;
  status: StatusLevel;
  decayWeightedScore: number;
  baselineAvg: number;
  baselineStdDev: number;
  sparklineData: Array<{ week: string; score: number }>;
  documentCount: number;
  flaggedCount: number;
  summary: string;

  // Display configuration
  readingLevel: 'summary' | 'detailed';
  colorScheme: 'light' | 'dark';
  showExperimentalBadge?: boolean;  // default true
  linkToSite?: string;              // full URL for "View details →" link
}

export function CategoryCard(props: CategoryCardProps) { ... }
```

**Key constraints:**

- Data comes via props, never fetched internally
- No global state dependencies (no context providers required)
- Self-contained CSS (no reliance on parent page styles)
- Always includes the "Experimental" badge and a link back to the full site
- Renders correctly in both light and dark mode via `colorScheme` prop

### 14.4 Future Embed Delivery (Not In Scope Now)

When ready to ship embeds:

- **iframe embed**: `/embed/category/courts?theme=dark&level=summary` — self-contained page rendering just the card
- **JS bundle embed**: `<script src="democracymonitor.org/embed.js"></script><div data-dm-widget="category" data-category="courts"></div>`
- No authentication required (public data)
- Embed includes a small "Powered by Democracy Monitor" footer with link

The component architecture makes this straightforward — the embed page/script just instantiates the same component with server-fetched props.

---

## 15. Implementation Priorities

Sequenced for a public launch within one month. Summary mode (general public) is the primary deliverable; Detailed mode layered on top.

**Seed data prerequisite:** All UI phases depend on having realistic data to render. Before any UI phase begins, the seed data pipeline must produce version-controlled JSON fixtures containing baseline statistics, Trump T2 weekly aggregates, document scores, and keyword-tuned assessments with AI Skeptic review. The pipeline is:

1. **Generate baseline** — Run `backfill-baseline` for Biden 2024 (FR + WH + GDELT), compute baseline statistics, export fixtures
2. **Generate T2 backfill** — Run `backfill` with AI Skeptic enabled from 2025-01-20 to present (FR + WH + GDELT), export fixtures
3. **AI-assisted human review** — Generate targeted review report from AI Skeptic disagreements (false positives, ambiguous keywords, low-confidence assessments). Human reviews flagged items, approves or overrides AI suggestions.
4. **Keyword tuning** — Apply approved changes to keyword dictionaries and suppression rules. Re-score, re-export fixtures. Create regression test fixtures from review decisions.
5. **Commit seed data** — Final fixtures committed to `lib/seed/fixtures/`. New deployments run `pnpm seed:import` — no API keys required.

See V3 Addendum Risk Reminders #12-14 for details on the backfill and seed data pipeline.

**Backend sprint dependencies (V3 Addendum):** Several UI phases require backend sprints to complete first. These must be coordinated in the unified sprint sequence:

| UI Phase                                         | Backend Dependency                                                             | V3 Addendum Sprint |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------ |
| Phase 1 (Landing page sparklines)                | Decay-weighted scores persisted in weekly_aggregates                           | Seed data pipeline |
| Phase 1 (Data integrity banner)                  | Meta-assessment API                                                            | Sprint C           |
| Phase 1 (Source health summary bar)              | Source health tracker                                                          | Sprint A-B         |
| Phase 2 (Category detail charts)                 | Weekly aggregates + baseline statistics                                        | Seed data pipeline |
| Phase 2 (Semantic drift)                         | Baseline embedding centroids                                                   | Sprint F           |
| Phase 3 (Keyword health on methodology page)     | Keyword health analysis                                                        | Sprint E           |
| Phase 3 (Rhetoric → Action, Detailed mode)       | Statement-to-action matching engine                                            | Not yet scheduled  |
| Phase 3 (Rhetoric-to-keyword gaps)               | Rhetoric pipeline                                                              | Sprint G           |
| Phase 3 (P2025 progress tracking)                | P2025 tracking persistence                                                     | Not yet scheduled  |
| Phase 4 (Feedback fields in review queue)        | Feedback store                                                                 | Sprint D           |
| Phase 4 (Methodology proposals from all sources) | Suppression learning, novelty detection, rhetoric pipeline, expert submissions | Sprints E-H        |
| Phase 4 (Admin auth)                             | No backend dependency (new code)                                               | —                  |

### Phase 1: Core Landing Page (public-ready)

1. Implement CSS custom properties color system with light/dark mode support
2. Build CategoryCard component (props-driven, embed-ready per §14)
3. Build sparkline component (SVG, with baseline band)
4. Build landing page layout: positioning statement, infrastructure banner, category grid
5. Implement card sorting by score with category group toggle (§4.6)
6. Add reading level toggle (Summary/Detailed) with localStorage persistence
7. Add dark/light mode toggle with system preference detection
8. Add experimental badges
9. Write Summary-mode content (plain language summaries, no jargon)
10. Build data integrity banner (§4.7) — global component, appears on every page
11. Build source health summary bar (§4.8) — landing page
12. Build confidence degradation indicator on category cards (§4.9)
13. Build first-time visitor onboarding overlay (§4.5)

### Phase 2: Category Detail + Week Detail Pages

14. Build trend chart with baseline band (click-to-drill-down to week view)
15. Build week detail page (`/category/[key]/week/[date]`)
16. Build evidence panel (matched keywords + suppressed keywords)
17. Build AI reviewer notes display (with ceiling constraint label per §5.4)
18. Build sortable/filterable document table with contextual CSV export (§12)
19. Add chart toggle tabs (Detailed mode: decay-weighted, running avg, running sum, high-water, severity mix)
20. Add baseline overlay selector with multi-select pills (Detailed mode, §13)
21. Add semantic drift visualization (Detailed mode)
22. Build confidence degradation notice bar for category detail header (§4.9)

### Phase 3: Methodology & Supporting Pages

23. Build methodology page with sidebar nav and interactive keyword explorer
24. Add keyword health section to methodology page (Detailed mode, §6.3)
25. Add methodology JSON export (§12)
26. Build infrastructure convergence page (embed-ready component per §14)
27. Build rhetoric → action page (Summary + Detailed modes per §8.2, §8.3)
28. Add rhetoric-to-keyword gaps section (Detailed mode, §8.4)
29. Build P2025 comparison page (embed-ready scoreboard component per §14, Summary + Detailed per §9.2, §9.3)
30. Build source health page at `/health` (§9A)

### Phase 4: Admin Interface

31. Build admin authentication flow — login page, middleware, cookie management (§10A.1)
32. Build human review queue at `/admin/reviews` (§10A.3)
33. Build extended review decision form with feedback fields (§10A.4)
34. Build methodology proposals page at `/admin/proposals` with source filtering and multi-source card types (§10B)
35. Build expert keyword submission form at `/admin/submissions` (§10C)
36. Build admin navigation bar with pending count badges (§10B.2)

### Phase 5: Responsive Polish

35. Mobile layout testing and refinement
36. Progressive disclosure implementation for mobile
37. Performance optimization (lazy loading for charts, virtual scrolling for tables)
38. Data integrity banner condensed mode for non-landing pages (§4.7)

---

## 16. Open Design Questions

1. ~~**Should "Stable" categories be collapsible on the landing page?**~~ **Decision: No.** All 11 cards visible in the grid. Stable cards get quieter visual treatment but remain visible.

2. ~~**Dark mode?**~~ **Decision: Yes.** Build it from the start. CSS custom properties for all colors, system preference detection with manual override. See §3.2 for dark mode color definitions.

3. ~~**Historical comparison selector?**~~ **Decision: Yes** (in Detailed mode). Baseline switching only affects the reference band on charts and the "×baseline" comparison numbers — it does NOT affect per-document scores, which are computed identically regardless of baseline. This is safe to offer as an analyst feature.

4. ~~**Notification/alert system?**~~ **Decision: Not now.** Out of scope for initial launch.

5. ~~**Embeddable widgets?**~~ **Decision: Design for it, don't build it yet.** Component architecture requires self-contained, props-driven components (see §14). This makes future embeds straightforward without any refactoring.

### Remaining Open Questions

6. ~~**"What is this?" onboarding for first-time visitors.**~~ **Decision: Yes.** Dismissible explainer for first-time visitors. See §4.5.

7. ~~**Category ordering on landing page.**~~ **Decision: User toggle.** Two modes: "By concern level" (sorted by decay-weighted score) and "By category" (fixed institutional groupings). See §4.6.

8. ~~**How much of the Rhetoric → Action and P2025 sections should be visible in Summary mode?**~~ **Decision: Yes, simplified views.** Both features have Summary-mode presentations that communicate findings without requiring methodological understanding. See §8.2 and §9.2.
