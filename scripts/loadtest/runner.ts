/**
 * Load-test runner (#781).
 *
 * Usage:
 *   LOADTEST_BASE_URL=<dev web url> npx tsx scripts/loadtest/runner.ts \
 *     --profile=p0 --label=db-basic4gb [--questions=0:5]
 *
 * Writes a raw run JSON to scripts/loadtest/reports/<date>-<profile>-<label>.json
 * (finalized by collect.ts with server-side stage rows + incidents).
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { hashQuery, researchProbe } from './client';
import type { ProbeResult } from './client';
import { assertNotProd } from './guard';
import { BROWSE_ENDPOINTS, PROFILES } from './profiles';

interface BankQuestion {
  id: string;
  family: string;
  q: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

/** The eval + prewarm questions are measurement instruments whose caches
 *  must never be touched by load runs — assert disjointness at startup. */
function assertBankExclusions(bank: BankQuestion[]): void {
  const reserved = new Set<string>();
  const checklists = JSON.parse(
    readFileSync(path.join('scripts', 'completeness-checklists.json'), 'utf8'),
  ) as { questions: Array<{ q: string }> };
  checklists.questions.forEach((q) => reserved.add(hashQuery(q.q)));
  const prewarm = JSON.parse(
    readFileSync(path.join('scripts', 'prewarm-questions.json'), 'utf8'),
  ) as Array<{ url: string }>;
  prewarm.forEach((p) => {
    const q = new URL(p.url).searchParams.get('q');
    if (q) reserved.add(hashQuery(q));
  });
  const clash = bank.filter((b) => reserved.has(hashQuery(b.q)));
  if (clash.length > 0) {
    console.error(
      `Question bank collides with reserved questions: ${clash.map((c) => c.id).join(', ')}`,
    );
    process.exit(1);
  }
}

/** One browse VU: loop the read-path endpoints with jittered think time. */
async function browseVu(
  baseUrl: string,
  vu: number,
  durationS: number,
  sink: Array<{ endpoint: string; ms: number; status: number }>,
): Promise<void> {
  const headers = { 'cf-connecting-ip': `203.0.113.${100 + vu}` };
  const end = Date.now() + durationS * 1000;
  let i = vu; // stagger starting endpoint per VU
  while (Date.now() < end) {
    const endpoint = BROWSE_ENDPOINTS[i++ % BROWSE_ENDPOINTS.length];
    const t0 = Date.now();
    let status = 0;
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      status = res.status;
      await res.arrayBuffer();
    } catch {
      status = -1;
    }
    sink.push({ endpoint: endpoint.split('?')[0], ms: Date.now() - t0, status });
    await sleep(2_000 + Math.floor(Math.random() * 3_000));
  }
}

/** Health sampler: /api/health/live every 5s for the whole run. */
function healthSampler(
  baseUrl: string,
  sink: Array<{ ms: number; status: number }>,
): { stop: () => void } {
  let active = true;
  void (async () => {
    while (active) {
      const t0 = Date.now();
      let status = 0;
      try {
        const res = await fetch(`${baseUrl}/api/health/live`, {
          signal: AbortSignal.timeout(15_000),
        });
        status = res.status;
      } catch {
        status = -1;
      }
      sink.push({ ms: Date.now() - t0, status });
      await sleep(5_000);
    }
  })();
  return { stop: () => (active = false) };
}

async function main(): Promise<void> {
  const baseUrl = process.env.LOADTEST_BASE_URL;
  if (!baseUrl) {
    console.error('LOADTEST_BASE_URL is required (dev web service url)');
    process.exit(1);
  }
  assertNotProd({ baseUrl });
  const profile = PROFILES[arg('profile') ?? ''];
  if (!profile) {
    console.error('--profile=p0|p1|p2|p3 is required');
    process.exit(1);
  }
  const label = arg('label') ?? 'unlabeled';
  const bank = JSON.parse(
    readFileSync(path.join('scripts', 'loadtest', 'questions.json'), 'utf8'),
  ) as BankQuestion[];
  assertBankExclusions(bank);
  const [qOffset, qCount] = (arg('questions') ?? '0:50').split(':').map(Number);
  const questions = bank.slice(qOffset, qOffset + qCount);

  const startedAt = new Date().toISOString();
  console.log(`[loadtest] ${profile.key} (${profile.title}) label=${label} base=${baseUrl}`);

  const browseRows: Array<{ endpoint: string; ms: number; status: number }> = [];
  const healthRows: Array<{ ms: number; status: number }> = [];
  const probes: ProbeResult[] = [];
  const health = healthSampler(baseUrl, healthRows);
  const work: Promise<unknown>[] = [];

  for (let vu = 0; vu < profile.browseVus; vu++) {
    work.push(browseVu(baseUrl, vu, profile.browseDurationS, browseRows));
  }

  let qi = 0;
  const launchProbe = () => {
    const q = questions[qi++];
    if (!q) return null;
    console.log(`[loadtest] probe ${q.id}: ${q.q.slice(0, 60)}...`);
    return researchProbe(baseUrl, q.id, q.q, `203.0.113.${10 + (qi % 80)}`).then((r) => {
      probes.push(r);
      console.log(
        `[loadtest] probe ${r.id}: t_results=${r.tResultsMs} t_complete=${r.tBuildCompleteMs} 202s=${r.n202} cuts=${r.nEdgeCuts}`,
      );
    });
  };

  if (profile.sequentialProbes > 0) {
    const delayS = profile.key === 'p2' ? 60 : 0;
    work.push(
      (async () => {
        await sleep(delayS * 1000);
        for (let i = 0; i < profile.sequentialProbes; i++) {
          const p = launchProbe();
          if (!p) break;
          await p;
          await sleep(profile.sequentialGapS * 1000);
        }
      })(),
    );
  }
  const rampProbes: Promise<unknown>[] = [];
  if (profile.ramp.length > 0) {
    // Stages run sequentially; probes WITHIN a stage launch on the interval
    // without awaiting completion (that's the point of the ramp).
    work.push(
      (async () => {
        for (const stage of profile.ramp) {
          for (let i = 0; i < stage.probes; i++) {
            const p = launchProbe();
            if (!p) return;
            rampProbes.push(p);
            await sleep(stage.intervalS * 1000);
          }
        }
      })(),
    );
  }

  await Promise.all(work);
  await Promise.all(rampProbes);
  health.stop();

  const out = {
    run: {
      profile: profile.key,
      label,
      startedAt,
      endedAt: new Date().toISOString(),
      baseUrl,
      questionSlice: `${qOffset}:${qCount}`,
    },
    probes,
    browse: browseRows,
    health: healthRows,
  };
  const file = path.join(
    'scripts',
    'loadtest',
    'reports',
    `${startedAt.slice(0, 10)}-${profile.key}-${label}.json`,
  );
  writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`[loadtest] raw run written: ${file} (finalize with loadtest:collect)`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[loadtest] failed:', err);
    process.exit(1);
  });
}
