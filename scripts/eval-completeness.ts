/**
 * Completeness eval — the "Journalist Test" (#738).
 *
 * Scores research answers against a web-researched, domain-expert ground
 * truth (scripts/completeness-checklists.json): for each checklist item, is
 * the evidencing document (a) in the corpus, (b) retrieved into the 30-doc
 * payload, (c) reflected in the synthesized answer? Misses classify as
 * SOURCE-GAP / RETRIEVAL-GAP / SYNTHESIS-GAP, so a falling score names the
 * layer that regressed.
 *
 * First run (2026-08-18): corpus 97% present, CORE answer pass 47%. Sprint
 * R-JOURNALIST acceptance: CORE pass ≥ 70%, zero per-question regressions.
 *
 * Usage:
 *   npx tsx scripts/eval-completeness.ts [--base URL] [--questions FW2,H3]
 *     [--capture-dir DIR] [--skip-capture] [--skip-corpus]
 *     [--baseline FILE] [--out FILE]
 *
 * Capture hits the live API: one docsOnly fetch (cached for prewarmed
 * questions) and ONE streamed synthesis per question (~ordinary page-visit
 * cost), serially with pacing under the search rate limit. Corpus checks
 * need DATABASE_URL. `--baseline` compares a prior --out file and exits 1
 * on any per-question CORE regression (the regression gate).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';

interface EvalQuestion {
  id: string;
  q: string;
  params: Record<string, string>;
}
interface ChecklistItem {
  qid: string;
  key: string;
  name: string;
  patterns: string[];
  answerKeys?: string[];
  weight: 'CORE' | 'SECONDARY';
  sourceGap: boolean;
  analytical?: boolean;
}
interface ItemResult {
  qid: string;
  key: string;
  weight: string;
  corpus: string;
  corpusMatches: number;
  retrieved: string;
  synthesized: string;
  verdict: string;
}
interface QuestionSummary {
  qid: string;
  core: number;
  coreOk: number;
  corePassRate: number;
}

const PACING_MS = 15_000; // two passes of 14 questions under 20 req / 5 min
const CAPTURE_TIMEOUT_MS = 180_000;

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

function qs(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

/** docsOnly fetch with 202-coalescing and edge-timeout retries (the
 *  production client's behavior). */
/** 202-coalescing patience: the heaviest cold build measured 1,100s
 *  (2026-08-24), so waiting out an in-flight build needs ~20 min. */
const COALESCE_MAX_POLLS = 80;

async function fetchDocs(
  base: string,
  item: EvalQuestion,
  attempt = 0,
  coalescePolls = 0,
): Promise<unknown> {
  const url = `${base}/api/search?${qs({ q: item.q, mode: 'research', docsOnly: '1', ...item.params })}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS) });
    // 202 MUST be checked before ok — res.ok covers all of 2xx, and a
    // coalescing body has no documents, which the empty-payload guard would
    // misread as a degraded build (bit run 2 on 2026-08-24).
    if (res.status === 202) {
      if (coalescePolls >= COALESCE_MAX_POLLS) {
        throw new Error(`${item.id} still coalesced after ${coalescePolls} polls`);
      }
      await sleep(15_000);
      return fetchDocs(base, item, attempt, coalescePolls + 1);
    }
    // .json() inside the try: an edge-killed response can 200 then die
    // mid-body, which must retry like any transport failure (2026-08-24).
    if (res.ok) {
      const body = (await res.json()) as { documents?: unknown[] };
      // A degraded build can answer 200 with zero documents; for these
      // questions that is never legitimate — retry, don't capture it.
      if (body.documents?.length) return body;
      throw new Error('empty documents payload');
    }
    throw new Error(`${item.id} docsOnly HTTP ${res.status}`);
  } catch (err) {
    if (attempt >= 8) throw err;
    console.log(`  ${item.id}: fetch failed, retry ${attempt + 1} in 30s`);
    await sleep(30_000);
    return fetchDocs(base, item, attempt + 1, coalescePolls);
  }
}

async function streamAnswer(
  base: string,
  item: EvalQuestion,
  docs: { documents?: Array<{ id: number }>; docsKey?: string },
): Promise<string> {
  const ids = (docs.documents ?? []).map((d) => d.id).join(',');
  if (!ids) throw new Error(`${item.id}: no documents retrieved`);
  const url = `${base}/api/search/stream?${qs({ q: item.q, ids, dk: docs.docsKey ?? '', ...item.params })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok || !res.body) throw new Error(`${item.id} stream HTTP ${res.status}`);
  let answer = '';
  let buf = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const ev = JSON.parse(line.slice(6)) as { type: string; text?: string };
        if (ev.type === 'chunk') answer += ev.text ?? '';
      } catch {
        /* keep-alives and partial frames are expected */
      }
    }
  }
  return answer;
}

