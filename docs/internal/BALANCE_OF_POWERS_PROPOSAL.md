# Feature Proposal: Balance of Powers

**Status**: Reviewed — incorporating Claude Code feedback (2026-03-08)
**Date**: 2026-03-08
**Context**: Democracy Monitor currently monitors 14 threat vector categories, detecting erosion signals through structural anomaly analysis, AI document assessment, and thematic drift. This produces a pathology-only view: the system identifies what's going wrong but never surfaces what's working. When a court blocks an executive order, the system sees the executive order (threat signal) but doesn't surface the judicial response as a democratic function operating. This proposal adds the "institutional response" dimension.

---

## 1. Problem Statement

Democracy is not a set of isolated threat vectors — it's a system of tensions between branches of government that are designed to check each other. The current system answers "is the executive branch doing something concerning?" but cannot answer "did the other branches respond?" or "how quickly?" or "is the rate of institutional response declining over time?"

A court injunction filed 48 hours after a controversial executive order is a functioning democracy. The same executive order with no judicial response for 6 months is a different situation entirely. Both produce the same threat score in the current system.

The six directional relationships between branches are:

| Direction               | Example actions                                                              |
| ----------------------- | ---------------------------------------------------------------------------- |
| Executive → Legislative | EOs bypassing Congress, impoundment, signing statements, recess appointments |
| Legislative → Executive | Oversight hearings, subpoenas, funding restrictions, confirmation holds      |
| Executive → Judicial    | Court order compliance/defiance, judicial appointment strategy               |
| Judicial → Executive    | Injunctions blocking executive action, constitutional rulings                |
| Legislative → Judicial  | Confirmation hearings, court-packing proposals, jurisdiction stripping       |
| Judicial → Legislative  | Striking down legislation, constitutional interpretation                     |

Each relationship has a measurable "constraint rate" — how often and how quickly does the checking branch respond to the checked branch's actions? Tracking constraint rates against historical baselines reveals whether checks and balances are strengthening, weakening, or holding steady.

---

## 2. Design Principles

**Model constraint activity, not "power."** Power is metaphysical and invites arguments. Constraint activity is observable in public documents: injunctions filed, oversight reports published, rules withdrawn after adverse rulings. The system measures artifacts, not abstractions.

**Never label outcomes "good" or "bad."** The system shows: "The judicial constraint rate on executive action was 23% in Biden 2022 and is currently 11% in Trump T2. Coverage: 78% of constraints linked to specific actions." The user decides what that means.

**Show coverage and confidence explicitly.** Some directional relationships have strong documentary evidence (Judicial → Executive: injunctions cite specific EOs). Others are sparse (Executive → Judicial: compliance is often invisible). The UI must show which edges have high-confidence data and which don't, rather than forcing symmetry.

**Build incrementally: data first, visualization later.** Phase A generates classified data and surfaces it in existing pages. Phase B builds the standalone visualization after empirical data reveals which edges have adequate signal.

---

## 3. Data Model Changes

### 3.1 Branch attribution (derived, not classified)

Every document already has an implicit branch of origin through its source type. Add a lookup:

```typescript
// lib/data/branch-map.ts
const SOURCE_TO_BRANCH: Record<string, Branch> = {
  federal_register: 'EXEC',
  govinfo_cpd: 'EXEC',
  doj: 'EXEC',
  oig_doj: 'EXEC',
  oig_hhs: 'EXEC',
  oig_ssa: 'EXEC',
  courtlistener: 'JUD',
  legiscan: 'LEG',
  fec: 'INDEP', // quasi-independent
  govinfo_gao: 'LEG', // legislative branch agency
  rss_fcc: 'INDEP',
};

type Branch = 'EXEC' | 'LEG' | 'JUD' | 'INDEP';
```

This is a lookup table, not a classifier. No AI involved. Add `branch_origin` as a derived column on documents (or compute at query time).

### 3.2 Check direction classification (P2.5 pass)

