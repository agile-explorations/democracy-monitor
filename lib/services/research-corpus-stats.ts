/** Corpus-statistics block for the research synthesis prompt (split from
 *  research-prompts.ts for the file-length cap). */

import { displayCategoryKey } from '@/lib/data/document-populations';
import type { CorpusStats } from './search-research-queries';

export function formatCorpusStats(stats: CorpusStats): string {
  const monthLines = stats.monthlyBreakdown.map((m) => `  ${m.month}: ${m.count}`).join('\n');
  const catLines = stats.categoryBreakdown
    .map((c) => `  ${displayCategoryKey(c.category)}: ${c.count}`)
    .join('\n');
  return [
    '--- CORPUS STATISTICS ---',
    `Total matching documents across full corpus: ${stats.totalMatching}`,
    `(The ${stats.categoryBreakdown.length > 0 ? 'documents below' : 'retrieved documents'} are the most relevant sample.)`,
    '',
    'Monthly distribution:',
    monthLines,
    '',
    'Category distribution:',
    catLines,
  ].join('\n');
}