async function capture(base: string, questions: EvalQuestion[], captureDir: string): Promise<void> {
  for (const q of questions) {
    const docsPath = path.join(captureDir, `${q.id}.docs.json`);
    const answerPath = path.join(captureDir, `${q.id}.answer.md`);
    if (existsSync(answerPath)) {
      console.log(`  ${q.id}: capture exists, skipping`);
      continue;
    }
    console.log(`== capturing ${q.id}`);
    const docs = (await fetchDocs(base, q)) as { documents?: Array<{ id: number }> };
    writeFileSync(docsPath, JSON.stringify(docs, null, 1));
    await sleep(3_000);
    let answer = '';
    for (let tries = 0; ; tries++) {
      try {
        answer = await streamAnswer(base, q, docs);
        break;
      } catch (err) {
        // Mid-stream socket deaths (edge timeout) retry like fetchDocs does.
        if (tries >= 2) throw err;
        console.log(`  ${q.id}: stream failed, retry ${tries + 1} in 30s`);
        await sleep(30_000);
      }
    }
    writeFileSync(answerPath, answer);
    console.log(`  ${q.id}: docs=${docs.documents?.length ?? 0} answer=${answer.length}ch`);
    await sleep(PACING_MS);
  }
}

/** Title-pattern match count with a full-text phrase fallback — floor
 *  speeches and hearings carry generic titles, so a zero title count alone
 *  is not corpus absence. */
async function corpusMatches(item: ChecklistItem): Promise<number> {
  const db = getDb();
  let total = 0;
  for (const pat of item.patterns) {
    const r = await db.execute(
      sql`SELECT count(*)::int AS n FROM documents WHERE title ILIKE ${pat}`,
    );
    total += Number((r.rows[0] as { n: number }).n);
  }
  if (total > 0) return total;
  const phrase = item.patterns
    .map((p) => p.replaceAll('%', ' ').trim())
    .sort((a, b) => b.length - a.length)[0];
  if (!phrase) return 0;
  const r = await db.execute(
    sql`SELECT count(*)::int AS n FROM documents
        WHERE search_rank_vector @@ phraseto_tsquery('english', ${phrase})`,
  );
  return Number((r.rows[0] as { n: number }).n);
}

function patternRegex(p: string): RegExp {
  const parts = p
    .split('%')
    .filter(Boolean)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(parts.join('.*'), 'i');
}

function scoreItem(
  item: ChecklistItem,
  corpusCount: number | null,
  docs: Array<{ title?: string }> | null,
  answer: string | null,
): ItemResult {
  let retrieved = 'n/a';
  if (!item.analytical && docs) {
    const regexes = item.patterns.map(patternRegex);
    retrieved = docs.some((d) => regexes.some((re) => re.test(d.title ?? ''))) ? 'YES' : 'NO';
  }
  let synthesized = 'n/a';
  if (answer !== null) {
    const keys = [
      ...(item.answerKeys ?? []),
      ...item.patterns.flatMap((p) => p.split('%').filter((s) => s.length > 4)),
    ];
    synthesized = keys.some((k) => answer.toLowerCase().includes(k.toLowerCase())) ? 'YES' : 'NO';
  }
  let verdict: string;
  if (item.analytical) {
    verdict = synthesized === 'YES' ? 'OK-ANALYTICAL' : 'SYNTHESIS-GAP(analytical)';
  } else if (corpusCount !== null && corpusCount === 0) {
    verdict = item.sourceGap ? 'SOURCE-GAP(expected)' : 'SOURCE-GAP(!)';
  } else if (retrieved === 'NO' && synthesized === 'NO') {
    verdict = 'RETRIEVAL-GAP';
  } else if (synthesized === 'NO') {
    verdict = 'SYNTHESIS-GAP';
  } else {
    verdict = 'OK';
  }
  return {
    qid: item.qid,
    key: item.key,
    weight: item.weight,
    corpus: corpusCount === null ? 'SKIPPED' : corpusCount > 0 ? 'PRESENT' : 'ABSENT',
    corpusMatches: corpusCount ?? -1,
    retrieved,
    synthesized,
    verdict,
  };
}

