# Backfill Pipeline Redesign

## Problems

### 1. No clear path to bootstrap the system from scratch

Setting up the system requires running multiple commands in a specific order, with undocumented dependencies between them. During Sprint R-S1d, we discovered:

- `pnpm backfill` only covers Trump T2 (2025-01-20 → present) by default. Baselines require a completely separate command (`pnpm build-baseline`) with different flags and different behavior.
- `pnpm build-baseline` only fetches FR documents, even though CL/DOJ/GovInfo/FEC also need baseline data. Those require `pnpm backfill --source X --from Y --to Z`.
- The immigrationEnforcement FR signal URLs used the wrong format, causing 26K junk documents. The error was only caught by noticing suspiciously high counts — there was no automated verification.
- After deleting junk documents, stale `fetch_log` entries blocked re-ingestion ("Skipped 58 weeks — already complete"). This required manual DB cleanup.

### 2. Pipeline stages are inconsistently applied

Different commands execute different subsets of the pipeline stages, leaving documents in partial states:

| Command                       | Ingest        | Score  | Aggregate | Embed  | L1  | L2      | L3  | Convergence  |
| ----------------------------- | ------------- | ------ | --------- | ------ | --- | ------- | --- | ------------ |
| `pnpm backfill --ingest-only` | yes           | yes    | **no**    | **no** | no  | no      | no  | no           |
| `pnpm backfill` (full)        | yes           | yes    | yes       | **no** | no  | no      | no  | keyword-only |
| `pnpm build-baseline`         | yes (FR only) | yes    | yes       | **no** | no  | keyword | no  | no           |
| `pnpm snapshot`               | yes           | yes    | yes       | yes    | yes | yes     | yes | yes          |
| `pnpm legiscan:bulk`          | yes           | **no** | **no**    | **no** | no  | no      | no  | no           |
| `pnpm layer2:backfill`        | no            | no     | no        | no     | no  | yes     | no  | no           |
| `pnpm recompute-scores`       | no            | yes    | no        | no     | no  | no      | no  | no           |

Result: we currently have ~18K documents that are ingested and scored but have no weekly aggregates or embeddings. Baseline stats can't be computed because they depend on weekly aggregates. Layer 3 can't run because it depends on embeddings.

### 3. Sources are treated inconsistently

- FR has its own baseline command (`build-baseline`). CL/DOJ/GovInfo/FEC use `pnpm backfill` with date ranges.
- WH and GDELT are called "rhetoric" and controlled by `--no-rhetoric` / `--rhetoric-only` flags, rather than being treated as sources like everything else.
- LegiScan has its own standalone command (`legiscan:bulk`) that only ingests — no scoring, aggregation, or embedding.

### 4. CLI flags encode methodology decisions

`--model` and `--skip-ai` allow runtime override of which AI models are used. These are methodology decisions (Pass 1 = gpt-4o-mini, Pass 2 = Claude Sonnet) that should be fixed in code, not configurable at the command line. Runtime overrides undermine reproducibility.

### 5. No automated verification

There's no way to check whether a backfill completed correctly. The TEST_SPECIFICATION.md defines completeness criteria (per-source doc counts, all categories have FR/GDELT docs in all baselines, pagination fitness checks), but these aren't implemented as a runnable command.

---

## Pipeline Stages

The full pipeline has 9 stages, divided into two phases:

### Data loading (stages 1–3: no API keys; stage 4: requires `OPENAI_API_KEY`)

| Stage        | What                                                       | Reads from        | Writes to                                     | API keys                    |
| ------------ | ---------------------------------------------------------- | ----------------- | --------------------------------------------- | --------------------------- |
| 1. Ingest    | Fetch documents from sources, store                        | External APIs     | `documents`                                   | Source-specific (some open) |
| 2. Score     | Keyword matching against assessment rules                  | `documents`       | `document_scores`                             | None                        |
| 3. Aggregate | Weekly rollup of scores per category                       | `document_scores` | `weekly_aggregates`                           | None                        |
| 4. Embed     | Generate vector embeddings (OpenAI text-embedding-3-small) | `documents`       | `documents.embedding`, `documents.embeddedAt` | `OPENAI_API_KEY`            |

### Baseline computation (stage 5) — no AI keys required

| Stage             | What                                                             | Reads from                                 | Writes to   |
| ----------------- | ---------------------------------------------------------------- | ------------------------------------------ | ----------- |
| 5. Baseline stats | Mean/stddev of aggregates, embedding centroid, drift noise floor | `weekly_aggregates`, `documents.embedding` | `baselines` |

