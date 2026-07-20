# Coverage-Parity Audit (#557)

_Read-only measurement, 2026-07-19. Companion to the coverage-parity standing constraint
(PROJECT_KNOWLEDGE.md) and the #556 reframe. Raw matrix: `parity-matrix` queries in the issue;
counts exclude retrieval-annotated and metadata-only docs._

## The matrix (docs by period × source)

| Period     | Total      | FR     | CL         | CREC   | LegiScan | DOJ   | GovInfo | Court-scoped opinions | P1 coverage |
| ---------- | ---------- | ------ | ---------- | ------ | -------- | ----- | ------- | --------------------- | ----------- |
| trump_2017 | 26,059     | 12,512 | **838**    | 5,914  | 2,550    | 625   | 2,903   | **0**                 | 99.9%       |
| trump_2018 | 26,453     | 13,141 | **1,742**  | 5,643  | 1,176    | 807   | 3,167   | **0**                 | 100%        |
| trump_2019 | **81,279** | 14,641 | **47,809** | 11,757 | 2,476    | 1,039 | 3,007   | **0**                 | 98.6%       |
| trump_2020 | 68,299     | 15,571 | 41,619     | 6,348  | **0**    | 939   | 3,223   | **0**                 | 100%        |
| biden_2021 | 37,434     | 14,896 | 13,212     | 3,954  | 1,212    | 860   | 2,853   | **0**                 | 100%        |
| biden_2022 | 37,790     | 15,236 | 13,559     | 3,401  | 763      | 1,102 | 3,262   | 13                    | 100%        |
| biden_2023 | 55,419     | 15,087 | 28,492     | 8,119  | **0**    | 1,239 | 2,059   | 1,278                 | 100%        |
| biden_2024 | 59,650     | 16,569 | 29,393     | 9,022  | 126      | 1,623 | 2,502   | 1,311                 | 100%        |
| trump_t2   | 64,762     | 19,822 | 28,332     | 8,646  | 2,369    | 1,479 | 3,563   | 2,249                 | 100%        |

## Findings, ranked by surface visibility

1. **CourtListener ingestion history is the largest asymmetry — larger than the court-scoped
   layer.** Total corpus size varies ~3x (26k → 81k) almost entirely from CL: trump_2017/2018
   have <2k CL docs; 2019–2020 have 40k+ (bulk-staging era); Biden years ~13k; 2023+ ~28k.
   Any cross-period volume comparison is dominated by when and how CL was backfilled, not by
   government behavior. Affects: public trend charts, L1 structural volume context.
2. **Court-scoped opinion layer: 0 before 2023-01-20; ~1,300/yr after** (the known #556 gap,
   boundary confirmed; 13 biden_2022 strays via other routes).
3. **LegiScan: zero for trump_2020 and biden_2023, near-zero for biden_2024** (126) vs
   1–2.5k elsewhere. Repairability depends on LegiScan bulk-dataset availability for those
   sessions — to check during #556 planning.
4. **P1 assessment coverage is uniform (98.6–100%)** — after the 2026-07-18 gap-year sweep,
   L2 coverage is no longer an asymmetry. trump_2019 has a ~1.1k-doc tail.
5. **FR is the model citizen** (12.5k–19.8k, smooth) — mediaFreedom's uniform correction shows.
6. **Prompt-version vintage is not recorded on assessments** — assessment rows carry model and
   provider but no prompt version, so cross-vintage P1 drift can be reasoned about only from
   dates. Recommend: store a `prompt_version` on new assessments (small forward-only change).

## Recommendations, with estimated repair costs

_Cost basis (2026-07-19): AI all-in ≈ $1.8–2.5/1k docs (P1+P2, anchored to the R-SEARCH
actual: ~$70–80 for the 41,249-doc gap-year sweep); embeddings negligible (<$5 at any scale
here). All fetches run off local bulk staging (covers 2017→end-2025), so CL API time is zero.
Sizing queries: #556 issue comments (court-scoped) and the docket-first counts below._

- **Repair (queued): #556 court-scoped opinions 2017–2023.** Sized 2026-07-19: 2,348 matched
  substantive clusters, 61% route through the classifier gate → **~2,230 new doc rows.
  AI <$15; fetch minutes; runbook ~half a day** including approval-gated recompute/enrich/
  baseline steps. (Raw cluster counts overcount ~10x — text-less SCOTUS cert-denial orders;
  always filter to substantive.)
- **Repair (large — needs its own product decision): trump_2017/2018 CL thinness.** Staging
  has the data: 29,423 (2017) / 25,260 (2018) matched dockets vs 21,110 for trump_2019 —
  the underlying case volume is comparable-or-higher; the 838/1,742 stored docs are pure
  ingestion history. At trump_2019's stored-rows-per-docket ratio (~2.27), full repair ≈
  **~120k new doc rows. AI ≈ $220–300; review:backfill wall-clock ~2–3 days** (chunkable,
  rate-limited) plus recompute/enrich/baselines for two baseline periods. Alternative:
  disclose-only, or partial repair (dockets without opinion enrichment) at roughly half.
- **Repair (small): LegiScan gaps** (trump_2020, biden_2023, biden_2024). Bulk datasets
  confirmed available for the 116th and 118th Congress (verified 2026-07-19 via
  getDatasetList). Expected ~**4–5k new docs total → AI ≈ $10**; download free; ~1–2h
  wall-clock. Worth folding into the #556 sprint.
- **Disclose (unfixable or not worth unifying):** CL ingestion-era volume differences
  pre-repair; prompt-version vintage for historical assessments; inherent source-depth
  differences. Public disclosure note added to the methodology page (Data Sources section).
  **Cost: $0** (shipped).
- **Forward-only: `prompt_version` column** — **DONE 2026-07-19** (migration 0043, commit
  5381897): stamped on new assessments from constants beside the prompts
  (p1-2026-03-24 / p2-2026-07-10). Historical rows stay NULL. **Cost: $0.**

The detection core (absolute-threshold L2) is unaffected by all of the above; the affected
surfaces are comparative/descriptive: cross-period charts, L1 structural context, aiScore
z-scores vs biden_2022, and NC-4.
