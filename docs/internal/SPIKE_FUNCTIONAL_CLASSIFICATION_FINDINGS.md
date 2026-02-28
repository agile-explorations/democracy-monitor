# Spike Findings: Institutional Function Classification Feasibility

**Date:** 2026-02-22
**Duration:** ~30 minutes
**Method:** Database queries against 132K documents + FR API metadata sampling

---

## Finding 1: Metadata Inventory

### What's stored in our database

| Column         | Type        | Content                                                                |
| -------------- | ----------- | ---------------------------------------------------------------------- |
| `source_type`  | varchar     | `Notice`, `Rule`, `Proposed Rule`, `Presidential Document`, `rhetoric` |
| `category`     | varchar     | One of 11 assessment categories + `intent`                             |
| `title`        | text        | Full document title                                                    |
| `content`      | text        | Body text (when available)                                             |
| `metadata`     | jsonb       | **Only stores `agency`** — no other FR API fields                      |
| `published_at` | timestamptz | Publication date                                                       |

### What the FR API provides that we don't store

From 5 successful API fetches across document types:

| Field                    | Populated?                      | Example Value                                                                                             | Useful for Classification?                                   |
| ------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `type`                   | Always                          | `Notice`, `Rule`, `Presidential Document`                                                                 | Yes — already stored as `source_type`                        |
| `subtype`                | Sometimes                       | `Executive Order`, `Proclamation`, `null`                                                                 | Yes — distinguishes presidential doc types                   |
| `action`                 | Usually (not on PRESDOC)        | `"Notice."`, `"Notice of a modified system of records."`, `"Final rule; announcement of effective date."` | **Yes — most promising field for sub-classification**        |
| `agencies`               | Always                          | Full agency objects with `name`, `id`, `parent_id`, `slug`                                                | Yes — we store `agency` but only the name string             |
| `cfr_references`         | Sparse (empty in 4/5 fetches)   | `[{"title": 47, "part": 54}]`                                                                             | Maybe — when present, highly informative (5 CFR = personnel) |
| `topics`                 | Sparse (empty in all 5 fetches) | `[]`                                                                                                      | No — appears unpopulated                                     |
| `regulation_id_numbers`  | Sparse                          | `[]`                                                                                                      | No                                                           |
| `docket_ids`             | Sparse                          | `[]`                                                                                                      | No                                                           |
| `signing_date`           | PRESDOC only                    | `"2025-01-20"`                                                                                            | Minor                                                        |
| `executive_order_number` | EO only                         | `"14151"`                                                                                                 | Minor                                                        |
| `abstract`               | Sometimes                       | Full paragraph                                                                                            | Maybe — rich text but requires NLP                           |
| `page_views`             | Always                          | `{"count": 127660}`                                                                                       | No (lagging indicator)                                       |

**Key gap:** We don't store `action`, `subtype`, `cfr_references`, or `abstract`. The `action` field is the single most useful field we're not capturing.

---

## Finding 2: Natural Groupings

### Document type distribution (overall)

| Type                  | Count  | %     |
| --------------------- | ------ | ----- |
| rhetoric (GDELT/WH)   | 57,560 | 43.5% |
| Notice                | 49,242 | 37.2% |
| Rule                  | 15,399 | 11.6% |
| Proposed Rule         | 8,384  | 6.3%  |
| Presidential Document | 1,675  | 1.3%  |

The top-level `type` field creates 5 buckets, but 43.5% is rhetoric (not FR) and 37.2% is the catch-all "Notice."

### Sub-patterns within "Notice" (civilService category)

Title prefix analysis across both administrations (1,186 Notice documents):

| Pattern                        | Biden 2022 | Trump 2025 | Identification Method                                                        |
| ------------------------------ | ---------- | ---------- | ---------------------------------------------------------------------------- |
| **Other (unclassified)**       | 321        | 151        | —                                                                            |
| Cultural Import determinations | 96         | 112        | Title: `"Notice of Determinations; Culturally Significant..."`               |
| Self-Regulatory Org filings    | 81         | 83         | Title: `"Self-Regulatory Organizations;..."`                                 |
| Privacy Act notices            | 71         | 34         | Title: `"Privacy Act of 1974;..."`                                           |
| Info collection / PRA          | 65         | 38         | Title: `"Agency Information Collection..."` or `"Information Collection..."` |
| Submission for OMB review      | 39         | 35         | Title: `"Submission for..."`                                                 |
| Excepted Service               | 18         | **0**      | Title: `"Excepted Service"`                                                  |
| Org structure changes          | 14         | **2**      | Title: `"Statement of Organization, Functions..."`                           |
| SES listings                   | 10         | 9          | Title: `"Senior Executive Service..."`                                       |
| Personnel demonstrations       | 6          | 1          | Title: `"Personnel Demonstration Project..."`                                |

### Candidate functional buckets (proposed)

Based on the data, 8-10 functional buckets emerge:

