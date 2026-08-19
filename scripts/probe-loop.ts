/** Pre-deploy mechanism probe (#756): does the read-and-follow-up loop
 *  surface the CORE docs the single-query architecture missed? Read-only
 *  against prod. `--only=ID` limits to one question. */
import { retrieveEnumerationLoop } from '@/lib/services/research-loop-retrieval';

const PROBES: Array<{ id: string; q: string; dateFrom?: string; expect: RegExp[] }> = [
  {
    id: 'H3',
    q: 'What government documents address investigations or prosecutions of individuals the President has publicly named as political adversaries since January 2025?',
    dateFrom: '2025-01-20',
    expect: [/Comey/i, /James/i, /Perkins Coie|WilmerHale|Jenner|Susman/i, /Cook/i],
  },
  {
    id: 'IM3',
    q: 'What government documents reference both immigration enforcement and due process protections?',
    expect: [/J\. ?G\. ?G/i, /A\. ?A\. ?R\. ?P/i, /Abrego/i, /D\. ?V\. ?D/i, /Alien Enemies/i],
  },
  {
    id: 'RL4',
    q: 'What documents show how civil rights enforcement priorities have changed since January 2025?',
    dateFrom: '2025-01-20',
    expect: [/Yale/i, /pattern.{0,4}practice/i, /civil rights fraud/i],
  },
];

(async () => {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  for (const p of PROBES) {
    if (only && p.id !== only) continue;
    const t0 = Date.now();
    const result = await retrieveEnumerationLoop(
      { query: p.q, dateFrom: p.dateFrom, dateTo: undefined, tier: 'all', inferredFrom: null },
      60,
    );
    console.log(`\n== ${p.id} (${Date.now() - t0}ms, ${result.docs.length} docs)`);
    for (const w of result.timings.windows) {
      console.log(`   ${w.key}: ${w.searchMs}ms`);
    }
    console.log(
      `   searched: ${result.alsoSearched.map((t) => `${t.phrase}:${t.matches}`).join(' | ')}`,
    );
    for (const re of p.expect) {
      const hit = result.docs.find((d) => re.test(d.title));
      console.log(`   ${hit ? 'HIT ' : 'MISS'} ${re} ${hit ? '→ ' + hit.title.slice(0, 70) : ''}`);
    }
  }
  process.exit(0);
})();