function summarize(results: ItemResult[]): QuestionSummary[] {
  const byQ = new Map<string, { core: number; coreOk: number }>();
  for (const r of results) {
    if (r.weight !== 'CORE') continue;
    const s = byQ.get(r.qid) ?? { core: 0, coreOk: 0 };
    s.core++;
    if (r.verdict.startsWith('OK')) s.coreOk++;
    byQ.set(r.qid, s);
  }
  return [...byQ.entries()]
    .map(([qid, s]) => ({ qid, ...s, corePassRate: s.core > 0 ? s.coreOk / s.core : 1 }))
    .sort((a, b) => a.qid.localeCompare(b.qid));
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: npx tsx scripts/eval-completeness.ts [options]

Options:
  --base URL          API base (default https://democracymonitor.us)
  --questions A,B     Only these question ids
  --capture-dir DIR   Where captures live (default .eval-completeness)
  --skip-capture      Score existing captures only
  --skip-corpus       Skip corpus-presence checks (no DATABASE_URL needed)
  --baseline FILE     Prior --out file; exit 1 on per-question CORE regression
  --out FILE          Write full results JSON`,
  );
  const base = argValue(args, '--base') ?? 'https://democracymonitor.us';
  const captureDir = argValue(args, '--capture-dir') ?? '.eval-completeness';
  const only = argValue(args, '--questions')?.split(',');
  const baselinePath = argValue(args, '--baseline');
  const outPath = argValue(args, '--out');
  const skipCapture = args.includes('--skip-capture');
  const skipCorpus = args.includes('--skip-corpus');

  const checklist = JSON.parse(
    readFileSync(path.join(__dirname, 'completeness-checklists.json'), 'utf8'),
  ) as { questions: EvalQuestion[]; items: ChecklistItem[] };
  const questions = checklist.questions.filter((q) => !only || only.includes(q.id));
  const items = checklist.items.filter((i) => !only || only.includes(i.qid));

  mkdirSync(captureDir, { recursive: true });
  if (!skipCapture) await capture(base, questions, captureDir);

  if (!skipCorpus && !isDbAvailable()) {
    console.error('DATABASE_URL not configured (use --skip-corpus to score without it)');
    process.exit(2);
  }

  const results: ItemResult[] = [];
  for (const item of items) {
    const docsPath = path.join(captureDir, `${item.qid}.docs.json`);
    const answerPath = path.join(captureDir, `${item.qid}.answer.md`);
    const docs = existsSync(docsPath)
      ? ((JSON.parse(readFileSync(docsPath, 'utf8')) as { documents?: Array<{ title?: string }> })
          .documents ?? null)
      : null;
    const answer = existsSync(answerPath) ? readFileSync(answerPath, 'utf8') : null;
    const corpusCount = skipCorpus || item.analytical ? null : await corpusMatches(item);
    results.push(scoreItem(item, corpusCount, docs, answer));
  }

  const summary = summarize(results);
  const totalCore = summary.reduce((a, s) => a + s.core, 0);
  const totalOk = summary.reduce((a, s) => a + s.coreOk, 0);

  console.log('\n=== COMPLETENESS SUMMARY ===');
  for (const s of summary) {
    console.log(
      `  ${s.qid.padEnd(4)} CORE ${s.coreOk}/${s.core} (${Math.round(s.corePassRate * 100)}%)`,
    );
  }
  console.log(
    `  TOTAL CORE pass: ${totalOk}/${totalCore} (${Math.round((totalOk / totalCore) * 100)}%)`,
  );
  const misses = results.filter((r) => r.weight === 'CORE' && !r.verdict.startsWith('OK'));
  if (misses.length > 0) {
    console.log('\nCORE misses:');
    for (const m of misses) {
      console.log(
        `  ${m.qid} ${m.key}: ${m.verdict} (corpus=${m.corpus}:${m.corpusMatches}, retrieved=${m.retrieved}, synth=${m.synthesized})`,
      );
    }
  }

  if (outPath) {
    writeFileSync(outPath, JSON.stringify({ ranAt: null, summary, results }, null, 1));
    console.log(`\nResults written to ${outPath}`);
  }

  if (baselinePath) {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as {
      summary: QuestionSummary[];
    };
    const regressions = summary.filter((s) => {
      const prev = baseline.summary.find((b) => b.qid === s.qid);
      return prev && s.coreOk < prev.coreOk;
    });
    if (regressions.length > 0) {
      console.error(
        `\nCORE REGRESSIONS vs ${baselinePath}: ${regressions.map((r) => r.qid).join(', ')}`,
      );
      process.exit(1);
    }
    console.log(`\nNo per-question CORE regressions vs ${baselinePath}`);
  }
}

run().catch((err) => {
  console.error('[eval-completeness] failed:', err);
  process.exit(2);
});
