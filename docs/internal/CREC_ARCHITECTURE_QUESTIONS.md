# CREC Integration: Architecture Questions for Review

These questions arose during sprint R1-SX1 planning (Congressional Record integration + contextual P2 prompt enhancement). They need resolution before implementation begins.

## Decisions (2026-03-17)

Reviewed by Claude.ai and ChatGPT. Final decisions:

1. **Cross-category P1 in P2: Option A (within-category only).** Cross-category signals in P2 create feedback loop risk. Synchrony is captured at the convergence layer. Test cross-category variants (C, D) empirically in the spike — don't build a compromise before having data.
2. **CREC content split: Single `crecContentType` enum.** Three values: `floor_speech`, `legislative_action`, `nomination`. Procedural items filtered out at ingestion. Multi-dimensional classification (form + function) deferred to Release 4.
3. **No 15th Rhetoric category.** Route CREC into existing 14 categories via content classification. Tag with `crecContentType` for future rhetoric analytics.
4. **Empirical P2 variant testing: Run spike before finalizing prompt.** Six variants: A (baseline), B-reduced (counts only + doc P1 result), B-full (counts + peer titles + doc P1 result), C (B-full + family), D (B-full + all-category), E (B-full + rhetoric framing). Include routine-but-busy congressional week in baseline set.
5. **L1 baselines: Backfill CREC for all 5 periods, recompute baselines.** Same source composition in baselines and analysis periods. This is the lesson from the content enrichment regression.
6. **Document's own P1 result in ALL variants B–E** (not a separate variant). P2 must know if it's reviewing a P1-flagged doc or an audit sample.

---

## Question 1: Should P2 receive P1 assessments from related categories?

### Current state

P2 is strictly category-siloed. When assessing a document in `civilLiberties`, P2 sees only that category's P1 results. It has no visibility into what happened in `immigrationEnforcement` or `judicialIndependence` the same week — even when the same real-world event (Travel Ban EO, Comey firing) triggers signals across all three.

The proposed contextual P2 prompt adds within-category context:

```
P1 flags this week: 8/12 flagged
Notable flagged peers: "Travel Ban Implementation Memo" (formal_override),
                       "DHS Enforcement Directive" (formal_override)
```

### The question

Should this context include P1 results from other categories? Three options:

**Option A: Within-category only (current proposal)**

P2 for `civilLiberties` sees only `civilLiberties` P1 results.

- Pros: Preserves epistemic independence. Simple pipeline (no cross-category dependencies). Each category's P2 can run as soon as its own P1 completes.
- Cons: Misses the synchrony signal. During the Travel Ban week, `civilLiberties` P2 doesn't know that `immigrationEnforcement` and `judicialIndependence` are also lighting up.

**Option B: Within category family**

Define 4-5 category families (groupings of related threat vectors). P2 for `civilLiberties` sees P1 results from its family: `civilLiberties`, `immigrationEnforcement`, `elections`.

Possible families (needs validation — these are suggestive, not authoritative):

| Family                | Categories                                        | Rationale                                     |
| --------------------- | ------------------------------------------------- | --------------------------------------------- |
| Rights & Liberties    | civilLiberties, immigrationEnforcement, elections | Constitutional rights, individual protections |
| Rule of Law           | lawEnforcement, judicialIndependence              | Justice system independence                   |
| Executive Power       | executiveActions, executiveOversight, rulemaking  | Presidential authority and its checks         |
| Government Operations | civilService, fiscal, hatch                       | Operational integrity of government machinery |
| Public Accountability | infoAvailability, mediaFreedom, military          | Public's ability to know and constrain        |

- Pros: Captures the most likely cross-category correlations without overwhelming P2. Smaller scope than all-categories.
- Cons: Family definitions are a judgment call that could introduce analytical bias. A family grouping that seems natural may miss important cross-family correlations (e.g., `civilService` + `executiveOversight` during DOGE operations span two families).
- Pipeline impact: P1 must complete for all categories in a family before P2 starts for any category in that family.

**Option C: All categories**

P2 sees a summary of P1 activity across all 14 categories.

```
Cross-category P1 activity this week:
  civilService: 9/15 flagged (60%)
  executiveOversight: 7/12 flagged (58%)
  immigrationEnforcement: 4/20 flagged (20%)
  [... 11 more ...]
```

