/**
 * Read-only audit for #528: court-scoped CL opinion queries + opinion classifier tuning.
 *
 * NO DATABASE WRITES. Fetches candidate opinions from the CourtListener API,
 * caches them to a local JSON file, and reports how the opinion classifier
 * would route them — per-query and per-category volumes, matched-term
 * frequencies, unmatched rates, samples, and a marquee-case checklist.
 *
 * Usage:
 *   source .env.prod.local && tsx scripts/audit-cl-court-routing.ts --fetch    # query CL + cache texts (~30-45 min)
 *   tsx scripts/audit-cl-court-routing.ts --analyze                            # run classifier over cache
 *   tsx scripts/audit-cl-court-routing.ts --analyze --cap 8000 --no-excludes   # variant sweeps
 *   source .env.prod.local && tsx scripts/audit-cl-court-routing.ts --probe-districts  # size all-districts follow-up
 */

import fs from 'fs';
import path from 'path';
import { TOPIC_ROUTING_TERMS } from '@/lib/data/topic-routing-terms';
import {
  buildOpinionDataFromSubOpinions,
  CL_API_V4,
  getAuthHeaders,
  RATE_LIMIT_DELAY_MS,
} from '@/lib/services/courtlistener-fetcher';
import {
  classifyOpinionToCategories,
  matchesTerm,
  OPINION_CLASSIFY_TEXT_CAP,
} from '@/lib/services/crec-classifier';
import { sleep } from '@/lib/utils/async';
import { fetchWithRetry } from '@/lib/utils/fetch-retry';

const CACHE_PATH = path.join(process.cwd(), '.audit-cl-court-cache.json');
const FROM = '2025-01-20';
const TO = new Date().toISOString().slice(0, 10);
const SAMPLE_SIZE = 5;

export const EXEC_POWER_QUERY =
  '"executive order" OR "presidential authority" OR "separation of powers" OR impoundment OR "unitary executive" OR "removal power"';
const CIRCUITS = 'ca1 ca2 ca3 ca4 ca5 ca6 ca7 ca8 ca9 ca10 ca11 cadc cafc';

const QUERIES: Array<{ key: string; court: string; q?: string }> = [
  { key: 'scotus-all', court: 'scotus' },
  { key: 'circuits-exec', court: CIRCUITS, q: EXEC_POWER_QUERY },
  { key: 'dcd-exec', court: 'dcd', q: EXEC_POWER_QUERY },
];

/** Marquee cases that MUST be captured (recall checklist). */
const MARQUEE: Array<{ label: string; caseNameRe: RegExp }> = [
  { label: 'Trump v. Slaughter (FTC removal)', caseNameRe: /slaughter/i },
  {
    label: 'Birthright citizenship (NJ v. Trump / Trump v. Barbara)',
    caseNameRe: /barbara|new jersey v\.? trump/i,
  },
  { label: 'Alien Enemies (Trump v. J.G.G.)', caseNameRe: /j\.? ?g\.? ?g/i },
  { label: 'CREW v. OMB (impoundment)', caseNameRe: /responsibility and ethics/i },
  { label: 'Protect Democracy v. OMB (impoundment)', caseNameRe: /protect democracy/i },
];

interface CachedOpinion {
  queryKeys: string[];
  clusterId: number;
  caseName: string;
  court: string;
  dateFiled: string;
  text: string; // head only — enough for classification sweeps
}

interface SearchRow {
  cluster_id?: number;
  docket_id?: number;
  caseName?: string;
  court?: string;
  dateFiled?: string;
  opinions?: { id?: number }[];
}

const CACHE_TEXT_HEAD = 20_000;

async function clSearch(params: Record<string, string>): Promise<SearchRow[]> {
  const rows: SearchRow[] = [];
  let next: string | null = `${CL_API_V4}/search/?${new URLSearchParams(params).toString()}`;
  while (next) {
    const res: Response = await fetchWithRetry(
      next,
      { headers: getAuthHeaders() },
      { label: 'audit-cl-search', timeoutMs: 30_000 },
    );
    if (!res.ok) throw new Error(`CL HTTP ${res.status}`);
    const data = (await res.json()) as { next?: string | null; results?: SearchRow[] };
    rows.push(...(data.results ?? []));
    next = data.next ?? null;
    if (next) await sleep(RATE_LIMIT_DELAY_MS);
  }
  return rows;
}

