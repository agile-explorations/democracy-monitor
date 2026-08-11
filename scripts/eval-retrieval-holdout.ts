/**
 * Pre-registered holdout validation for hybrid retrieval (#702).
 *
 * The tuning canary (eval-retrieval-combo.ts) iterated 8 times on 10 cases —
 * an over-fitting risk. This harness runs SEVEN journalist-style questions the
 * tuning never saw (the untested outreach questions, minus contact details),
 * through the REAL searchResearch path, baseline (HYBRID_RETRIEVAL_DISABLED=1)
 * vs hybrid, exactly once. Truth matchers were written before the first run
 * and must not be edited afterwards; if the holdout regresses, tune on the
 * original 10 cases only and re-validate on a fresh holdout.
 *
 * Usage: npx tsx scripts/eval-retrieval-holdout.ts
 */

import type { ResearchDocument } from '@/lib/services/search-service';

interface HoldoutCase {
  name: string;
  query: string;
  dateFrom?: string;
  truth: (t: string) => boolean;
}

const CASES: HoldoutCase[] = [
  {
    name: 'grant-funding-control',
    query:
      'What executive actions, proposed rules, and congressional responses address political control over federal grant funding since January 2025?',
    dateFrom: '2025-01-20',
    truth: (t) => /grant/i.test(t) && /fund|omb|appropriat|impound/i.test(t),
  },
  {
    name: 'collective-bargaining-termination',
    query:
      'What court filings and executive orders address the termination of federal employee collective bargaining agreements since March 2025?',
    dateFrom: '2025-03-01',
    truth: (t) => /collective bargaining|union|afge|nffe|labor relations/i.test(t),
  },
  {
    name: 'immigration-data-sharing',
    query:
      'What interagency agreements and memoranda authorize sharing federal data with immigration enforcement, and what court challenges have they drawn since January 2025?',
    dateFrom: '2025-01-20',
    truth: (t) => /data|information.shar|records/i.test(t) && /immigra|ice\b|enforcement/i.test(t),
  },
  {
    name: 'sanctuary-jurisdiction-penalties',
    query:
      'What federal actions, court filings, and congressional statements address penalties for local jurisdictions that decline immigration enforcement cooperation?',
    truth: (t) => /sanctuary|287\(g\)|jurisdiction|sheriff|local law enforcement/i.test(t),
  },
  {
    name: 'ice-vehicle-pursuits',
    query:
      'What government documents and court filings address ICE vehicle pursuits and traffic stops, and how have enforcement directives about them changed since 2025?',
    dateFrom: '2025-01-20',
    truth: (t) => /vehicle|pursuit|traffic stop|checkpoint/i.test(t) || /ice\b.*directive/i.test(t),
  },
  {
    name: 'ice-cbp-funding-comparison',
    query:
      'How has congressional funding legislation for ICE and CBP compared across the last three administrations?',
    truth: (t) =>
      /appropriat|funding|budget|reconciliation/i.test(t) &&
      /ice\b|cbp|customs and border|immigration and customs|homeland security/i.test(t),
  },
  {
    name: 'dhs-ig-independence',
    query:
      'What congressional statements and government reports address DHS Inspector General independence across administrations since 2017?',
    truth: (t) => /inspector general/i.test(t) && /dhs|homeland/i.test(t),
  },
];

async function runCases(label: string): Promise<Map<string, number>> {
  const { searchResearch } = await import('@/lib/services/search-service');
  const results = new Map<string, number>();
  for (const c of CASES) {
    const docs: ResearchDocument[] = await searchResearch(
      c.query,
      30,
      undefined,
      c.dateFrom,
      undefined,
      'all',
    );
    const hits = docs.filter((d) =>
      c.truth(`${d.title} ${d.content ?? ''} ${d.matchSnippet ?? ''}`),
    ).length;
    results.set(c.name, hits);
    console.log(`  [${label}] ${c.name.padEnd(36)} ${String(hits).padStart(2)}/${docs.length}`);
  }
  return results;
}

async function main(): Promise<void> {
  console.log('[holdout] baseline (HYBRID_RETRIEVAL_DISABLED=1):');
  process.env.HYBRID_RETRIEVAL_DISABLED = '1';
  const baseline = await runCases('base');

  console.log('[holdout] hybrid:');
  delete process.env.HYBRID_RETRIEVAL_DISABLED;
  const hybrid = await runCases('hyb');

  let b = 0;
  let h = 0;
  let regressions = 0;
  console.log('\n=== HOLDOUT (pre-registered, run once) ===');
  for (const c of CASES) {
    const bv = baseline.get(c.name) ?? 0;
    const hv = hybrid.get(c.name) ?? 0;
    b += bv;
    h += hv;
    if (hv < bv) regressions++;
    console.log(
      `${c.name.padEnd(36)} baseline ${String(bv).padStart(2)} | hybrid ${String(hv).padStart(2)}${hv < bv ? '  ⚠ REGRESSION' : ''}`,
    );
  }
  console.log(`\nTOTALS: baseline ${b} | hybrid ${h} | per-case regressions: ${regressions}`);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[holdout] Fatal:', err);
      process.exit(1);
    });
}