Add fields to the AI assessment output, populated by the separate P2.5 check classification pass described in §4:

```typescript
interface CheckClassification {
  check_direction:
    | 'EXEC_TO_LEG'
    | 'LEG_TO_EXEC'
    | 'EXEC_TO_JUD'
    | 'JUD_TO_EXEC'
    | 'LEG_TO_JUD'
    | 'JUD_TO_LEG'
    | null;

  check_type:
    | 'INJUNCTION_OR_STAY'
    | 'MERITS_RULING'
    | 'OVERSIGHT_OR_INVESTIGATION'
    | 'APPROPRIATIONS_OR_BUDGET_CONSTRAINT'
    | 'CONFIRMATION_OR_APPOINTMENT_CONSTRAINT'
    | 'JURISDICTION_OR_STRUCTURE_CHANGE'
    | 'NONCOMPLIANCE_OR_RESISTANCE'
    | 'REVERSAL_OR_WITHDRAWAL'
    | 'OTHER'
    | null;

  checked_action_refs: CheckedActionRef[];
}
```

**Important**: `branch_origin` is derived from source type, never asked of the model. The L2 question asks only: "Does this document represent one branch of government checking or constraining another? If so, what direction, what type, and what specific actions are being checked?"

### 3.3 Checked action references

Each reference the model extracts from the document text:

```typescript
interface CheckedActionRef {
  ref_type:
    | 'EO'
    | 'PROCLAMATION'
    | 'PRES_MEMO'
    | 'PRES_NOTICE'
    | 'FR_DOC'
    | 'FR_RULE'
    | 'FR_NOTICE'
    | 'USC'
    | 'CFR'
    | 'BILL'
    | 'PUBLIC_LAW'
    | 'NOMINATION'
    | 'SENATE_ACTION'
    | 'COURT_CASE'
    | 'DOCKET'
    | 'GAO_REPORT'
    | 'IG_REPORT'
    | 'AGENCY_POLICY'
    | 'OTHER';

  identifier?: string; // "E.O. 14123", "87 FR 12345", "24-cv-01234"
  identifier_normalized?: string; // "EO-14123", "FR-87-12345", "DOCKET-24-CV-01234"
  title?: string; // if present in document
  issuing_body?: string; // "White House", "DHS", "D.D.C."
  date_mentioned?: string; // ISO date if extractable
  citation_text?: string; // short excerpt with the mention (≤200 chars)
  confidence: number; // 0..1

  match_hint?: {
    category_hint?: string; // monitoring category if inferable
    branch_hint?: Branch;
    source_hint?: string; // e.g., "federal_register", "courtlistener"
    url_hint?: string; // if doc includes a URL to the target
  };
}
```

### 3.4 Database schema additions

