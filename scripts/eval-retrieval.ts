/**
 * Retrieval evaluation harness (#702): entity-anchored questions whose
 * discussions are known to live inside broader documents. For each case,
 * runs research retrieval and scores how many of the retrieved docs actually
 * contain the entity pattern. Deterministic apart from embedding calls
 * (~$0.001/run); used to compare retrieval variants before/after changes.
 *
 * Usage: npx tsx scripts/eval-retrieval.ts [--label before|after] [--out FILE]
 */
async function main() {
  interface EvalCase {
    name: string;
    query: string;
    entity: RegExp;
    dateFrom: string;
    dateTo: string;
    tier: 'all' | 'action' | 'discussion';
  }

  const CASES: EvalCase[] = [
    {
      name: 'schedule-f-trump1',
      query: 'congressional responses to the 2020 Schedule F executive order',
      entity: /schedule f/i,
      dateFrom: '2020-01-01',
      dateTo: '2021-01-19',
      tier: 'discussion',
    },
    {
      name: 'schedule-f-trump2',
      query: 'congressional responses to the 2025 Schedule F reinstatement',
      entity: /schedule f/i,
      dateFrom: '2025-01-20',
      dateTo: '2026-12-31',
      tier: 'discussion',
    },
    {
      name: 'comey-firing',
      query: 'congressional reaction to the firing of FBI Director James Comey',
      entity: /comey/i,
      dateFrom: '2017-05-01',
      dateTo: '2017-12-31',
      tier: 'discussion',
    },
    {
      name: 'ig-firings-2025',
      query: 'congressional response to the mass firing of inspectors general',
      entity: /inspectors? general/i,
      dateFrom: '2025-01-20',
      dateTo: '2025-12-31',
      tier: 'discussion',
    },
    {
      name: 'travel-ban',
      query: 'floor debate over the travel ban executive order',
      entity: /travel ban|refugee/i,
      dateFrom: '2017-01-20',
      dateTo: '2017-12-31',
      tier: 'discussion',
    },
    {
      name: 'loper-bright',
      query: 'congressional discussion of the Loper Bright decision overturning Chevron deference',
      entity: /loper bright|chevron/i,
      dateFrom: '2024-06-01',
      dateTo: '2025-01-19',
      tier: 'discussion',
    },
    {
      name: 'anti-weaponization-fund',
      query: 'debate over the Anti-Weaponization Fund and the IRS settlement',
      entity: /weaponization/i,
      dateFrom: '2026-06-01',
      dateTo: '2026-12-31',
      tier: 'discussion',
    },
    {
      name: 'blanche-confirmation',
      query: 'Senate debate on the confirmation of Todd Blanche as Attorney General',
      entity: /blanche/i,
      dateFrom: '2026-06-01',
      dateTo: '2026-12-31',
      tier: 'discussion',
    },
    {
      name: 'posse-comitatus',
      query: 'congressional concerns about domestic military deployment and posse comitatus',
      entity: /posse comitatus|insurrection act/i,
      dateFrom: '2025-01-20',
      dateTo: '2026-12-31',
      tier: 'discussion',
    },
    {
      name: 'schedule-f-mixed-tier',
      query: 'Schedule F excepted service rule and reactions to it',
      entity: /schedule f/i,
      dateFrom: '2025-01-20',
      dateTo: '2026-12-31',
      tier: 'all',
    },
  ];

  const { searchResearch } = await import('@/lib/services/search-service');
  const { embedText } = await import('@/lib/services/embedding-service');
  const label = process.argv.includes('--label')
    ? process.argv[process.argv.indexOf('--label') + 1]
    : 'run';
  const results: Record<string, unknown>[] = [];
  for (const c of CASES) {
    const embedding = await embedText(c.query);
    const docs = await searchResearch(
      c.query,
      30,
      embedding ?? undefined,
      c.dateFrom,
      c.dateTo,
      c.tier,
    );
    const hits = docs.filter((d) => c.entity.test(d.title ?? '') || c.entity.test(d.content ?? ''));
    results.push({
      name: c.name,
      retrieved: docs.length,
      entityHits: hits.length,
      topTitles: hits.slice(0, 2).map((h) => String(h.title).slice(0, 60)),
    });
    console.log(
      `${c.name.padEnd(26)} retrieved ${String(docs.length).padStart(2)} | entity hits ${String(hits.length).padStart(2)}`,
    );
  }
  const totalHits = results.reduce((s, r) => s + (r.entityHits as number), 0);
  console.log(`\n[${label}] TOTAL entity hits across ${CASES.length} cases: ${totalHits}`);
  const outIdx = process.argv.indexOf('--out');
  if (outIdx > 0) {
    const fs = await import('fs');
    fs.writeFileSync(process.argv[outIdx + 1], JSON.stringify({ label, results }, null, 2));
  }
  process.exit(0);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  main().catch((e) => {
    console.error('FAIL', e);
    process.exit(1);
  });
}
