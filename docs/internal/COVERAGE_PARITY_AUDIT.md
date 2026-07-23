# Coverage-Parity Audit (#557)

_Read-only measurement, 2026-07-19; matrix refreshed 2026-07-22 after the R-PARITY repair
(#556: court-scoped opinions 2017–2023, LegiScan full-term ranges, gap-backlog L2 sweep —
147 owner-accepted baseline status upgrades). Companion to the coverage-parity standing
constraint (PROJECT_KNOWLEDGE.md). Counts exclude retrieval-annotated and metadata-only docs._

## The matrix (docs by period × source) — post-repair, 2026-07-22

| Period     | Total      | FR     | CL         | CREC   | LegiScan | DOJ   | GovInfo | Court-scoped opinions | P1 coverage |
| ---------- | ---------- | ------ | ---------- | ------ | -------- | ----- | ------- | --------------------- | ----------- |
| trump_2017 | 26,345     | 12,512 | **1,124**  | 5,914  | 2,550    | 625   | 2,903   | 284                   | 100%        |
| trump_2018 | 26,749     | 13,141 | **2,023**  | 5,643  | 1,191    | 807   | 3,167   | 281                   | 100%        |
| trump_2019 | **81,585** | 14,641 | **48,115** | 11,757 | 2,476    | 1,039 | 3,007   | 306                   | 100%        |
| trump_2020 | 70,230     | 15,571 | 42,074     | 6,348  | 1,476    | 939   | 3,223   | 455                   | 100%        |
| biden_2021 | 37,812     | 14,896 | 13,590     | 3,954  | 1,212    | 860   | 2,853   | 339                   | 100%        |
| biden_2022 | 38,144     | 15,236 | 13,911     | 3,401  | 765      | 1,102 | 3,262   | 335                   | 100%        |
| biden_2023 | 56,797     | 15,087 | 28,492     | 8,119  | 1,378    | 1,239 | 2,059   | 1,278                 | 100%        |
| biden_2024 | 60,521     | 16,569 | 29,393     | 9,022  | 997      | 1,623 | 2,502   | 1,311                 | 100%        |
| trump_t2   | 65,585     | 20,088 | 28,532     | 8,920  | 2,407    | 1,503 | 3,571   | 2,272                 | 100%        |

_Note: T2's higher court-scoped count reflects its longer window (18 months vs 12) and a
busier executive-power docket, not a coverage difference — the queries are now uniform._

**Pre-repair matrix (2026-07-19), for the record:** trump_2017 had 838 CL / 0 court-scoped;
trump_2018 1,742 / 0; trump_2020 and biden_2023 had 0 LegiScan; biden_2024 had 126; P1
coverage ranged 98.6–100%. All repaired except trump_2017/2018 general CL depth (below).

## Findings, ranked by surface visibility (status as of 2026-07-22)