```sql
-- Check classification fields on ai_document_assessments
-- (Decision: extend existing table rather than creating separate table.
-- Data is produced by the same assessment pipeline, versioned by the same model,
-- and logically part of the same document analysis.)
ALTER TABLE ai_document_assessments
  ADD COLUMN check_direction TEXT,           -- enum as string
  ADD COLUMN check_type TEXT,                -- enum as string
  ADD COLUMN checked_action_refs JSONB,      -- array of CheckedActionRef
  ADD COLUMN linkability TEXT;               -- 'EXPLICIT_ID' | 'TITLE_ONLY' | 'VAGUE'

-- Document identifier lookup table for matching
-- (Populated at ingest time by running extraction patterns against titles/metadata.
-- Enables fast exact-match lookups from checked_action_refs to documents.)
CREATE TABLE document_identifiers (
  id SERIAL PRIMARY KEY,
  document_url TEXT NOT NULL,
  identifier_type TEXT NOT NULL,             -- 'EO', 'FR_DOC', 'DOCKET', etc.
  identifier_normalized TEXT NOT NULL,
  UNIQUE(document_url, identifier_type, identifier_normalized)
);
CREATE INDEX idx_doc_ids_normalized ON document_identifiers(identifier_normalized);

-- Resolved links (populated by matching pipeline)
CREATE TABLE check_links (
  id SERIAL PRIMARY KEY,
  response_document_url TEXT NOT NULL,       -- the document doing the checking
  checked_document_url TEXT,                 -- the document being checked (nullable if unresolved)
  check_direction TEXT NOT NULL,
  check_type TEXT,
  ref_type TEXT NOT NULL,
  identifier_normalized TEXT,
  match_method TEXT NOT NULL,                -- 'EXACT_ID' | 'RAW_ID' | 'TITLE_DATE' | 'EMBEDDING'
  match_confidence NUMERIC,
  latency_days INTEGER,                      -- response.published_at - checked.published_at
                                             -- Note: INTEGER loses sub-day precision. Same-day TROs
                                             -- show as 0. Accepted limitation — the meaningful
                                             -- distinctions are same-day vs. next-week vs. next-month,
                                             -- not 4-hours vs. 8-hours.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_check_links_direction ON check_links(check_direction);
CREATE INDEX idx_check_links_checked ON check_links(checked_document_url);

-- Check balance weekly aggregates (separate from weekly_aggregates to avoid
-- bloating the threat detection pipeline — different analytical dimension,
-- different consumers, independent computation cadence)
CREATE TABLE check_balance_weekly (
  id SERIAL PRIMARY KEY,
  week_of DATE NOT NULL,
  edge TEXT NOT NULL,                        -- 'JUD_TO_EXEC', 'LEG_TO_EXEC', etc.
  category TEXT,                             -- nullable; null = all categories
  check_count INTEGER NOT NULL DEFAULT 0,
  denominator_count INTEGER NOT NULL DEFAULT 0,
  constraint_rate NUMERIC,
  median_latency_days INTEGER,
  latency_coverage NUMERIC,                  -- fraction of checks with resolved links
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(week_of, edge, category)
);
CREATE INDEX idx_cbw_edge ON check_balance_weekly(edge);
```

---

## 4. P2.5 Check Classification Pass

The check classification runs as a **separate P2.5 pass**, not as an extension of the existing P2 erosion assessment prompt. Rationale (from Claude Code review):

- The erosion assessment and check classification are different analytical frames. Combining them in one call risks the model blending them (e.g., classifying a routine GAO report as "not_concerning" erosion-wise but important as an oversight check — the model may under-weight the check because the erosion framing dominates).
- A separate pass allows independent backfill without re-running erosion assessments.
- Cost is marginal: P2.5 only runs on documents that P2 already processed (the flagged + audit set), plus documents from check-heavy source types (see §7, step 3).
- Uses the same model as P2 (or cheaper — gpt-4o-mini may suffice since this is classification, not deep reasoning).

**P2.5 prompt:**

```
INTER-BRANCH CHECK ANALYSIS

Does this document represent one branch of government checking, constraining,
or responding to another branch's action? Consider:

- Court injunctions, TROs, or rulings that block or limit executive or
  legislative action
- Congressional oversight reports, GAO investigations, or appropriations
  restrictions targeting executive agencies
- Executive signing statements, vetoes, or impoundment actions that
  constrain legislative intent
- Rule withdrawals or amendments made in response to adverse court rulings
- Legislative proposals that restructure or constrain judicial authority

If this document IS an inter-branch check:
1. check_direction: Which branch is acting (checking) and which is being
   checked? Use: EXEC_TO_LEG, LEG_TO_EXEC, EXEC_TO_JUD, JUD_TO_EXEC,
   LEG_TO_JUD, JUD_TO_LEG
2. check_type: What kind of check? Use: INJUNCTION_OR_STAY, MERITS_RULING,
   OVERSIGHT_OR_INVESTIGATION, APPROPRIATIONS_OR_BUDGET_CONSTRAINT,
   CONFIRMATION_OR_APPOINTMENT_CONSTRAINT, JURISDICTION_OR_STRUCTURE_CHANGE,
   NONCOMPLIANCE_OR_RESISTANCE, REVERSAL_OR_WITHDRAWAL, OTHER
3. checked_action_refs: What specific government action(s) is being checked?
   Extract identifiers (EO numbers, FR citations, docket numbers, bill
   numbers, case names) with the exact text where they appear. Include
   confidence (0-1) for each reference.
4. linkability: EXPLICIT_ID (has a specific EO/FR/docket number),
   TITLE_ONLY (references by title/description without identifier),
   VAGUE (general reference to policies without specifics)

If this document is NOT an inter-branch check, set check_direction to null.
Only classify as an inter-branch check when the document explicitly involves
one branch acting to constrain, block, investigate, or respond to another
branch.
```