- Pros: Captures all synchrony signals. No arbitrary family boundaries.
- Cons: Noisy — 14 categories of context might overwhelm the P2 prompt. Creates a strong sequential dependency: ALL P1 must complete before ANY P2 can start. May create confirmation bias — seeing many elevated categories could cause P2 to over-flag documents that it would otherwise assess as routine.

### Recommendation

Start with **Option A (within-category only)** for the initial implementation, but design the data pipeline to make Option B achievable later. Rationale:

1. Cross-category synchrony is already captured at the convergence layer — it doesn't need to be in P2.
2. The primary P2 failure mode (missing context-dependent significance) is within-category: "this routine-looking document appeared in a week where 8 of 12 documents in the same category were flagged."
3. Adding cross-category context introduces confirmation bias risk. If P2 sees that 5 other categories are elevated, it may rubber-stamp borderline documents.
4. Empirical testing (Question 4) should determine whether cross-category context actually improves detection before we commit to the complexity.

The pipeline change to support Option B later is small: pass a `familyContext` parameter to the P2 prompt builder, populated from completed P1 runs of sibling categories.

---

## Question 2: Can we distinguish standard congressional work from public rhetoric?

### What CREC contains

The Congressional Record contains several distinct content types, identifiable via the GovInfo `subGranuleClass` field:

| Content type                               | subGranuleClass examples                          | Character                                                       |
| ------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------- |
| **Procedural**                             | PRAYER, PLEDGE, ADJOURNMENT, RECESS               | Ceremonial, no analytical value                                 |
| **Legislative mechanics**                  | Cloture motions, quorum calls, vote announcements | Process, not substance                                          |
| **Bill introductions / committee reports** | SINTROBILLS, SRECOMMITTEE                         | Standard legislative work product                               |
| **Floor speeches**                         | ALLOTHER, SEXECSESSION, HMORNINGDEBATE            | Substantive rhetoric — this is where erosion signals live       |
| **Extensions of Remarks**                  | (EXTENSIONS granuleClass)                         | Prepared statements, often ceremonial but sometimes substantive |
| **Nominations**                            | SNOMINATIONS                                      | Personnel actions — high-value for oversight categories         |

### The distinction

Yes, we can make a clear distinction, but it's a **three-way split**, not binary:

1. **Procedural noise** — filter out entirely (PRAYER, PLEDGE, ADJOURNMENT, quorum calls). No analytical value.
2. **Legislative work product** — bill introductions, committee reports, vote outcomes, nominations. These are **formal government actions** analogous to Federal Register documents. They should flow through the existing pipeline like any other government document source.
3. **Floor speeches / rhetoric** — speeches, debate, one-minute statements, Extensions of Remarks. These are **primary-source rhetoric** — members of Congress publicly stating positions, making arguments, attacking or defending institutional norms.

### How to implement the distinction

Store the distinction in the document's `metadata` field:

```typescript
metadata: {
  speaker: "Grassley, Chuck",
  party: "R",
  state: "IA",
  chamber: "senate",
  subGranuleClass: "SEXECSESSION",
  crecContentType: "floor_speech" | "legislative_action" | "nomination" | "extension"
}
```

This metadata is available to P1 and P2 prompts, enabling the AI to reason differently about a floor speech vs. a bill introduction. It's also available for future Release 4 rhetoric analysis without architectural changes.

### Should P2 treat them differently?

Possibly, but let empirical testing decide (Question 4). Two framings to test:

- **Framing A (neutral):** Treat CREC documents identically to Federal Register documents. The AI can see `Type: floor_speech` and draw its own conclusions.
- **Framing B (rhetoric-aware):** Add a P2 prompt line: "This is a floor speech, not a formal government action. Assess whether the rhetoric signals policy intent, institutional pressure, or erosion framing — not just whether a formal action occurred."

Framing B might help P2 avoid dismissing speeches as "not a formal action, therefore routine" — which would be the correct assessment for a Federal Register document but misses the point of monitoring rhetoric.

---

## Question 3: Should Rhetoric be a 15th category?

### What the current categories represent

The 14 categories are **threat vectors** — institutional domains that can be eroded:

- `civilService` = merit-system protections can be eroded
- `judicialIndependence` = judicial autonomy can be eroded
- `executiveOversight` = watchdog capacity can be eroded