### Assessment (stages 6–9) — requires AI keys for stage 7

| Stage          | What                                                                              | Reads from                         | Writes to                                                        |
| -------------- | --------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| 6. Layer 1     | Structural anomaly detection (compare aggregates vs baselines)                    | `weekly_aggregates`, `baselines`   | `weekly_aggregates` (structural fields)                          |
| 7. Layer 2     | AI two-pass assessment (gpt-4o-mini flags → Claude Sonnet classifies)             | `documents`                        | `ai_document_assessments`                                        |
| 8. Layer 3     | Thematic drift (week centroid vs 8-week rolling mean, z-score)                    | `documents.embedding`, `baselines` | `weekly_aggregates` (thematic fields)                            |
| 9. Convergence | Synthesize layers into status (Stable → Elevated → Divergent → Confirmed Concern) | Layer 1/2/3 results                | `weekly_aggregates` (convergence fields), `assessment_snapshots` |

### Stage dependencies

```
1. Ingest ──→ 2. Score ──→ 3. Aggregate ──→ 5. Baseline Stats ──→ 6. Layer 1 ──┐
                                                                                │
1. Ingest ──→ 4. Embed ──→ 5. Baseline Stats ──→ 8. Layer 3 ───────────────────┼──→ 9. Convergence
                                                                                │
1. Ingest ──→ 7. Layer 2 ──────────────────────────────────────────────────────┘
```

Note: Layer 2 (stage 7) does NOT depend on baselines — it runs Pass 1/Pass 2 on individual documents independently. However, Convergence (stage 9) depends on Layer 2 output and baseline stats (to compute flag rate z-scores). This means `layer2:backfill` can run in parallel with `compute-baseline-stats`.

---

## Proposed Commands

### `pnpm backfill` — data loading (stages 1–4)

The single command for getting data into the system. Runs ingest → score → aggregate → embed for all sources. Idempotent: each stage skips work that's already done.

**Skip conditions (idempotency):**

| Stage     | Skip condition                                                                     |
| --------- | ---------------------------------------------------------------------------------- |
| Ingest    | `fetch_log` marks week as complete for this source/category                        |
| Score     | Always re-run (cheap, ensures consistency after rule changes)                      |
| Aggregate | Upsert semantics (cheap, always safe to re-run)                                    |
| Embed     | `documents.embeddedAt IS NOT NULL` (already how `embedUnprocessedDocuments` works) |

Key change: the current skip logic skips the **entire week** when `fetch_log` says complete. The new logic skips only the **ingest step**, then still runs score/aggregate/embed on existing documents.

**Flags:**

| Flag               | Purpose                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `--from <date>`    | Start date (default: 2025-01-20)                                                                        |
| `--to <date>`      | End date (default: today)                                                                               |
| `--category <key>` | Filter to one category                                                                                  |
| `--source <type>`  | Filter to one source: `fr`, `courtlistener`, `doj`, `govinfo`, `fec`, `whitehouse`, `gdelt`, `legiscan` |
| `--dry-run`        | Preview without executing                                                                               |

**Removed flags:**

| Flag            | Reason                                                              |
| --------------- | ------------------------------------------------------------------- |
| `--ingest-only` | Backfill always does stages 1–4. Assessment is a separate concern.  |
| `--skip-ai`     | No AI runs in backfill anymore. AI assessment has its own commands. |
| `--model`       | Models are methodology, fixed in code. Not a runtime parameter.     |
| `--no-rhetoric` | WH/GDELT are just sources. Use `--source` to filter.                |

**Source handling:**

All sources are treated uniformly from the CLI perspective. Implementation differences (WH/GDELT cross-feed to categories, LegiScan uses ZIP downloads) are internal.

| Source          | How it works internally                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `fr`            | Per-category signals defined in `categories.ts`                             |
| `courtlistener` | Per-category signals defined in `categories.ts`                             |
| `doj`           | Per-category signals; DOJ taxonomy classifies to categories                 |
| `govinfo`       | Per-category signals defined in `categories.ts`                             |
| `fec`           | Per-category signals defined in `categories.ts`                             |
| `whitehouse`    | Fetched once, classified to categories via `classifyRhetoricToCategories()` |
| `gdelt`         | Fetched once, classified to categories via `classifyRhetoricToCategories()` |
| `legiscan`      | Bulk ZIP download, classified to categories via `classifyBill()`            |

