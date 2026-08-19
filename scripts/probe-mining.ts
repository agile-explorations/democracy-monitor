/** Ad-hoc probe (#750): show mined aliases + retrieved titles for eval questions. */
import { searchResearchWithMeta } from '@/lib/services/search-service';

const QUESTIONS: Array<[string, string, string?]> = [
  [
    'H3',
    'What government documents address investigations or prosecutions of individuals the President has publicly named as political adversaries since January 2025?',
    '2025-01-20',
  ],
  [
    'H2',
    'What executive actions, court rulings, and congressional responses address the domestic deployment of the National Guard or military forces since January 2025?',
    '2025-01-20',
  ],
  [
    'IM3',
    'What government documents reference both immigration enforcement and due process protections?',
    undefined,
  ],
];

(async () => {
  for (const [id, q, from] of QUESTIONS) {
    const { documents, minedAliases } = await searchResearchWithMeta(q, 60, undefined, from);
    console.log(
      `\n== ${id} mined:`,
      minedAliases.map((a) => `${a.phrase}:${a.matches}`).join(' | ') || '(none)',
    );
    const armDocs = documents.filter((d) => d.matchedAlias);
    console.log(
      `   arm-surfaced (${armDocs.length}):`,
      armDocs.slice(0, 8).map((d) => `[${d.matchedAlias}] ${d.title.slice(0, 55)}`),
    );
  }
  process.exit(0);
})();