---

## 5. Identifier Extraction & Normalization

The matching pipeline uses a tiered approach: exact normalized ID match first, raw identifier match second, title+date match third.

### 5.1 Extraction patterns (high recall)

**Executive Orders:**

```
\b(E\.?\s*O\.?|Executive Order)\s*(No\.?\s*)?(\d{4,6})\b
```

Normalize to: `EO-<number>`

**Federal Register citations:**

```
Volume + Page: \b(\d{2,3})\s+FR\s+(\d{4,6})\b
FR Doc number: \bFR\s*Doc\.?\s*No\.?\s*(\d{4}-\d{4,6})\b
Docket: \b(Docket|Docket No\.?)\s*([A-Z0-9-]{4,})\b
RIN: \bRIN\s*(\d{4}-[A-Z]{2}\d{2})\b
```

Normalize to: `FR-<vol>-<page>`, `FRDOC-<yyyy-nnnnnn>`, `RIN-<number>`

**Bills and public laws:**

```
\b(H\.?\s*R\.?)\s*(\d{1,5})\b
\b(S\.)\s*(\d{1,5})\b
\bPub\.?\s*L\.?\s*(\d{2,3})-(\d{1,4})\b
```

Normalize to: `HR-<congress>-<number>`, `S-<congress>-<number>`, `PL-<congress>-<law>`
Congress number inferred from document date if not explicit.

Note: The Senate bill pattern requires `S.` (with period) followed by a digit to avoid false positives from "S. Smith", "S 500" in other contexts. The `H.R.` pattern is less ambiguous. Congress number inference should map document publication year to the relevant Congress session (e.g., 2025-2026 → 119th Congress).

**Court dockets:**

```
Federal civil: \b(\d{1,2}):(\d{2})-cv-(\d{3,6})\b
Criminal: \b\d{2}-cr-\d{3,6}\b
SCOTUS: \bNo\.\s*\d{2}-\d{1,5}\b
```

Normalize to: `DOCKET-<cleaned>`, `SCOTUS-<term>-<num>`

**GAO reports:**

```
\bGAO-\d{2}-\d{3,6}\b
```

Normalize to: `GAO-<number>`

**Statutes:**

```
USC: \b(\d+)\s+U\.?\s*S\.?\s*C\.?\s*§+\s*([\w.-]+)\b
CFR: \b(\d+)\s+C\.?\s*F\.?\s*R\.?\s*§+\s*([\w.-]+)\b
```

Normalize to: `USC-<title>-<section>`, `CFR-<title>-<section>`

### 5.2 Matching pipeline

Runs after L2 classification, resolves `checked_action_refs` against the document database:

1. **Exact normalized ID match** — `identifier_normalized` against known document identifiers in the database. Highest confidence.
2. **Raw identifier match** — `identifier` string against document titles and metadata. Medium confidence.
3. **Title + date match** — trigram or token overlap within a temporal window (±90 days). Lower confidence.
4. **Embedding similarity** (Tier 2, future) — cosine similarity between the response document and candidate checked documents within the temporal window. Lowest confidence, highest recall.