Without `--source`, all applicable sources run. Without `--category`, all categories are processed.

**Note on WH/GDELT + `--category`:** WH and GDELT fetch globally, then classify documents into categories. `--source whitehouse --category civilService` means: fetch WH globally, then only store/score/aggregate/embed documents classified into `civilService`. The `--category` filter applies after classification, not before fetching.

### `pnpm compute-baseline-stats` — baseline computation (stage 5)

Computes baseline statistics from existing data. Reads `weekly_aggregates` and `documents.embedding`, writes to `baselines`. No fetching, no AI.

As a prerequisite, ensures weekly aggregates exist for all weeks in each baseline period (computes any missing ones from `document_scores`).

**Flags:**

| Flag               | Purpose                                                                         |
| ------------------ | ------------------------------------------------------------------------------- |
| `--baseline <id>`  | Specific period (`trump_2017`, `trump_2018`, `biden_2021`, `biden_2022`) or all |
| `--category <key>` | Filter to one category                                                          |

**Replaces:** `pnpm build-baseline` (removed entirely).

### `pnpm snapshot` — full pipeline (stages 1–9)

Runs the complete pipeline: ingest → score → aggregate → embed → Layer 1 → Layer 2 → Layer 3 → convergence → snapshot.

By default runs for today (daily cron, 6am UTC). Accepts `--from`/`--to` to run the full pipeline on a historical date range, enabling retroactive assessment of backfilled data. On already-backfilled weeks, stages 1–4 are effectively no-ops due to idempotency (ingest skipped via fetch_log, embed skipped if already done), so only assessment stages 6–9 run.

**Flags:**

| Flag               | Purpose                     |
| ------------------ | --------------------------- |
| `--from <date>`    | Start date (default: today) |
| `--to <date>`      | End date (default: today)   |
| `--category <key>` | Filter to one category      |

### `pnpm layer2:backfill` — retroactive AI assessment (stage 7)

Runs Layer 2 AI two-pass assessment on existing documents. Unchanged from current behavior.

**Flags:**

| Flag                            | Purpose                |
| ------------------------------- | ---------------------- |
| `--from <date>` / `--to <date>` | Date range             |
| `--category <key>`              | Filter to one category |

### `pnpm recompute-scores` — re-score and re-aggregate (stages 2–3)

Re-runs keyword scoring on existing documents and recomputes weekly aggregates from the new scores. Used after assessment rule changes. Without the re-aggregation step, aggregates computed from old scores would be stale.

### `pnpm backfill:verify` — completeness verification

Checks that all pipeline stages completed correctly. Reports gaps and inconsistencies.

**Checks (derived from TEST_SPECIFICATION.md §Backfill Completeness Verification):**

1. **Document coverage**: For each `(category, source_origin, period)` tuple, report document count. Flag zeroes for expected sources.
2. **Score completeness**: Documents missing `document_scores` entries.
3. **Aggregate completeness**: Weeks with documents but no `weekly_aggregates` entry.
4. **Embedding completeness**: Documents with `embeddedAt IS NULL`.
5. **Baseline completeness**: Baseline periods missing `baselines` entries (centroid, noise floor).
6. **Layer 2 completeness**: T2 documents missing `ai_document_assessments` entries (Pass 1 and Pass 2).
7. **FR signal completeness**: All categories have FR documents in all baseline periods + T2 (TEST_SPEC line 165).
8. **GDELT cross-feed completeness**: All categories have GDELT rhetoric documents in all baseline periods (TEST_SPEC line 169).
9. **Pagination fitness**: CourtListener text-search signals' peak weekly counts vs pagination cap (TEST_SPEC lines 155–163).

**Output format:**

```
=== Document Coverage ===
Category               Source          trump_2017  trump_2018  biden_2021  biden_2022  trump_t2
courts                 federal_reg     ✓ 342       ✓ 298       ✓ 401       ✓ 388       ✓ 312
courts                 courtlistener   ✓ 156       ✓ 201       ✓ 189       ✓ 215       ✓ 178
immigrationEnforcement federal_reg     ✓ 329       ✓ 344       ✓ 282       ✓ 316       ✓ 228
immigrationEnforcement courtlistener   ✗ 0         ✗ 0         ✗ 0         ✗ 0         ✗ 0

=== Stage Completeness ===
Documents missing scores:      0 / 48,291
Documents missing embeddings:  18,090 / 48,291
Weeks missing aggregates:      232 / 1,160
Baselines missing stats:       0 / 56

=== Warnings ===
⚠ immigrationEnforcement has no CourtListener signals defined — expected 0 docs
⚠ 18,090 documents need embedding (run: pnpm backfill)
⚠ 232 weeks need aggregates (run: pnpm backfill)
```