Each category has specific institutional norms, historical baselines, and detection thresholds calibrated to its document volume and signal characteristics.

### Why Rhetoric doesn't fit this model

"Rhetoric" is not an institution that can be eroded. It's a **medium** through which erosion in other institutions is signaled, debated, and sometimes enabled. A floor speech about firing inspectors general is a signal for `executiveOversight`, not for a hypothetical "rhetoric" bucket. If we create a Rhetoric category, we face an immediate classification problem: does a speech about judicial independence go into `judicialIndependence`, `rhetoric`, or both? If both, we're double-counting. If just `rhetoric`, we're removing signal from the category that needs it.

### What a Rhetoric category would actually track

The legitimate analytical interest isn't "rhetoric happened" but rather:

1. **Escalation patterns** — is the tone of floor speeches becoming more extreme over time?
2. **Framing shifts** — are members shifting from "reform" language to "dismantling" language?
3. **Intent signaling** — rhetoric that precedes formal action (the Comey firing was discussed in floor speeches before it happened)
4. **Normalization patterns** — are previously unthinkable positions being stated openly?

These are real signals, but they're better served by:

- **A rhetoric-specific L3 dimension** (thematic drift within speech embeddings, separate from document embeddings) — detects tone/framing shifts over time
- **A "rhetoric lag" indicator** per category — tracks how often rhetoric precedes formal action (Release 4's core feature)
- **Cross-category rhetoric volume** as a meta-indicator — a surge in floor speeches across multiple categories simultaneously is a synchrony signal

### Recommendation

**Do not create a 15th category.** Instead:

1. **Route CREC content into existing categories** via content-based classification (the current plan). A speech about civil liberties elevates `civilLiberties`.
2. **Tag CREC documents with `crecContentType: "floor_speech"`** so that downstream analysis can filter by content type.
3. **Add a `speaker` column** to enable future speaker-tracking analysis.
4. **Defer rhetoric-specific analytics** (tone escalation, framing shifts, intent signaling) to Release 4, which was designed for exactly this analysis. The data we ingest now will be available for those features when they're built.

Creating a 15th category would require: new baselines for all 5 analysis periods, NC-1 through NC-6 calibration, UI updates for 14→15 categories, all existing test events re-evaluated. The analytical value doesn't justify this cost when the same data can flow through existing categories now and support rhetoric-specific features later.

### Counterargument worth considering

There is one scenario where a Rhetoric category could add value: tracking **meta-rhetorical patterns** that don't belong to any single threat vector. For example, "members of Congress openly questioning whether elections should be respected" is a rhetoric signal that touches `elections` but is really about democratic legitimacy itself — a meta-category. If the system needs to track democratic norm erosion in public discourse (not just institutional erosion in government documents), a "Democratic Norms" or "Political Discourse" category could be justified. But this would be a significant scope expansion beyond the current project's mission of monitoring the government's own documentary record.

---

## Question 4: Can we run empirical tests with different P2 header options?

### Yes — and we should before shipping the prompt change.

### Proposed test design

**Phase 1: CREC sample ingestion (prerequisite)**

Ingest CREC documents for 4-6 specific weeks that correspond to known test events:

| Week       | Event              | Categories                                                   | Why this week                                                              |
| ---------- | ------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 2017-01-23 | Travel Ban EO      | civilLiberties, immigrationEnforcement, judicialIndependence | Multi-category, strong signal, T1 period                                   |
| 2017-05-08 | Comey Firing       | executiveOversight, lawEnforcement, judicialIndependence     | The canonical "rhetoric preceded formal action" case                       |
| 2017-03-06 | Sessions Recusal   | judicialIndependence, lawEnforcement                         | Currently "Expected miss — signal in rhetoric." CREC should fill this gap. |
| 2025-01-20 | Day One EO Blitz   | executiveActions, civilService, immigrationEnforcement       | T2 period, massive CREC activity expected                                  |
| 2025-02-03 | DOGE/USAID         | executiveOversight, executiveActions                         | Floor speeches about agency shutdown                                       |
| 2025-02-10 | DOJ Career Firings | lawEnforcement, judicialIndependence                         | Currently moderate signal — CREC may strengthen                            |

Plus 2-3 baseline weeks (Biden 2022) where nothing notable happened, to measure false positive rates.

**Phase 2: P1 assessment of CREC documents**

Run P1 on all ingested CREC documents across all relevant categories. This gives us the P1 results needed for P2 context headers.

**Phase 3: P2 prompt variant testing**

For each known-event week, run P2 with 4-5 different context header variants:

| Variant                          | Context header content                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A (baseline)**                 | Current prompt — no week context, category `description` only                                                                                          |
| **B (within-category)**          | Proposed header: expertDescription, doc count vs baseline, trajectory, P1 flag count, flagged peer titles with erosion types                           |
| **C (B + family context)**       | Add: "Related category P1 activity: lawEnforcement 6/10 flagged, judicialIndependence 4/8 flagged"                                                     |
| **D (B + all-category summary)** | Add: one-line summary of all 14 categories' P1 flag rates                                                                                              |
| **E (B + rhetoric framing)**     | Add: "This is a floor speech. Assess whether the rhetoric signals policy intent or institutional pressure, not just whether a formal action occurred." |

**Phase 4: Evaluation**

For each variant, measure:

- **Detection rate** against known events (does the event week reach the expected convergence status?)
- **False positive rate** during baseline weeks (do Biden 2022 weeks stay Stable?)
- **P2 assessment distribution** — what fraction of documents get `routine` vs `potentially_concerning` vs `clearly_concerning`?
- **Reasoning quality** — does P2's `reasoning` field show awareness of the contextual signals, or does it ignore them?

### Implementation approach

This can be done as a **spike script** (`scripts/test-p2-variants.ts`) that:

1. Fetches CREC granules for the target weeks via the GovInfo API (reuses CREC fetcher code)
2. Runs P1 on each document (stores results in a temporary structure, not the production DB)
3. For each P2 variant, calls `assessPass2()` with a modified prompt builder
4. Collects results into a comparison table
5. Outputs a markdown report

Estimated cost: ~$5-15 in API calls (P1 is gpt-4o-mini at ~$0.15/1K docs, P2 is Claude Sonnet at ~$0.50-1.00 per variant per week). 6 event weeks × 5 variants × ~20 P2 calls per week = ~600 P2 calls total.

### What the test tells us

- Whether cross-category context (Options C/D) actually improves detection or just increases false positives
- Whether rhetoric-specific framing (Option E) helps P2 correctly assess speeches vs dismissing them as "not formal actions"
- Whether the expertDescription adds value over the current public-facing description
- Whether the "safety net" framing for audit samples changes P2 behavior
- Whether the Sessions recusal (T1-3, currently "Expected miss") can be detected with CREC data regardless of prompt variant — which would validate the strategic thesis that data coverage matters more than scoring precision

### Sprint sequencing

The test should run **after** the CREC fetcher is built (#401) but **before** the P2 prompt enhancement is finalized (#405). This means:

1. Build CREC fetcher → #401
2. Build schema + routing → #402, #403
3. **Run P2 variant spike** → new issue
4. Finalize P2 prompt based on spike results → #405
5. Full CREC backfill → #407

This adds ~1 day to the sprint but ensures we ship the right prompt, not just a plausible one.

---

## Summary of recommendations

| Question                       | Recommendation                                                                       | Confidence |
| ------------------------------ | ------------------------------------------------------------------------------------ | ---------- |
| Cross-category P1 in P2        | Start within-category only; test cross-category empirically                          | High       |
| Congressional work vs rhetoric | Three-way split (procedural / legislative / rhetoric) via `crecContentType` metadata | High       |
| Rhetoric as 15th category      | No — route into existing categories; defer rhetoric analytics to Release 4           | High       |
| Empirical P2 testing           | Yes — spike script testing 5 prompt variants on 6 known-event weeks + baseline weeks | High       |

### Open questions for reviewers

1. Are the proposed category families reasonable? Should they be data-driven (based on known-event co-occurrence) rather than conceptually defined?
2. Should the P2 variant test include a variant where `expertDescription` replaces `description` entirely, or should both always be present?
3. For the "rhetoric framing" variant (E), should the framing differ between House one-minute speeches (performative, audience-oriented) and Senate floor debate (deliberative, colleague-oriented)?
4. Is there value in tracking "rhetoric volume" as a structural dimension within existing categories — e.g., "this week, 40% of civilLiberties documents are floor speeches vs the baseline 5%" — as an L1 signal?
