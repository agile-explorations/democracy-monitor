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
import { LEAD_BUDGET } from './profiles';

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
    // The endpoint returns drizzle camelCase; older captures were snake_case.
    for (const k of ['embedMs', 'expansionMs', 'retrieveWallMs', 'totalMs'] as const) {
      const v = row[k] ?? row[camelToSnake(k)];
      if (v != null) (stageAgg[k] ??= []).push(Number(v));
    }
  }
  const cache = cacheSummary(timingRows);
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
    cache,
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

const camelToSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

interface CacheStats {
  armHits: number;
  armMisses: number;
  countHits: number;
  countMisses: number;
}

/** Arm / validation-count cache hit rates over the run's build rows (#787). */
export function cacheSummary(timingRows: Array<Record<string, unknown>>) {
  const totals = { armHits: 0, armMisses: 0, countHits: 0, countMisses: 0 };
  let rows = 0;
  for (const row of timingRows) {
    const s = (row.cacheStats ?? row.cache_stats) as CacheStats | null | undefined;
    if (!s) continue;
    rows += 1;
    totals.armHits += s.armHits;
    totals.armMisses += s.armMisses;
    totals.countHits += s.countHits;
    totals.countMisses += s.countMisses;
  }
  const rate = (h: number, m: number) =>
    h + m === 0 ? null : Math.round((100 * h) / (h + m)) / 100;
  return {
    rows,
    armHitRate: rate(totals.armHits, totals.armMisses),
    countHitRate: rate(totals.countHits, totals.countMisses),
  };
}

export interface ProbeMedian {
  id: string;
  /** Median client wall-clock over the reports; null when at least half DNF'd. */
  medianMs: number | null;
  runs: number;
}

/** Per-probe median across N raw reports of the same profile — the unit
 *  the interleaved protocol compares (#786). Pure. */
export function probeMedians(reports: RawRun[]): ProbeMedian[] {
  const byId = new Map<string, Array<number | null>>();
  for (const r of reports) {
    for (const p of r.probes) (byId.get(p.id) ?? byId.set(p.id, []).get(p.id)!).push(p.tResultsMs);
  }
  return [...byId].map(([id, values]) => {
    const finished = values.filter((v): v is number => v != null);
    const dnf = values.length - finished.length;
    // At least half the runs DNF'd → the probe's median is a DNF.
    const medianMs = dnf * 2 >= values.length ? null : pct(finished, 50);
    return { id, medianMs, runs: values.length };
  });
}

export interface GateVerdict {
  p50Ms: number | null;
  p95Ms: number | null;
  dnf: number;
  pass: boolean;
  reasons: string[];
}

/** Budget verdict over per-probe medians. Pure. */
export function evaluateGate(medians: ProbeMedian[], budget = LEAD_BUDGET): GateVerdict {
  const finished = medians.map((m) => m.medianMs).filter((v): v is number => v != null);
  const dnf = medians.length - finished.length;
  const p50Ms = pct(finished, 50);
  const p95Ms = pct(finished, 95);
  const reasons: string[] = [];
  if (p50Ms == null || p50Ms > budget.p50Ms)
    reasons.push(`p50 ${p50Ms ?? 'n/a'} > ${budget.p50Ms}`);
  if (p95Ms == null || p95Ms > budget.p95Ms)
    reasons.push(`p95 ${p95Ms ?? 'n/a'} > ${budget.p95Ms}`);
  if (dnf > budget.maxDnf) reasons.push(`${dnf} probe(s) DNF > ${budget.maxDnf}`);
  return { p50Ms, p95Ms, dnf, pass: reasons.length === 0, reasons };
}

function loadReports(list: string): RawRun[] {
  return list.split(',').map((f) => JSON.parse(readFileSync(f.trim(), 'utf8')) as RawRun);
}

function gate(list: string): number {
  const reports = loadReports(list);
  const medians = probeMedians(reports);
  for (const m of medians)
    console.log(`${m.id}: median ${m.medianMs ?? 'DNF'} ms over ${m.runs} run(s)`);
  const v = evaluateGate(medians);
  console.log(
    `lead metric (medians over ${reports.length} report(s)): p50 ${v.p50Ms ?? 'n/a'} / p95 ${v.p95Ms ?? 'n/a'} / DNF ${v.dnf} — budget p50 ≤ ${LEAD_BUDGET.p50Ms}, p95 ≤ ${LEAD_BUDGET.p95Ms}, DNF ≤ ${LEAD_BUDGET.maxDnf}`,
  );
  console.log(v.pass ? 'GATE PASS' : `GATE FAIL: ${v.reasons.join('; ')}`);
  return v.pass ? 0 : 1;
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

function compare(listA: string, listB: string): void {
  const a = loadReports(listA);
  const b = loadReports(listB);
  const label = (rs: RawRun[]) =>
    `${rs[0].run.label}${rs.length > 1 ? ` (median of ${rs.length})` : ''}`;
  const ma = probeMedians(a);
  const mb = new Map(probeMedians(b).map((m) => [m.id, m]));
  const va = evaluateGate(ma);
  const vb = evaluateGate([...mb.values()]);
  const rows: string[] = [`| probe / metric | ${label(a)} | ${label(b)} |`, '|---|---|---|'];
  for (const m of ma)
    rows.push(`| ${m.id} | ${m.medianMs ?? 'DNF'} | ${mb.get(m.id)?.medianMs ?? 'DNF'} |`);
  rows.push(
    `| cold novel p50 | ${va.p50Ms ?? '-'} | ${vb.p50Ms ?? '-'} |`,
    `| cold novel p95 | ${va.p95Ms ?? '-'} | ${vb.p95Ms ?? '-'} |`,
    `| DNF probes | ${va.dnf} | ${vb.dnf} |`,
  );
  console.log(rows.join('\n'));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--compare') {
    compare(args[1], args[2]);
    return;
  }
  if (args[0] === '--gate') {
    process.exit(gate(args[1]));
  }
  const file = args[0];
  if (!file) {
    console.error(
      'usage: loadtest:collect <run.json> | --compare <A1,A2,...> <B1,B2,...> | --gate <R1,R2,...>',
    );
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