Latency is computed only for matches via methods 1-2 (or method 3 with high confidence and tight window). The `check_links` table stores the match method so downstream analysis can filter by confidence tier.

### 5.3 Normalization utility

```typescript
// lib/utils/identifier-normalizer.ts
function normalizeIdentifier(ref: CheckedActionRef): string | null {
  switch (ref.ref_type) {
    case 'EO':
      const eoMatch = ref.identifier?.match(/(\d{4,6})/);
      return eoMatch ? `EO-${eoMatch[1]}` : null;
    case 'FR_RULE':
    case 'FR_DOC':
      // Handle vol+page or FR Doc number
      ...
    case 'BILL':
      // Infer congress from date if needed
      ...
    case 'COURT_CASE':
    case 'DOCKET':
      // Clean and uppercase
      ...
    // etc.
  }
}
```

---

## 6. Metrics

### 6.1 Constraint rate (primary metric)

Per directional relationship, per category (optional), per time window:

```
constraint_rate = count(check documents in direction A→B)
                  / count(relevant action documents from branch B)
```

Smoothed over a rolling 4-week window to avoid over-interpreting sparse week-to-week variation.

**Denominator definitions per edge** (the denominator definition significantly affects the rate and its interpretability — each edge needs a concrete, documented definition):

| Edge                    | Denominator                                                                       | Rationale                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Judicial → Executive    | All documents from executive source types (FR, CPD, DOJ) in the relevant category | Stable across L2 calibration changes. The rate will be lower than using L2-flagged documents, but won't shift when P1/P2 thresholds change. |
| Legislative → Executive | Same — all executive source type documents in category                            | Consistent denominator across all "checking the executive" edges                                                                            |
| Judicial → Legislative  | Bills signed into law (from LegiScan) in relevant categories                      | Rare denominator, rare numerator — this edge will be sparse                                                                                 |
| Executive → Legislative | All legislative actions in a category (LegiScan bills + resolutions)              | Use all legislative output                                                                                                                  |
| Executive → Judicial    | All judicial actions in a category (CourtListener filings and opinions)           | Use all judicial output                                                                                                                     |
| Legislative → Judicial  | All judicial actions in a category                                                | Confirmation-related constraints are rare without Senate data                                                                               |

**Denominator stability note**: Earlier drafts used L2-flagged executive documents as the denominator for Judicial → Executive and Legislative → Executive. This creates a circular dependency — if P1 calibration changes (e.g., civilLiberties flag rate shifting from 73% to 3.1%), the denominator shifts dramatically even if executive behavior is unchanged. Using raw source-type volume avoids this. The constraint rate is lower but stable across calibration changes and directly interpretable: "of all executive actions in this category, X% drew a judicial response."

### 6.2 Response latency (secondary metric, where linked)

For resolved check_links with high-confidence matches (match methods EXACT_ID or RAW_ID only):

```
latency_days = response_document.published_at - checked_document.published_at
```

Report as median latency per edge per time window. Always show "latency coverage: X% of constraints linked" — never present co-occurrence-inferred latency as real latency.

Latency will have narrow applicability for most edges — many checks reference actions not in the database (oral directives, informal guidance). Treat latency as a secondary enrichment metric, not a primary one. Where it exists, it's high-value (e.g., time from EO to TRO). Where it doesn't, constraint rate alone is sufficient.

### 6.3 Constraint asymmetry

Per branch pair, per time window:

```
constraint_asymmetry(A, B) = constraint_rate(A→B) / constraint_rate(B→A)
```

A balanced ratio (near 1.0) suggests healthy tension. A highly asymmetric ratio (one branch checking the other far more than the reverse) is a summary signal worth surfacing. This falls out naturally from the constraint rate computation at no additional cost.

Example: "Executive → Judicial constraint rate: 2%. Judicial → Executive constraint rate: 18%. Asymmetry ratio: 0.11 (judicial branch checking executive 9x more than reverse)."