async function fetchPhase(): Promise<void> {
  const byCluster = new Map<number, { row: SearchRow; queryKeys: string[] }>();
  for (const q of QUERIES) {
    const params: Record<string, string> = {
      type: 'o',
      court: q.court,
      filed_after: FROM,
      filed_before: TO,
    };
    if (q.q) params.q = q.q;
    console.log(`[fetch] query ${q.key}...`);
    const rows = await clSearch(params);
    console.log(`[fetch]   ${rows.length} clusters`);
    for (const row of rows) {
      if (!row.cluster_id) continue;
      const entry = byCluster.get(row.cluster_id) ?? { row, queryKeys: [] };
      entry.queryKeys.push(q.key);
      byCluster.set(row.cluster_id, entry);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }
  console.log(`[fetch] ${byCluster.size} unique clusters; fetching opinion texts...`);

  const cached: CachedOpinion[] = [];
  let i = 0;
  for (const { row, queryKeys } of byCluster.values()) {
    i++;
    const ids = (row.opinions ?? [])
      .map((o) => o.id)
      .filter((id): id is number => typeof id === 'number')
      .map(String);
    if (ids.length === 0) continue;
    try {
      const opData = await buildOpinionDataFromSubOpinions(ids, row.dateFiled ?? TO);
      if (!opData) continue;
      cached.push({
        queryKeys,
        clusterId: row.cluster_id!,
        caseName: row.caseName ?? '(untitled)',
        court: row.court ?? '?',
        dateFiled: row.dateFiled ?? '?',
        text: opData.text.slice(0, CACHE_TEXT_HEAD),
      });
    } catch (err) {
      console.warn(`[fetch] cluster ${row.cluster_id} skipped: ${(err as Error).message}`);
    }
    if (i % 50 === 0) {
      console.log(`[fetch] ${i}/${byCluster.size} clusters, ${cached.length} texts cached`);
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cached)); // checkpoint
    }
  }
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cached));
  console.log(`[fetch] Done: ${cached.length} opinions cached → ${CACHE_PATH}`);
}