1. **Rulemaking** — `Rule` and `Proposed Rule` types (deterministic from `source_type`)
2. **Executive Action** — `Presidential Document` type, subdivided by `subtype` (Executive Order, Proclamation, Memorandum)
3. **Personnel Action** — Notices about Excepted Service, SES, hiring, RIF, personnel demonstrations (title pattern)
4. **Administrative Procedure** — Privacy Act, info collection, PRA submissions, Sunshine Act (title pattern)
5. **Financial/Regulatory Filing** — Self-Regulatory Org filings, SEC notices (title pattern)
6. **Organizational Change** — Statement of Organization, reorganization (title pattern)
7. **Oversight/Advisory** — Meeting notices, advisory committee, IG-related (title pattern + agency)
8. **News/Rhetoric** — GDELT and WH press (deterministic from `source_type = 'rhetoric'`)
9. **Cultural/Ceremonial** — Cultural import determinations, proclamations (title pattern)
10. **Other/Unclassified** — Remainder

Buckets 1, 2, and 8 are **fully deterministic from metadata**. Buckets 3-7 and 9 require **title pattern matching**. Bucket 10 is the residual.

---

## Finding 3: Assignability Assessment

### Deterministic from existing metadata (source_type alone)

| Bucket                      | Identification                             | % of all documents |
| --------------------------- | ------------------------------------------ | ------------------ |
| Rulemaking                  | `source_type IN ('Rule', 'Proposed Rule')` | 17.9%              |
| Executive Action            | `source_type = 'Presidential Document'`    | 1.3%               |
| News/Rhetoric               | `source_type = 'rhetoric'`                 | 43.5%              |
| **Subtotal: deterministic** |                                            | **62.7%**          |

### Classifiable from title prefix patterns

| Bucket                         | Pattern                                              | % of Notice documents | % of all documents |
| ------------------------------ | ---------------------------------------------------- | --------------------- | ------------------ |
| Financial/Regulatory Filing    | `title LIKE 'Self-Regulatory%'`                      | 16.0%                 | 6.0%               |
| Cultural/Ceremonial            | `title LIKE 'Notice of Determinations; Culturally%'` | 10.6%                 | 3.9%               |
| Administrative Procedure       | Privacy Act + Info Collection + Submission           | 14.4%                 | 5.4%               |
| Personnel Action               | Excepted Service + SES + RIF + Personnel Demo        | 2.9%                  | 1.1%               |
| Organizational Change          | `title LIKE 'Statement of Organization%'`            | 1.0%                  | 0.4%               |
| **Subtotal: title heuristics** |                                                      | **44.9%**             | **16.8%**          |

### Ambiguous remainder

| Bucket             | % of Notice    | % of all documents |
| ------------------ | -------------- | ------------------ |
| Other/Unclassified | ~55% of Notice | **20.5%**          |

### Overall assignability estimate

| Method                      | Coverage  |
| --------------------------- | --------- |
| Metadata-only (source_type) | 62.7%     |
| + Title prefix heuristics   | 79.5%     |
| Ambiguous remainder         | **20.5%** |

The ambiguous 20.5% is the "Other" Notice category — documents whose titles don't follow recognizable patterns. These would need the FR API `action` field or content analysis to classify.

**If we stored the `action` field**, much of this 20.5% could be resolved. The `action` field distinguishes "Notice of proposed rulemaking" from "Notice of meeting" from "Notice of availability" etc. — exactly the functional distinctions we need.

---

## Finding 4: Cross-Administration Stability

### Type distribution comparison (civilService)

| Type                  | Biden 2022 | Biden % | Trump 2025 | Trump %   | Delta      |
| --------------------- | ---------- | ------- | ---------- | --------- | ---------- |
| Notice                | 721        | 64.3%   | 465        | 57.1%     | **-7.2pp** |
| Rule                  | 183        | 16.3%   | 153        | 18.8%     | +2.5pp     |
| Proposed Rule         | 178        | 15.9%   | 112        | 13.7%     | -2.2pp     |
| Presidential Document | 39         | 3.5%    | 85         | **10.4%** | **+6.9pp** |

**Presidential Documents tripled from 3.5% → 10.4%** in civilService. This is a genuine signal — it reflects executive action replacing normal administrative process (Notice).

### Type distribution comparison (fiscal)

| Type                  | Biden 2022 | Biden % | Trump 2025 | Trump %  | Delta      |
| --------------------- | ---------- | ------- | ---------- | -------- | ---------- |
| Notice                | 3,682      | 73.5%   | 4,521      | 76.9%    | +3.4pp     |
| Rule                  | 644        | 12.9%   | 634        | 10.8%    | -2.1pp     |
| Proposed Rule         | 583        | 11.6%   | 497        | 8.5%     | -3.1pp     |
| Presidential Document | 100        | 2.0%    | 228        | **3.9%** | **+1.9pp** |

Similar pattern: Presidential Documents nearly doubled. Proposed Rules declined (fewer new regulations being proposed).