### 6.4 Baseline comparison

Compute constraint rate, asymmetry, and latency baselines for Biden 2022 and Trump T1 (same baseline periods as existing system). Display current T2 values as deviation from baseline:

"Judicial → Executive constraint rate: 11% (baseline: 23%, -52%)"

---

## 7. Implementation Plan

### Phase A: Data classification + category-level surfacing

**Scope**: Add check classification as a P2.5 pass, backfill on P2 corpus + check-heavy sources, surface in existing UI.

**Steps:**

1. **Schema migration** — add `check_direction`, `check_type`, `checked_action_refs`, `linkability` columns to `ai_document_assessments`. Create `document_identifiers`, `check_links`, and `check_balance_weekly` tables per §3.4.

2. **Document identifier population** — run the §5.1 extraction patterns against existing document titles and metadata to populate the `document_identifiers` lookup table. Add identifier extraction to the ingest pipeline so new documents are indexed automatically. CourtListener's `caseId` field already stores `cl:{docket_id}` — populate the table from this and similar existing metadata.

3. **Non-P2 recall estimation** — before deciding the full P2.5 scope, run the check classification prompt on a random sample of ~500 non-P2 documents to estimate recall loss. This determines whether the P2 corpus alone captures enough inter-branch checks or whether expansion is needed.

4. **P2.5 check classification pass** — implement as a separate pass from the existing P2 erosion assessment (see §4 for rationale). Uses gpt-4o-mini. Scope determined by step 3 results: (a) always includes all existing P2-assessed documents (~4,500 T2 + baseline); (b) if step 3 shows >10% recall loss, expand to all documents from check-heavy source types (CourtListener, GAO, LegiScan) regardless of P1 flag status — an injunction is an inter-branch check whether or not P1 thought the underlying case was erosion-relevant. Cost for the expanded scope is modest: CourtListener contributes ~130-210 docs/week across categories, and at gpt-4o-mini prices the incremental cost is ~$1-3/week. GAO and LegiScan are lower volume. The expanded scope is likely the right default.

5. **Identifier normalization utility** — `lib/utils/identifier-normalizer.ts` implementing the extraction patterns from §5.1.

6. **Matching pipeline** — `lib/services/check-link-resolver.ts` that takes `checked_action_refs` and resolves them against the `document_identifiers` table using the tiered matching approach (§5.2). Populates the `check_links` table with match method, confidence, and latency.

7. **Coverage heatmap** (internal diagnostic) — before building any UI, generate counts per edge per month, percent linked for latency, source type composition. This reveals which edges have adequate signal for visualization and validates or revises the estimates in §8.

8. **"Checks Activated" panel in category detail pages** — per category-week, show institutional responses:

   ```
   Institutional Responses This Week
   • Judicial → Executive: 2 injunctions (1 granted, 1 pending)
   • Legislative → Executive: 1 GAO investigation report
   ```

   With links to the specific documents. This is immediately valuable without the triangle visualization.

9. **Constraint rate + asymmetry computation** — aggregate check classifications into per-edge, per-week constraint rates using the denominator definitions from §6.1. Compute constraint asymmetry per branch pair (§6.3). Store in `check_balance_weekly` table. Compute baselines for all analysis periods.

**Estimated effort**: Medium-Large. The P2.5 prompt is small. The document identifier population and matching pipeline are the largest components. The UI panel is small.

**Cost**: Separate P2.5 API call per document in the classification scope using gpt-4o-mini. For backfill: ~4,500 P2 documents + check-heavy source type documents. For ongoing operation: P2.5 runs on every document that passes P2 plus all new documents from check-heavy source types. Estimated ongoing cost: ~$1-3/week for CourtListener volume; GAO and LegiScan are lower volume and negligible additional cost.

### Phase B: Balance of Powers visualization (after Phase A data proves out)