function loadCache(): CachedOpinion[] {
  if (!fs.existsSync(CACHE_PATH)) {
    console.error(`No cache at ${CACHE_PATH} — run with --fetch first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
}

function matchedTermsFor(op: CachedOpinion, categories: string[], cap: number): string {
  const searchText = `${op.caseName} ${op.text.slice(0, cap)}`.toLowerCase();
  return categories
    .map((cat) => {
      const hits = (TOPIC_ROUTING_TERMS[cat] ?? []).filter((t) => matchesTerm(searchText, t));
      return `${cat}[${hits.slice(0, 3).join(', ')}]`;
    })
    .join(' ');
}

function analyzePhase(opts: { cap: number; useExcludes: boolean }): void {
  const cache = loadCache();
  const classifyOpts = {
    textCap: opts.cap,
    ...(opts.useExcludes ? {} : { excludes: {}, additions: {} }),
  };

  console.log(
    `\n=== ANALYZE: cap=${opts.cap} excludes=${opts.useExcludes ? 'ON' : 'OFF'} (${cache.length} opinions) ===`,
  );

  const byQuery: Record<string, { total: number; routed: number }> = {};
  const byCategory: Record<string, CachedOpinion[]> = {};
  const termFreq: Record<string, number> = {};
  const unrouted: CachedOpinion[] = [];

  for (const op of cache) {
    const cats = classifyOpinionToCategories(op.caseName, op.text, classifyOpts);
    for (const key of op.queryKeys) {
      byQuery[key] = byQuery[key] ?? { total: 0, routed: 0 };
      byQuery[key].total++;
      if (cats.length > 0) byQuery[key].routed++;
    }
    if (cats.length === 0) {
      unrouted.push(op);
      continue;
    }
    const searchText = `${op.caseName} ${op.text.slice(0, opts.cap)}`.toLowerCase();
    for (const cat of cats) {
      (byCategory[cat] = byCategory[cat] ?? []).push(op);
      for (const t of TOPIC_ROUTING_TERMS[cat] ?? []) {
        if (matchesTerm(searchText, t))
          termFreq[`${cat}:${t}`] = (termFreq[`${cat}:${t}`] ?? 0) + 1;
      }
    }
  }

  console.log('\nPer-query routing:');
  for (const [key, s] of Object.entries(byQuery)) {
    console.log(
      `  ${key.padEnd(15)} ${s.routed}/${s.total} routed (${((100 * s.routed) / s.total).toFixed(0)}%)`,
    );
  }

  console.log('\nPer-category volumes:');
  for (const [cat, ops] of Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${cat.padEnd(25)} ${ops.length}`);
  }

  console.log('\nTop matched terms:');
  for (const [key, n] of Object.entries(termFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)) {
    console.log(`  ${String(n).padStart(4)}  ${key}`);
  }

  console.log('\nMarquee checklist:');
  for (const m of MARQUEE) {
    const hit = cache.find((op) => m.caseNameRe.test(op.caseName));
    if (!hit) {
      console.log(`  ✗ MISSING: ${m.label}`);
      continue;
    }
    const cats = classifyOpinionToCategories(hit.caseName, hit.text, classifyOpts);
    const mark = cats.length > 0 ? '✓' : '✗ UNROUTED';
    console.log(
      `  ${mark} ${m.label} → "${hit.caseName}" (${hit.court}, ${hit.dateFiled}) → [${cats.join(', ')}]`,
    );
  }

  console.log('\nPer-category samples (evenly spaced):');
  for (const [cat, ops] of Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n--- ${cat} (${ops.length}) ---`);
    const step = Math.max(1, Math.floor(ops.length / SAMPLE_SIZE));
    for (const op of ops.filter((_, i) => i % step === 0).slice(0, SAMPLE_SIZE)) {
      console.log(
        `  • "${op.caseName}" (${op.court}, ${op.dateFiled}) [${op.queryKeys.join(',')}]`,
      );
      console.log(`    ${matchedTermsFor(op, [cat], opts.cap)}`);
    }
  }

  console.log(`\nUnrouted: ${unrouted.length}/${cache.length} — samples:`);
  const step = Math.max(1, Math.floor(unrouted.length / 10));
  for (const op of unrouted.filter((_, i) => i % step === 0).slice(0, 10)) {
    console.log(`  • "${op.caseName}" (${op.court}) [${op.queryKeys.join(',')}]`);
  }
}

async function probeDistricts(): Promise<void> {
  const params = new URLSearchParams({
    type: 'o',
    q: EXEC_POWER_QUERY,
    filed_after: FROM,
    filed_before: TO,
  });
  const res = await fetchWithRetry(
    `${CL_API_V4}/search/?${params}`,
    { headers: getAuthHeaders() },
    { label: 'audit-cl-probe', timeoutMs: 30_000 },
  );
  const data = (await res.json()) as { count?: number };
  console.log(`All-courts exec-power query count (unscoped, incl. state noise): ${data.count}`);
  console.log('(dcd-only is in the main audit; use this to size an all-districts follow-up)');
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(name);
  const value = (name: string, dflt: number) => {
    const i = args.indexOf(name);
    return i >= 0 ? parseInt(args[i + 1], 10) : dflt;
  };

  if (flag('--fetch')) await fetchPhase();
  if (flag('--probe-districts')) await probeDistricts();
  if (flag('--analyze') || (!flag('--fetch') && !flag('--probe-districts'))) {
    analyzePhase({
      cap: value('--cap', OPINION_CLASSIFY_TEXT_CAP),
      useExcludes: !flag('--no-excludes'),
    });
  }
}

main().catch((err) => {
  console.error('[audit] Fatal:', err);
  process.exit(1);
});