1. **REPAIRED to source limits (#565 + #566, 2026-07-22→23).** The "3x asymmetry" decomposed
   into three parts once measured properly: (a) missing substantive opinions — already
   repaired by #556's base branch (~3.1k docs); (b) ~4.3k genuinely absent rows — copied
   (#565, 47 P1 calls ≈ $0.02); (c) the dominant term: **inconsistent scoring policy across
   ingestion eras** — the 2019-era pipeline scored every docket stub into the weekly counts
   (503 docs/week) while current rules don't (75/week). Owner chose substantive-only counts
   everywhere (#566): 119,298 stub/orphan score rows purged, scoring now enforces the L2
   content floor at every site, all periods re-aggregated/re-enriched. **Outcome:
   lawEnforcement avg docs/week now 50 (2017) / 103 (2019) / 76 (2023) / 89 (2026)** — the
   residual spread reflects CourtListener's own archive coverage growing after 2018, a
   source-side reality disclosed on the methodology page, not an ingestion artifact. Zero
   status flips in either repair (verified by pre/post snapshot both times).
2. **REPAIRED (#556, 2026-07-20→22) — court-scoped opinion layer** now uniform 2017→present
   (280–455/yr baseline years; T2's higher count reflects its longer window and busier
   executive-power docket).
3. **REPAIRED (#556 + 0b93752) — LegiScan** now covers all full terms (997–2,550/period); the
   root cause was BASELINE_PERIODS ending terms at year 2, so the weekly cron maintains
   coverage going forward.
4. **REPAIRED — P1 assessment coverage is exactly 100% in every period** (the #556 chain also
   swept the 602-doc residual backlog incl. trump_2019's 565 tail).
5. **FR is the model citizen** (12.5k–20.1k, smooth) — mediaFreedom's uniform correction shows.
6. **SHIPPED (5381897, migration 0043) — `prompt_version`** stamped on all new assessments
   (p1-2026-03-24 / p2-2026-07-10); historical rows stay NULL by design.

## Sizing lessons (2026-07-23, after three consecutive over-estimates)

The trump_2017/2018 estimate fell from $220–300 → $150–250 → $20–40 → **$0.02 actual** across
four passes. Standing rules now:

1. **Three numbers before any repair proposal:** source-matched count, net-new after
   anti-join against current prod, and assessable after eligibility filters. Rows are never
   the cost unit; assessable content is.
2. **Findings sharing substrate are re-sized after any sibling repair** (#556's base branch
   quietly repaired most of finding #1's opinions; nothing re-measured until execution).
3. **Volume metrics measure scoring policy, not just data** — before calling a count
   asymmetry a data gap, check whether the eras scored the same things.

## Recommendations, with estimated repair costs

_Cost basis (2026-07-19, REVISED 2026-07-21 after #563): the original $1.8–2.5/1k anchor
(R-SEARCH actuals) was inflated by the duplicate-P2 defects fixed in #563 — P2 re-called the
model for already-assessed docs and the dead --pass flag ran the pipeline twice. Post-fix
measured unit cost (#556 chain, rows actually written): ~$4.5/1k for opinion-heavy corpora
(long P2 inputs), of which P1 is trivial and Sonnet P2 on the flagged subset dominates.
Pre-#563 estimates would have blown out 5–10x on any large review:backfill; post-fix they
hold. Embeddings negligible (<$5 at any scale here). All fetches run off local bulk staging
(covers 2017→end-2025), so CL API time is zero. Sizing queries: #556 issue comments
(court-scoped) and the docket-first counts below._

- **Repair (queued): #556 court-scoped opinions 2017–2023.** Sized 2026-07-19: 2,348 matched
  substantive clusters, 61% route through the classifier gate → **~2,230 new doc rows.
  AI <$15; fetch minutes; runbook ~half a day** including approval-gated recompute/enrich/
  baseline steps. (Raw cluster counts overcount ~10x — text-less SCOTUS cert-denial orders;
  always filter to substantive.)
- **Repair (large — needs its own product decision): trump_2017/2018 CL thinness.** Staging
  has the data: 29,423 (2017) / 25,260 (2018) matched dockets vs 21,110 for trump_2019 —
  the underlying case volume is comparable-or-higher; the 838/1,742 stored docs are pure
  ingestion history. At trump_2019's stored-rows-per-docket ratio (~2.27), full repair ≈
  **~120k new doc rows. AI ≈ $150–250 post-#563** (P1 ~$40; Sonnet P2 on the flagged subset
  dominates; the prior $220–300 figure was calibrated on duplicate-inflated actuals — without
  the #563 fix this job would have run $500–900); **review:backfill wall-clock ~2–3 days**
  (chunkable, rate-limited) plus recompute/enrich/baselines for two baseline periods. Alternative:
  disclose-only, or partial repair (dockets without opinion enrichment) at roughly half.
  **Plus a calibration review** — a 3–5x corpus change for two baseline years materially
  moves structural volume baselines and NC denominators, so this repair carries costs the
  small repairs don't: before/after NC-margin capture (`pnpm nc:margins`, tooling exists),
  threshold review if any margin moves near its limit (NC-1 ≤20%, NC-3 ≤12/15%, NC-5 ≤5%),
  an owner-adjudicated routing/assessment sample (~50–100 docs, 1–2h owner time, the #548
  pattern), and a full backtest + retrospective re-run (compute only). Estimate:
  **+0.5–1 day engineering, 1–2h owner adjudication, <$5 AI** on top of the repair itself —
  more if margins force actual threshold changes (that re-opens the 39/39 + 6/6 validation
  loop, ~1 additional day).
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
