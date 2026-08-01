# Validation Surface Boundary Map (R-VALIDATION-RECONCILE, #646)

**Status:** approved 2026-08-01. Governs #647–#650.

Every validation/System-Health report answers exactly **one question**. Every check
belongs to exactly **one** report. Each report shows its name + one-line question as a
header so a reader can tell them apart at a glance.

## The five reports

| Report               | The one question                                                         | Severity model           |
| -------------------- | ------------------------------------------------------------------------ | ------------------------ |
| **Ingest Health**    | Did we _acquire_ the expected inputs, with complete content?             | `action` / `limitation`  |
| **Data Readiness**   | What's the _processing backlog_, and do we have enough _reference data_? | `action` / `limitation`  |
| **Derivation Graph** | Is every _derived_ artifact consistent with & fresh against its inputs?  | `error` / `warn` (gates) |
| **Detection**        | Does detection _catch_ known events and _reject_ negative controls?      | efficacy                 |
| **Backtest**         | Does the pipeline hold up on _historical_ data?                          | efficacy                 |

Boundary rule for content: content **absent/null** → Ingest; content **present but
unprocessed** → Data Readiness.

## Severity principle (applies to every report)

Every finding is `action` (has a remediation worth running) or `limitation` (a
documented fact no command should run against). **Baseline-period gaps (before
2025-01-20) are `limitation`, not `action`** — baselines are calibrated reference,
baseline writes need approval, and **baseline narratives are not shown to users**
(pending product decision #651). We do not tell the operator that baseline weeks
"need attention." Only current-term (trump_t2) gaps are actionable. This holds
across Data Readiness (L2 gaps, missing narratives), Ingest (period coverage), and
anywhere else a per-period gap is reported.

## Ownership

### Ingest Health

Document Coverage · Content Completeness (by type/origin) · Pagination Fitness ·
Source/FR/CPD/CL Period Coverage · Signal Coverage Gaps · Fetch Errors ·
**Metadata-Only Classification** (decision 1 → Ingest).

### Data Readiness

Pipeline Stage Completeness _(scores/embeddings backlog only)_ · Baseline Completeness ·
AI Review Coverage _(P1/P2 backlog — decision 2)_. All items tagged `action`/`limitation`,
framed as a work-queue.

### Derivation Graph (sole authority on derived-vs-inputs)

G1a–G5 edge contract, plus incoming: aggregate presence · Monday anchors _(=G2c)_ ·
orphan categories · #544 resurrection · narrative missing/stale _(→ G4/G4h)_ ·
layer-score population _(enrichment completeness — decision 3, `warn`)_.
**Deleted:** Data Readiness's `computed_at` narrative-staleness (the phantom: flagged 745
where G4h flags 0, because a no-op re-derivation bumps `computed_at` without changing the
assessments the narrative describes).

### Detection

Population Sufficiency · Negative Controls · Known Event Detection ·
**audit false-negative rates** (decision 4 → Detection, recall quality).

### Backtest

Per-Category Backtest · Missed Events.

## Resolved judgment calls

1. Metadata-Only Classification → **Ingest** (acquisition classification).
2. L2 P1/P2 coverage → **Data Readiness backlog + a soft Graph invariant** ("flagged ⇒ has
   P2 or excluded"); some are permanently unfillable (content-starved LegiScan bills, #645).
3. Layer-score population → **Graph** enrichment-completeness at `warn`.
4. Audit FN rates → **Detection** (recall metric).

## Implementation issues

- **#647** Data Readiness ↔ Derivation Graph: delete `computed_at` staleness; move
  aggregate presence / Monday anchors / orphan categories / #544 resurrection to the Graph.
- **#648** Ingest ↔ Data Readiness overlap (acquisition vs backlog); metadata classification → Ingest.
- **#649** Suite-wide `action`/`limitation` severity + known-issues rendering.
- **#650** Graph freshness: live cheap invariants (G2/G3/G4/G4h) + as-of stamp + Refresh button.
