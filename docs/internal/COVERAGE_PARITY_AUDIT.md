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

## Recommendations

- **Repair (queued):** #556 court-scoped opinions 2017–2023 — and its plan should now also
  weigh the trump_2017/2018 CL thinness (a bulk-backfill question, bigger than opinions).
- **Repair (investigate):** LegiScan gaps for the three affected periods, if bulk datasets exist.
- **Disclose (unfixable or not worth unifying):** CL ingestion-era volume differences
  pre-repair; prompt-version vintage for historical assessments; inherent source-depth
  differences. Public disclosure note added to the methodology page (Data Sources section).
- **Forward-only:** `prompt_version` column on ai_document_assessments (file when convenient).

The detection core (absolute-threshold L2) is unaffected by all of the above; the affected
surfaces are comparative/descriptive: cross-period charts, L1 structural context, aiScore
z-scores vs biden_2022, and NC-4.
