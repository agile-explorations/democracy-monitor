/**
 * Retrieval golden diff (#782 WO-5): captures the retrieval SHAPE of a set
 * of questions — final document ids in order, pre-rerank candidates with
 * their arm provenance, validated expansion terms, and the "also searched"
 * chips — from `?debug=1` docsOnly builds, then diffs two captures.
 *
 * Purpose: a scheduling-only change (stage overlap) must leave every
 * retrieval decision byte-identical. Run with WARM caches (LLM proposals,
 * validation counts, arms cached for the data week) so the LLM draw is
 * shared and the comparison is deterministic; an empty diff is the
 * shape-drift guard, any difference escalates to the full eval pair.
 *
 * Usage:
 *   npx tsx scripts/retrieval-golden-diff.ts --base URL --out FILE [--loadtest N] [--eval] [--skip=A,B] [--pace MS]
 *   npx tsx scripts/retrieval-golden-diff.ts --diff A.json B.json
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';
import { diffShapes } from '@/lib/utils/retrieval-golden';
import type { RetrievalShape as Shape } from '@/lib/utils/retrieval-golden';

const USAGE = `Usage:
  npx tsx scripts/retrieval-golden-diff.ts --base URL --out FILE [--loadtest N] [--eval] [--skip=A,B] [--pace MS]
  npx tsx scripts/retrieval-golden-diff.ts --diff A.json B.json

  --base URL      Server to capture from (dev). Debug builds skip the payload cache.
  --out FILE      Capture output (JSON).
  --loadtest N    First N questions of scripts/loadtest/questions.json (default 5 = the P0 probes).
  --eval          Add the 14 completeness-eval questions (scripts/completeness-checklists.json).
  --skip=A,B      Leave out question ids (e.g. one whose debug build exceeds the 60s edge cut).
  --pace MS       Pause between questions (default 15000 — stays under the 20 req / 5 min limit).
  --diff A B      Compare two captures; exit 1 on retrieval-shape drift (candidates or validated terms).
                  Reranker order and the trace's narrowing draw are reported as noise, not drift.`;

interface Question {
  id: string;
  q: string;
  params: Record<string, string>;
}

interface Capture {
  capturedAt: string;
  base: string;
  shapes: Shape[];
}

const DEFAULT_PACE_MS = 15_000;
const COALESCE_WAIT_MS = 15_000;
const RETRY_WAIT_MS = 30_000;
const MAX_ATTEMPTS = 6;
const FETCH_TIMEOUT_MS = 300_000;

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function loadQuestions(args: string[]): Question[] {
  const n = Number(argValue(args, '--loadtest') ?? 5);
  const loadtest = JSON.parse(
    readFileSync(path.join(__dirname, 'loadtest', 'questions.json'), 'utf8'),
  ) as Array<{ id: string; q: string }>;
  const out: Question[] = loadtest.slice(0, n).map((q) => ({ id: q.id, q: q.q, params: {} }));
  if (args.includes('--eval')) {
    const checklists = JSON.parse(
      readFileSync(path.join(__dirname, 'completeness-checklists.json'), 'utf8'),
    ) as { questions: Question[] };
    out.push(...checklists.questions);
  }
  const skip = new Set((argValue(args, '--skip') ?? '').split(',').map((x) => x.trim()));
  return out.filter((q) => !skip.has(q.id));
}

interface DebugPayload {
  documents?: Array<{ id: number }>;
  /** Plain strings on the wire; tolerate the object form too. */
  alsoSearched?: Array<string | { phrase: string }>;
  trace?: {
    expansion?: Array<{ window: { key: string }; validated: Array<{ phrase: string }> }>;
    candidatesPreRerank?: Array<{ id: number; matchedAlias?: string; era?: string }>;
  };
}