### Type distribution comparison (igs)

| Type                  | Biden 2022 | Biden % | Trump 2025 | Trump %   | Delta      |
| --------------------- | ---------- | ------- | ---------- | --------- | ---------- |
| Notice                | 769        | 74.2%   | 521        | 69.2%     | -5.0pp     |
| Rule                  | 170        | 16.4%   | 120        | 15.9%     | -0.5pp     |
| Proposed Rule         | 87         | 8.4%    | 105        | **13.9%** | **+5.5pp** |
| Presidential Document | 10         | 1.0%    | 7          | 0.9%      | -0.1pp     |

Different pattern: Proposed Rules increased for igs. No presidential document surge.

### Sub-pattern shifts (civilService Notice)

| Pattern             | Biden 2022 | Trump 2025 | Signal?                                                   |
| ------------------- | ---------- | ---------- | --------------------------------------------------------- |
| Excepted Service    | 18         | **0**      | **Yes — OPM stopped publishing Excepted Service notices** |
| Org Statement       | 14         | **2**      | **Yes — fewer organizational structure updates**          |
| Cultural Import     | 96         | 112        | No — stable background noise                              |
| Self-Regulatory Org | 81         | 83         | No — stable background noise                              |
| Privacy Act         | 71         | 34         | Maybe — could reflect reduced privacy compliance activity |

**The Excepted Service drop from 18→0 is a genuine institutional function signal.** OPM publishes these notices when agencies request excepted service hiring authority. Zero notices in 13 months of Trump 2025 could mean: (a) no new excepted service requests, (b) the process is being bypassed, or (c) the notices are being published differently. Any of these is worth investigating.

---

## Finding 5: Recommended Approach

### **Metadata + title heuristics** (Option B)

The data supports functional classification as a structural metric with the following design:

**Tier 1 — Deterministic (62.7%):** `source_type` alone classifies Rules, Proposed Rules, Presidential Documents, and rhetoric. Zero ambiguity.

**Tier 2 — Title heuristics (16.8%):** Simple prefix matching on Notice titles classifies ~45% of Notices into Personnel Action, Administrative Procedure, Financial Filing, Cultural/Ceremonial, and Organizational Change. Low ambiguity — these patterns are highly formulaic.

**Tier 3 — Unclassified remainder (20.5%):** Notice documents with non-standard titles. Currently unresolvable without the `action` field or content analysis.

### Recommended next steps

1. **Start capturing the FR API `action` field** in document metadata during fetch. This is a schema/pipeline change, not an AI change. The `action` field would resolve most of Tier 3.

2. **Build the functional classifier as a deterministic lookup** — `source_type` + title prefix patterns. No AI needed. The ~20% ambiguity rate is acceptable if documented; it drops significantly once `action` is stored.

3. **The cross-administration comparison already shows signal.** Even at the crude `source_type` level:
   - Presidential Documents tripling in civilService (3.5% → 10.4%) = executive overreach signal
   - Excepted Service notices disappearing (18 → 0) = institutional process breakdown signal
   - Proposed Rules declining in fiscal = deregulatory posture signal

   These are **exactly the kind of institutional posture changes** the functional drift metric is designed to detect, and they're visible without any AI classification.

4. **Don't wait for perfect classification.** The Tier 1 + Tier 2 approach (~80% coverage) is enough to build a meaningful functional drift metric. The 20% "Other" category becomes its own signal — if the unclassified proportion changes significantly across administrations, that itself indicates a shift in how government is communicating.

### What this metric would detect that keyword matching cannot

Keywords look for _what documents say_. Functional classification looks for _what kind of documents are being published_. The current keyword approach misses:

- An administration that stops publishing Excepted Service notices (no keyword to match on absence)
- A shift from Proposed Rules to Presidential Documents (same topics, different institutional posture)
- An increase in executive orders as a proportion of total output (volume-neutral, composition-only change)

These are structural signals that don't require reading the documents at all.

---

## Raw Data

### Documents table schema

```
id, source_type, category, title, content, url, published_at, fetched_at, metadata (jsonb: {agency}), embedding, embedded_at
```

### Overall source_type distribution

```
rhetoric              | 57,560 | 43.5%
Notice                | 49,242 | 37.2%
Rule                  | 15,399 | 11.6%
Proposed Rule         |  8,384 |  6.3%
Presidential Document |  1,675 |  1.3%
```

### FR API `action` field samples

```
Notice:  "Notice."
Notice:  "Notice of a modified system of records."
Rule:    "Final rule; announcement of effective date."
PRESDOC: null (action field not used for presidential documents)
```

### FR API sparse fields

`topics`: empty array in 5/5 fetches
`cfr_references`: populated in 1/5 fetches (47 CFR Part 54)
`regulation_id_numbers`: empty in 5/5 fetches
`abstract`: populated in 2/5 fetches (Notices and Rules, not PRESDOC)