**Flags:**

| Flag               | Purpose                             |
| ------------------ | ----------------------------------- |
| `--category <key>` | Filter to one category              |
| `--json`           | Output as JSON (for CI integration) |

---

## Workflows

### Initial setup (from empty database)

```bash
# 1. Apply schema
pnpm db:migrate

# 2. Load all data (all sources, all periods)
#    Run sources in parallel across terminals for speed.

# Terminal 1: Federal Register
pnpm backfill --source fr --from 2017-01-20 --to 2019-01-19 && \
pnpm backfill --source fr --from 2021-01-20 --to 2023-01-19 && \
pnpm backfill --source fr --from 2025-01-20

# Terminal 2: CourtListener
pnpm backfill --source courtlistener --from 2017-01-20 --to 2019-01-19 && \
pnpm backfill --source courtlistener --from 2021-01-20 --to 2023-01-19 && \
pnpm backfill --source courtlistener --from 2025-01-20

# Terminal 3: DOJ
pnpm backfill --source doj --from 2017-01-20 --to 2019-01-19 && \
pnpm backfill --source doj --from 2021-01-20 --to 2023-01-19 && \
pnpm backfill --source doj --from 2025-01-20

# Terminal 4: GovInfo
pnpm backfill --source govinfo --from 2017-01-20 --to 2019-01-19 && \
pnpm backfill --source govinfo --from 2021-01-20 --to 2023-01-19 && \
pnpm backfill --source govinfo --from 2025-01-20

# Terminal 5: FEC
pnpm backfill --source fec --from 2017-01-20 --to 2019-01-19 && \
pnpm backfill --source fec --from 2021-01-20 --to 2023-01-19 && \
pnpm backfill --source fec --from 2025-01-20

# Terminal 6: LegiScan (bulk ZIP downloads, all periods automatically)
pnpm backfill --source legiscan

# 3. Compute baseline statistics
pnpm compute-baseline-stats

# 4. Run full assessment on historical T2 weeks (stages 6-9)
#    Stages 1-4 are no-ops (already backfilled). layer2:backfill runs
#    in parallel with compute-baseline-stats since L2 doesn't need baselines.
pnpm snapshot --from 2025-01-20

# 5. Verify completeness
pnpm backfill:verify

# 6. Start daily pipeline
pnpm snapshot
```

### Adding a new category

```bash
# 1. Update code (categories.ts, assessment-rules.ts, etc.)
# 2. Backfill FR for all periods
pnpm backfill --source fr --category newCategory --from 2017-01-20 --to 2019-01-19 && \
pnpm backfill --source fr --category newCategory --from 2021-01-20 --to 2023-01-19 && \
pnpm backfill --source fr --category newCategory --from 2025-01-20

# 3. Recompute baseline stats (picks up new category's data)
pnpm compute-baseline-stats

# 4. Run full assessment on T2 for new category (optional, $$$)
pnpm snapshot --from 2025-01-20 --category newCategory

# 5. Verify
pnpm backfill:verify --category newCategory
```

Non-FR sources (CL, DOJ, etc.) don't need `--category` because they classify documents to categories automatically. If a new category routes to an existing source (e.g., adding immigrationEnforcement to DOJ taxonomy), the existing DOJ documents are already in the DB — just re-run `pnpm recompute-scores` and `pnpm compute-baseline-stats`.

### Adding a new source

```bash
# 1. Implement fetcher module
# 2. Add source to backfill pipeline
# 3. Backfill all periods
pnpm backfill --source newsource --from 2017-01-20 --to 2019-01-19 && \
pnpm backfill --source newsource --from 2021-01-20 --to 2023-01-19 && \
pnpm backfill --source newsource --from 2025-01-20

# 4. Recompute baseline stats (new source affects aggregates)
pnpm compute-baseline-stats

# 5. Run full assessment on T2 (optional, $$$)
pnpm snapshot --from 2025-01-20

# 6. Verify
pnpm backfill:verify
```

### Repairing incomplete data