**Prerequisite**: Phase A running for sufficient time to empirically assess edge coverage.

**Scope**: Standalone `/balance` page with the three-branch visualization.

**Steps:**

1. **Determine viable edges** — from the coverage heatmap, identify which of the 6 directional relationships have sufficient signal for visualization. Ship strong edges; show weak edges as low-confidence/low-coverage rather than hiding them.

2. **Triangle/network visualization** — three-vertex diagram where edge thickness represents smoothed constraint rate and edge color represents above/below baseline. Tooltip shows coverage and match rate per edge.

3. **Edge-first drill-down** — click an edge (e.g., Judicial → Executive), then filter by category, then see the specific documents and linked pairs with latency.

4. **Historical trajectory** — animate or scrub the visualization over time to show how constraint rates have shifted across the T2 period.

**Estimated effort**: Large. Primarily visualization engineering and UX design.

---

## 8. Expected Signal Strength by Edge

Based on the current source stack, estimated classification yield from the P2 corpus:

| Edge                    | Expected signal | Primary sources                                              | Notes                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | --------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Judicial → Executive    | Strong          | CourtListener injunctions, TROs, constitutional rulings      | Court filings explicitly cite the executive actions they challenge. CourtListener NOS codes (440, 530, 890) partially distinguish case types but don't distinguish injunctions from routine opinions at ingest. Keywords in assessment-rules.ts catch some ("injunction issued") but as annotations, not structured data. |
| Executive → Legislative | Strong          | FR signing statements, CPD impoundment references, EOs       | Executive actions that bypass or constrain Congress are well-documented. Note: DOJ source only fetches press releases (no AG policy memos), so signing statements and impoundment references primarily come from FR and CPD, not DOJ.                                                                                     |
| Legislative → Executive | Medium          | GovInfo GAO reports, LegiScan constraint bills, IG reports   | GAO reports are inherently Legislative → Executive oversight but not currently tagged as such. Weaker without CREC hearing transcripts (Release 3 source).                                                                                                                                                                |
| Judicial → Legislative  | Medium-Low      | CourtListener constitutional rulings striking laws           | Rare events but high-signal when they occur                                                                                                                                                                                                                                                                               |
| Executive → Judicial    | Weak            | FR rule withdrawals post-ruling (indirect compliance signal) | Compliance is often invisible; defiance even more so. NONCOMPLIANCE_OR_RESISTANCE classified as low-reliability.                                                                                                                                                                                                          |
| Legislative → Judicial  | Weak            | LegiScan confirmation/jurisdiction bills                     | Low volume without Senate confirmation data                                                                                                                                                                                                                                                                               |

Phase A's coverage heatmap will validate or revise these estimates empirically before Phase B visualization decisions are made.

---

## 9. Relationship to Existing Architecture

**This feature does not replace or modify existing threat detection.** It adds a parallel analytical dimension:

- Existing system: "executiveOversight is at Elevated status — IG report volume dropped and L2 flagged concerning DOJ press releases"
- Balance of Powers addition: "...AND the judicial constraint rate on executive action in this category declined 52% from baseline, with median response latency increasing from 12 to 34 days"

The threat detection and the institutional response data are complementary signals. A category at Elevated with strong institutional responses is a different situation than a category at Elevated with weak or absent institutional responses.

**Integration with convergence scoring** (future, not in this proposal): institutional response rates could become an additional convergence input — a category where threat layers fire AND constraint rates are declining is a stronger signal than either alone.

---

## 10. Risks and Mitigations

**Political attack risk.** Mitigation: never label outcomes, always show coverage and confidence, frame as "publicly observable institutional constraint artifacts." The system doesn't say "democracy is healthy" or "democracy is failing" — it says "here are the constraint rates, here is the baseline, here is the change."

**Low base rate.** Perhaps 2-5% of documents are inter-branch checks. Mitigation: smoothed 4-week rolling windows, explicit coverage percentages, and a Phase A coverage heatmap before committing to visualization design.

