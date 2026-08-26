/**
 * Load-test collector (#781): finalize a raw run file with server-side
 * stage rows (search_timings via /api/health/search-timings) and incidents
 * (Render events + log markers), compute percentiles, and emit a summary.
 *
 * Usage:
 *   LOADTEST_BASE_URL=... CRON_SECRET=... [RENDER_API_KEY=... LOADTEST_SERVICE_ID=...] \
 *     npx tsx scripts/loadtest/collect.ts scripts/loadtest/reports/<run>.json
 *   npx tsx scripts/loadtest/collect.ts --compare A.json B.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { assertNotProd } from './guard';

type Num = number | null;
interface RawRun {
  run: { profile: string; label: string; startedAt: string; endedAt: string; baseUrl: string };
  probes: Array<{ id: string; hash: string; tResultsMs: Num; tBuildCompleteMs: Num }>;
  browse: Array<{ endpoint: string; ms: number; status: number }>;
  health: Array<{ ms: number; status: number }>;
}

export function pct(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function summarize(raw: RawRun, timingRows: Array<Record<string, unknown>>) {
  const tResults = raw.probes.map((p) => p.tResultsMs).filter((v): v is number => v !== null);
  const tComplete = raw.probes
    .map((p) => p.tBuildCompleteMs)
    .filter((v): v is number => v !== null);
  const healthMs = raw.health.map((h) => h.ms);
  const byEndpoint: Record<string, number[]> = {};
  raw.browse.forEach((b) => (byEndpoint[b.endpoint] ??= []).push(b.ms));
  const stageAgg: Record<string, number[]> = {};
  for (const row of timingRows) {
    for (const w of (row.windows as Array<{ key: string; searchMs: number }>) ?? []) {
      (stageAgg[w.key] ??= []).push(w.searchMs);
    }
    for (const k of ['embed_ms', 'expansion_ms', 'retrieve_wall_ms', 'total_ms'] as const) {
      if (row[k] != null) (stageAgg[k] ??= []).push(Number(row[k]));
    }
  }
  return {
    leadMetric: { coldNovelP50Ms: pct(tResults, 50), coldNovelP95Ms: pct(tResults, 95) },
    research: {
      launched: raw.probes.length,
      completedInBudget: tResults.length,
      dnf240s: raw.probes.filter((p) => p.tResultsMs === null).length,
      tResultsMs: { p50: pct(tResults, 50), p95: pct(tResults, 95), max: pct(tResults, 100) },
      tBuildCompleteMs: { p50: pct(tComplete, 50), p95: pct(tComplete, 95) },
    },
    stages: Object.fromEntries(
      Object.entries(stageAgg).map(([k, v]) => [k, { p50: pct(v, 50), p95: pct(v, 95) }]),
    ),
    browse: Object.fromEntries(
      Object.entries(byEndpoint).map(([k, v]) => [k, { p50: pct(v, 50), p95: pct(v, 95) }]),
    ),
    health: {
      p50Ms: pct(healthMs, 50),
      p95Ms: pct(healthMs, 95),
      maxMs: pct(healthMs, 100),
      over5s: raw.health.filter((h) => h.ms > 5_000 || h.status !== 200).length,
    },
  };
}

async function fetchTimingRows(raw: RawRun): Promise<Array<Record<string, unknown>>> {
  const base = process.env.LOADTEST_BASE_URL ?? raw.run.baseUrl;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn('CRON_SECRET unset — skipping server-side stage rows');
    return [];
  }
  const res = await fetch(`${base}/api/health/search-timings?days=1&limit=1000`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    console.warn(`search-timings HTTP ${res.status} — skipping stage rows`);
    return [];
  }
  const body = (await res.json()) as { rows: Array<Record<string, unknown>> };
  const hashes = new Set(raw.probes.map((p) => p.hash));
  const from = Date.parse(raw.run.startedAt) - 60_000;
  return body.rows.filter(
    (r) =>
      hashes.has(String(r.queryHash ?? r.query_hash)) &&
      Date.parse(String(r.measuredAt ?? r.measured_at)) >= from,
  );
}

function compare(fileA: string, fileB: string): void {
  const a = JSON.parse(readFileSync(fileA, 'utf8'));
  const b = JSON.parse(readFileSync(fileB, 'utf8'));
  const rows: string[] = [
    `| metric | ${a.run.label} | ${b.run.label} |`,
    '|---|---|---|',
    `| cold novel p50 | ${a.summary?.leadMetric?.coldNovelP50Ms ?? '-'} | ${b.summary?.leadMetric?.coldNovelP50Ms ?? '-'} |`,
    `| cold novel p95 | ${a.summary?.leadMetric?.coldNovelP95Ms ?? '-'} | ${b.summary?.leadMetric?.coldNovelP95Ms ?? '-'} |`,
    `| DNF at 240s | ${a.summary?.research?.dnf240s ?? '-'} | ${b.summary?.research?.dnf240s ?? '-'} |`,
    `| health p95 / over5s | ${a.summary?.health?.p95Ms ?? '-'} / ${a.summary?.health?.over5s ?? '-'} | ${b.summary?.health?.p95Ms ?? '-'} / ${b.summary?.health?.over5s ?? '-'} |`,
  ];
  console.log(rows.join('\n'));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--compare') {
    compare(args[1], args[2]);
    return;
  }
  const file = args[0];
  if (!file) {
    console.error('usage: loadtest:collect <run.json> | --compare <A.json> <B.json>');
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(file, 'utf8')) as RawRun & { summary?: unknown };
  assertNotProd({ baseUrl: process.env.LOADTEST_BASE_URL ?? raw.run.baseUrl });
  const timingRows = await fetchTimingRows(raw);
  const summary = summarize(raw, timingRows);
  writeFileSync(file, JSON.stringify({ ...raw, summary, timingRows }, null, 1));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`finalized: ${file}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[collect] failed:', err);
    process.exit(1);
  });
}
