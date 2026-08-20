/** Pre-deploy mechanism probe (#759): do salience arms surface the CORE
 *  docs the single-query architecture missed? Requires a populated
 *  hot_entities index. Read-only against the target DB. `--only=ID` limits
 *  to one question. */
import { embedQueryCached } from '@/lib/services/embedding-service';
import { retrieveEnumerationLoop } from '@/lib/services/research-loop-retrieval';

const PROBES: Array<{ id: string; q: string; dateFrom?: string; expect: RegExp[] }> = [
  {
    id: 'H3',
    q: 'What government documents address investigations or prosecutions of individuals the President has publicly named as political adversaries since January 2025?',
    dateFrom: '2025-01-20',
    // Krebs is the person-class requirement (#759): salience must carry a
    // person entity, not just captions/EOs.
    expect: [/Comey/i, /James/i, /Perkins Coie|WilmerHale|Jenner|Susman/i, /Cook/i, /Krebs/i],
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
    const embedding = await embedQueryCached(p.q);
    if (!embedding) throw new Error('embedding unavailable');
    const result = await retrieveEnumerationLoop(
      {
        query: p.q,
        embedding,
        dateFrom: p.dateFrom,
        dateTo: undefined,
        tier: 'all',
        inferredFrom: null,
      },
      60,
    );
    console.log(`\n== ${p.id} (${Date.now() - t0}ms, ${result.docs.length} docs)`);
    console.log(
      `   searched tail: ${result.alsoSearched
        .slice(-14)
        .map((s) => `${s.phrase}:${s.matches}`)
        .join(' | ')}`,
    );
    for (const w of result.timings.windows) console.log(`   ${w.key}: ${w.searchMs}ms`);
    for (const re of p.expect) {
      const hit = result.docs.find((d) => re.test(d.title));
      console.log(`   ${hit ? 'HIT ' : 'MISS'} ${re} ${hit ? '→ ' + hit.title.slice(0, 70) : ''}`);
    }
  }
  process.exit(0);
})();