**Noncompliance detection.** The hardest check type — a government agency simply not doing what a court ordered produces no document. Mitigation: flag NONCOMPLIANCE_OR_RESISTANCE as low-reliability in the initial classification. Over time, latency data may reveal noncompliance indirectly — a court order with no corresponding compliance document after 90 days.

**Asymmetric coverage.** Executive branch produces 90%+ of documents; legislative and judicial branches produce fewer. Mitigation: constraint rates are normalized (checks / relevant actions), so raw volume differences don't bias the metric. UI always shows which edges have high vs. low coverage.

---

## 11. Resolved Design Decisions (from Claude Code Review)

These questions were posed in the original proposal and resolved during Claude Code review (2026-03-08).

**Q1 — Schema placement**: Extend `ai_document_assessments`. The data is produced by the same assessment pipeline, versioned by the same model, and logically part of the same document analysis. A separate table adds join complexity with no benefit. If versioning becomes an issue later, a separate table is a straightforward migration.

**Q2 — P2 prompt integration**: Separate P2.5 pass, not prompt expansion. The erosion assessment and check classification are different analytical frames that risk blending in a single call. A separate pass allows independent backfill, uses cheaper models (gpt-4o-mini), and keeps concerns separated. Cost is marginal — P2.5 only runs on the P2 corpus plus check-heavy source types.

**Q3 — Identifier matching**: `document_identifiers` lookup table (option b). Populated at ingest time by running §5.1 regex patterns against document titles and metadata. Simple schema with `(document_url, identifier_type, identifier_normalized)` and index on `identifier_normalized` for fast exact-match lookups. CourtListener's `caseId` field already stores `cl:{docket_id}` — populate this table from existing metadata.

**Q4 — Backfill scope**: Backfill on P2 corpus first, then sample ~500 non-P2 documents to estimate recall loss. If >10% of inter-branch checks are missed by P1, expand P2.5 to run on all documents from check-heavy source types (CourtListener, GAO, LegiScan) regardless of P1 flag. Rationale: an injunction is an inter-branch check whether or not P1 thought the case was erosion-relevant.

**Q5 — Existing signals**: Raw data is present but the inter-branch classification layer doesn't exist. CourtListener has NOS codes (440, 530, 890) that partially distinguish case types but doesn't distinguish injunctions from routine opinions at ingest. DOJ fetches press releases only — no AG policy memos. GAO reports are inherently Legislative → Executive oversight but not tagged as such. This proposal fills the classification gap.

**Q6 — Category-week aggregation**: Separate `check_balance_weekly` table. `weekly_aggregates` already has 24 columns and serves a different analytical purpose. Check balance metrics are a parallel dimension with different consumers (the Balance of Powers page). Independent computation cadence.

---

## 12. Remaining Open Questions

1. **NONCOMPLIANCE_OR_RESISTANCE classification reliability**: This is the hardest check type — noncompliance often produces no document. Should P2.5 attempt to classify it at all in the initial backfill, or should it be deferred until latency data can reveal noncompliance indirectly (court order + no compliance document after 90 days)?

2. **Phase B visualization framework**: Should the triangle visualization use D3 (already available in the frontend stack), a dedicated graph visualization library (e.g., Cytoscape.js), or a custom React/SVG component? The choice affects interactivity capabilities (animation, drill-down, historical scrubbing) and development effort.

**Previously open, now resolved:**

- **Denominator stability (was Q1)**: Resolved by switching to raw source-type volume denominators (§6.1), which are stable across L2 calibration changes.
- **Check-heavy source type cost (was Q3)**: CourtListener contributes ~130-210 docs/week. At gpt-4o-mini prices (~$0.15/1K input tokens), running P2.5 on all CL documents costs ~$1-3/week. GAO and LegiScan are lower volume. Total incremental cost is modest and doesn't warrant a middle-ground optimization. Resolved in §7 step 4.
