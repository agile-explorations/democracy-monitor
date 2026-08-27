# Glossary — measurement & search-performance shorthand

Plain-language definitions for the shorthand used in R-LOAD (#779/#782)
status messages, load-test reports, and issue comments. Add to this file
whenever a new label, metric, or id appears in a report.

## Metrics

| Term                                       | Meaning                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **p50 / p95**                              | Percentiles. p50 = the median: half of the measured builds were at least this fast. p95 = 95% were at least this fast — the "slow tail". With only 5 probes, p95 is effectively the slowest completed one.                                                                                                                                               |
| **lead metric**                            | The number R-LOAD is judged on (owner-defined 2026-08-25): the wall-clock a first-time user waits for a **cold, novel** Research search — nothing cached anywhere, a question nobody has asked before. Reported as p50 / p95 over the 5 P0 probes. Budget: **30s p50 / 60s p95**.                                                                        |
| **cold / warm**                            | Cold = every cache emptied first (Redis keys for expansion, validation counts, arms, judge picks, in-flight markers) AND the database's page cache not holding the relevant rows. Warm = caches populated by a previous run of the same question. "Attested cold" = the reset script recorded the key counts it cleared, so the report proves the state. |
| **tResults / t_results**                   | Client-measured seconds until the browser would have a usable document list. Quantized by the client's poll cadence (~16s steps), so small deltas between runs can be one poll boundary.                                                                                                                                                                 |
| **tBuildComplete / t_complete**            | Client-measured seconds until the server confirmed the build was cached. Usually equals tResults; differs when the client gave up first.                                                                                                                                                                                                                 |
| **DNF**                                    | "Did not finish": the probe passed the client budget (**240s**) without a usable result. Counted separately (`dnf240s`) and excluded from p50/p95, which is why a DNF can hide inside a good-looking p50.                                                                                                                                                |
| **202s / cuts / 429**                      | Per probe: number of "still building" poll responses; number of Cloudflare 60s edge timeouts the client re-requested through; number of rate-limit rejections (should be 0 — the runner neutralizes rate limits).                                                                                                                                        |
| **totalMs / expansionMs / retrieveWallMs** | Server-side phase timings recorded per build (`search_timings`). `totalMs` is the precise server build time — use it for deltas, since tResults is poll-quantized. Since WO-5, `expansionMs` (time to validated search terms) overlaps `retrieveWallMs` instead of preceding it.                                                                         |
| **stage rows**                             | Server-side per-stage timings inside one build (`seed-expansion`, `seed-vector-action`, `seed-alias-arms`, `seed-mining`, `judge`, `arm-fanout`, …). Defined in `scripts/loadtest/README.md` → "Seed stage rows".                                                                                                                                        |
| **DEGRADED**                               | A server log line meaning a build silently lost work: an alias arm or a validation count timed out after retry and was dropped. Acceptance for any perf change requires zero of these during the run.                                                                                                                                                    |

## Runs and labels

Report files live in `scripts/loadtest/reports/<date>-<profile>-<label>.json`.

| Label                 | What it measured                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P0 / p1 / p2 / p3** | Load-test profiles. **P0** = the lead metric: 5 sequential cold novel Research probes, one user. p1 = browse-only baseline; p2 = browse + one research build; p3 = ramp of concurrent distinct builds. |
| **db-basic4gb**       | Round A baseline on the current prod DB tier (Render basic-4gb, 2 vCPU), 2026-08-26, code v1.16.8.                                                                                                     |
| **c8**                | Same tier after WO-3 (arm/count query concurrency 5→8). The reference point every later run is compared to.                                                                                            |
| **wo2**               | WO-2 arm pruning build (reverted).                                                                                                                                                                     |
| **wo5**               | WO-5 stage-overlap build (`511afef`), knob off.                                                                                                                                                        |
| **wo5-gate8**         | WO-5 build with `DB_WORK_CONCURRENCY=8` (a process-wide cap on concurrent arm + count statements).                                                                                                     |
| **WO-n**              | "Work order n" under #782: WO-1 batched validation SQL (refuted), WO-2 arm pruning (reverted), WO-3 concurrency 8 (adopted), WO-4 chip-wall UX (not started), WO-5 stage overlap (measuring).          |
| **Round A / Round B** | Round A = full profile suite on the current tier. Round B = the same suite on the next DB tier (8GB), only if justified.                                                                               |

## Probe questions (the 5 P0 probes, `scripts/loadtest/questions.json`)

| Id                    | Question                                                                                       | Shape                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **workforce-1a** (1a) | What government documents describe Schedule F reclassification since 2025?                     | enumeration, single window                             |
| **workforce-1b** (1b) | How have federal agencies implemented Schedule F reclassification, and what pushback followed? | comparative → 3 era windows                            |
| **workforce-1c** (1c) | Which court rulings and executive actions address Schedule F reclassification?                 | enumeration, heaviest probe; the recurring DNF (~305s) |
| **workforce-1d** (1d) | What congressional responses have there been to Schedule F reclassification?                   | enumeration                                            |
| **workforce-2a** (2a) | What government documents describe reduction-in-force directives since 2025?                   | enumeration, lightest probe                            |

## Eval questions (the 14 "journalist test" questions, `scripts/completeness-checklists.json`)

Also used by the golden guard. Families: FW = federal workforce, IM = immigration, RL = rule of law / removals, H = hard cases.

| Id  | Question                                                                                                                                                        | Params                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| FW1 | Which members of Congress have spoken on the floor about Schedule F or reclassifying federal employees, and what concerns did they raise?                       | tier=discussion                  |
| FW2 | What OPM and OMB actions have been taken regarding federal workforce restructuring since January 2025?                                                          | from 2025-01-20                  |
| FW3 | What government documents reference both federal workforce reduction and inspector general oversight?                                                           |                                  |
| FW4 | How did congressional responses to the 2020 Schedule F executive order compare to responses to the 2025 reinstatement?                                          | 2 eras                           |
| IM1 | What congressional floor speeches have addressed the expansion of 287(g) agreements between ICE and local law enforcement since 2025?                           | tier=discussion, from 2025-01-20 |
| IM2 | How did detention-related rulemaking under the Biden administration compare to both Trump administrations?                                                      | 3 eras                           |
| IM3 | What government documents reference both immigration enforcement and due process protections?                                                                   |                                  |
| IM4 | How have congressional responses to immigration enforcement actions differed between the first and second Trump administrations?                                | 2 eras                           |
| RL1 | What firings or removals of inspectors general have occurred across federal agencies, and what congressional responses have there been?                         |                                  |
| RL2 | What court opinions and executive branch documents address the President's power to remove independent agency officials?                                        |                                  |
| RL3 | How has the use of executive orders and presidential memoranda to modify federal agency independence compared across administrations since 2017?                | 3 eras                           |
| RL4 | How have DOJ press releases about civil rights enforcement differed across administrations?                                                                     | 3 eras                           |
| H2  | What executive actions, court rulings, and congressional responses address the domestic deployment of the National Guard or military forces since January 2025? | from 2025-01-20                  |
| H3  | What government documents address investigations or prosecutions of individuals the President has publicly named as political adversaries since January 2025?   | from 2025-01-20                  |

## Golden guard (`pnpm retrieval:golden`)

| Term                    | Meaning                                                                                                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **capture A1 / A2**     | Two recordings of retrieval shape on the pre-WO-5 code (`e8ee16b`); their diff is the noise floor.                                                                                                                                           |
| **capture B / B2 / B3** | Recordings on the WO-5 code (`511afef`). B was made before a capture bug was fixed (term names recorded empty); B2/B3 are the valid ones.                                                                                                    |
| **candidatesPreRerank** | The document ids (with the search arm that found each) going into the final ranking — the actual retrieval decision. Must be identical across a scheduling-only change.                                                                      |
| **alsoSearched**        | The search-term chips shown to the user (expansion + corpus-mined + salience terms). Compared as a set.                                                                                                                                      |
| **drift vs noise**      | Drift = a retrieval decision changed (fails the gate). Noise = known run-to-run variation on identical code: final document order (uncached LLM reranker), the trace's re-run narrowing proposal, and salience picks on multi-era questions. |

## Retrieval pipeline stages (one Research build)

| Stage                     | Meaning                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **expansion**             | An LLM proposes search terms for the question; each is validated by counting corpus matches ("validation counts"). Survivors become "aliases".                                                                                  |
| **vectors**               | Semantic (embedding) search, one query per document tier (action / discussion).                                                                                                                                                 |
| **arms**                  | Per-alias keyword searches (full-text) returning ranked document ids. "Alias arms" = from expansion; "mined arms" = from terms mined out of the vector candidates' text; "salience arms" = hot entities picked by an LLM judge. |
| **mining**                | Extract entity phrases from the vector candidates' text, validate them like aliases, run them as arms.                                                                                                                          |
| **fusion / fuse-hydrate** | Merge vector results with arm results (rank fusion), fetch the full rows for winners.                                                                                                                                           |
| **judge / arm-fanout**    | The salience stage: LLM picks hot entities; their arms run; guaranteed slots reserved for their hits.                                                                                                                           |
| **rerank**                | Final LLM pass ordering candidates by bearing on the question (uncached, nondeterministic).                                                                                                                                     |