async function fetchDebugBuild(base: string, item: Question, attempt = 0): Promise<DebugPayload> {
  const params = new URLSearchParams({
    q: item.q,
    mode: 'research',
    docsOnly: '1',
    debug: '1',
    ...item.params,
  });
  try {
    const res = await fetch(`${base}/api/search?${params}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 202) {
      await sleep(COALESCE_WAIT_MS);
      return fetchDebugBuild(base, item, attempt);
    }
    if (res.status === 429) throw new Error('rate limited');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as DebugPayload;
    if (!body.documents?.length) throw new Error('empty documents payload');
    if (!body.trace) throw new Error('no debug trace in payload');
    return body;
  } catch (err) {
    if (attempt + 1 >= MAX_ATTEMPTS) throw err;
    console.log(`  ${item.id}: ${(err as Error).message}; retry in ${RETRY_WAIT_MS / 1000}s`);
    await sleep(RETRY_WAIT_MS);
    return fetchDebugBuild(base, item, attempt + 1);
  }
}

function toShape(item: Question, body: DebugPayload): Shape {
  return {
    id: item.id,
    q: item.q,
    documents: (body.documents ?? []).map((d) => d.id),
    candidates: (body.trace?.candidatesPreRerank ?? []).map((c) => ({
      id: c.id,
      matchedAlias: c.matchedAlias ?? null,
      era: c.era ?? null,
    })),
    validated: (body.trace?.expansion ?? []).map((e) => ({
      window: e.window.key,
      phrases: e.validated.map((v) => v.phrase),
    })),
    alsoSearched: (body.alsoSearched ?? []).map((a) => (typeof a === 'string' ? a : a.phrase)),
  };
}

async function capture(args: string[]): Promise<void> {
  const base = argValue(args, '--base');
  const out = argValue(args, '--out');
  if (!base || !out) throw new Error(USAGE);
  const pace = Number(argValue(args, '--pace') ?? DEFAULT_PACE_MS);
  const questions = loadQuestions(args);
  const shapes: Shape[] = [];
  for (const item of questions) {
    const t0 = Date.now();
    const body = await fetchDebugBuild(base, item);
    const shape = toShape(item, body);
    shapes.push(shape);
    console.log(
      `${item.id}: ${shape.documents.length} docs, ${shape.candidates.length} candidates, ` +
        `${shape.alsoSearched.length} terms (${Math.round((Date.now() - t0) / 1000)}s)`,
    );
    await sleep(pace);
  }
  const result: Capture = { capturedAt: new Date().toISOString(), base, shapes };
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`wrote ${out} (${shapes.length} questions)`);
}

function diff(args: string[]): number {
  const i = args.indexOf('--diff');
  const [aPath, bPath] = [args[i + 1], args[i + 2]];
  if (!aPath || !bPath) throw new Error(USAGE);
  const a = JSON.parse(readFileSync(aPath, 'utf8')) as Capture;
  const b = JSON.parse(readFileSync(bPath, 'utf8')) as Capture;
  const byId = new Map(b.shapes.map((s) => [s.id, s]));
  let differing = 0;
  for (const sa of a.shapes) {
    const sb = byId.get(sa.id);
    if (!sb) {
      console.log(`${sa.id}: MISSING in B`);
      differing++;
      continue;
    }
    const { drift, noise } = diffShapes(sa, sb);
    const noiseNote = noise.length ? ` [noise: ${noise.join('; ')}]` : '';
    if (drift.length === 0) {
      console.log(`${sa.id}: identical${noiseNote}`);
    } else {
      differing++;
      console.log(`${sa.id}: DRIFT — ${drift.join('; ')}${noiseNote}`);
    }
  }
  console.log(
    `\n${a.shapes.length - differing}/${a.shapes.length} identical (A ${a.capturedAt} vs B ${b.capturedAt})`,
  );
  return differing === 0 ? 0 : 1;
}

async function main() {
  const args = process.argv.slice(2);
  checkHelp(args, USAGE);
  if (args.includes('--diff')) {
    process.exit(diff(args));
  }
  await capture(args);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