```bash
# 1. Re-run backfill. Idempotent: skips already-completed ingest,
#    fills in missing scores/aggregates/embeddings.
pnpm backfill --from 2017-01-20 --to 2019-01-19
pnpm backfill --from 2021-01-20 --to 2023-01-19
pnpm backfill --from 2025-01-20

# 2. Recompute baseline stats (in case aggregates or embeddings changed)
pnpm compute-baseline-stats

# 3. Re-run AI assessment on T2 (idempotent: skips already-assessed docs)
pnpm layer2:backfill --from 2025-01-20

# 4. Verify
pnpm backfill:verify
```

### Purging and re-ingesting bad data

When a signal query is wrong (e.g., immigrationEnforcement FR URLs fetching all documents unfiltered), documents need to be deleted and re-fetched. The `fetch_log` must also be cleared or the backfill will skip those weeks as "already complete."

```bash
# 1. Delete junk documents and their dependent data
psql $DATABASE_URL -c "
  DELETE FROM document_scores WHERE category = 'immigrationEnforcement'
    AND week_of >= '2025-01-20';
  DELETE FROM documents WHERE category = 'immigrationEnforcement'
    AND source_origin = 'federal_register'
    AND published_at >= '2025-01-20';
  DELETE FROM fetch_log WHERE category = 'immigrationEnforcement'
    AND source_origin = 'federal_register'
    AND week_start >= '2025-01-20';
  DELETE FROM weekly_aggregates WHERE category = 'immigrationEnforcement'
    AND week_of >= '2025-01-20';
"

# 2. Fix the signal query in categories.ts

# 3. Re-run backfill (fetch_log cleared, so ingest will run)
pnpm backfill --source fr --category immigrationEnforcement --from 2025-01-20

# 4. Recompute baseline stats if baseline periods were affected
pnpm compute-baseline-stats

# 5. Verify
pnpm backfill:verify --category immigrationEnforcement
```

### After keyword rule changes

```bash
pnpm recompute-scores         # re-scores + re-aggregates (stages 2-3)
pnpm compute-baseline-stats   # baselines depend on aggregates
```

---

## What Gets Removed

| Item                            | Reason                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `lib/cron/backfill-baseline.ts` | Fetching replaced by `pnpm backfill`. Stats computation replaced by `pnpm compute-baseline-stats`. |
| `pnpm build-baseline` script    | Replaced by the two commands above.                                                                |
| `--ingest-only` flag            | Backfill always does stages 1–4. No partial mode.                                                  |
| `--skip-ai` flag                | Backfill never runs AI. Assessment is separate.                                                    |
| `--model` flag                  | Models are methodology, not runtime config.                                                        |
| `--no-rhetoric` flag            | WH/GDELT are sources. Use `--source` to filter.                                                    |
| `--rhetoric-only` flag          | Use `--source whitehouse` or `--source gdelt`.                                                     |

---

## Relationship to R-S1e (Incremental Snapshot)

The ROADMAP's Sprint R-S1e replaces the daily snapshot's "fetch latest 20" with incremental backfill from last stored date. After R-S1e ships, `pnpm snapshot` effectively becomes a daily incremental backfill + assessment — the same `fetchHistorical` code path serves both `backfill` and `snapshot`, differing only in whether assessment layers run. This should simplify implementation: the fetch logic is shared, and the two commands diverge only at stages 6–9.

---

## Decisions

### 1. Retroactive assessment for historical T2 weeks — Decision: C

Expand `pnpm snapshot` to accept `--from`/`--to`. On already-backfilled data, stages 1–4 are no-ops due to idempotency, so only assessment stages 6–9 run. No separate `pnpm assess` command needed — one command, idempotency handles the rest.

### 2. WH/GDELT as `--source` options — Decision: Yes

Make WH and GDELT `--source` options. Consistent mental model is worth the refactor. `--source whitehouse --category X` means fetch globally, filter after classification. The alternative (leaking implementation details into the CLI via `--no-rhetoric`) is a trap.

### 3. LegiScan integration — Decision: B

Integrate into `pnpm backfill --source legiscan`. Unified CLI even though the internal path (bulk ZIP download) differs from other sources. Aligns with R-S1e ROADMAP design.

### 4. Scope and timing — Decision: Phased, but soon

Phase 1 (urgent — prevents recurring partial-state problem): fix backfill skip logic (run score/aggregate/embed even when ingest is skipped), create `compute-baseline-stats`, create `backfill:verify`, remove `build-baseline`. Phase 2 (ergonomic improvement): source unification (WH/GDELT as `--source`, LegiScan integration), `snapshot --from/--to`, flag cleanup.
