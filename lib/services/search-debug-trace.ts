/**
 * ?debug=1 trace assembly (#718, split from the search route for size):
 * settings, expansion diagnostics with rejected reasons, and the pre-rerank
 * candidate set. Comparative searches validate aliases PER ERA WINDOW, so
 * the diagnostics run per window too — a single windowless diagnostic showed
 * terms as "rejected" whose windowed arms actually ran (#721).
 */

import type { NextApiRequest } from 'next';
import { expandDiagnostic } from '@/lib/services/query-expansion-service';
import type { CandidateSummary } from '@/lib/services/research-doc-retrieval';

export async function buildDebugTrace(
  req: NextApiRequest,
  query: string,
  candidates: CandidateSummary[] | undefined,
  strata: Array<{ key: string; from?: string; to?: string }> | undefined,
) {
  const tier = (req.query.tier as string | undefined) ?? 'all';
  const windows = strata?.length
    ? strata.map((s) => ({ key: s.key, dateFrom: s.from, dateTo: s.to }))
    : [
        {
          key: 'request',
          dateFrom: req.query.dateFrom as string | undefined,
          dateTo: req.query.dateTo as string | undefined,
        },
      ];
  const expansion = await Promise.all(
    windows.map(async (w) => ({
      window: { key: w.key, from: w.dateFrom ?? null, to: w.dateTo ?? null },
      ...(await expandDiagnostic(query, {
        dateFrom: w.dateFrom,
        dateTo: w.dateTo,
        tier: tier === 'all' ? undefined : (tier as 'action' | 'discussion'),
      })),
    })),
  );
  return {
    capturedAt: new Date().toISOString(),
    settings: {
      tier,
      dateFrom: req.query.dateFrom ?? null,
      dateTo: req.query.dateTo ?? null,
      eras: req.query.eras ?? null,
    },
    expansion,
    candidatesPreRerank: candidates ?? [],
  };
}
