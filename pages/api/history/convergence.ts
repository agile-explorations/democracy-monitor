import { sql } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { INFRASTRUCTURE_THEMES } from '@/lib/data/infrastructure-keywords';
import { getDb } from '@/lib/db';
import { CONVERGENCE_ENTRENCHED_THRESHOLD } from '@/lib/methodology/scoring-config';
import type { ConvergenceLevel } from '@/lib/types/infrastructure';
import { requireDb, requireMethod } from '@/lib/utils/api-helpers';
import { toDateString } from '@/lib/utils/date-utils';
import { matchKeyword } from '@/lib/utils/keyword-match';

/**
 * GET /api/history/convergence?from=2025-01-20&to=2026-02-08
 * Returns weekly infrastructure convergence data derived from assessment snapshots.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const from = (req.query.from as string) || '2025-01-20';
  const to = (req.query.to as string) || undefined;

  try {
    const db = getDb();

    const fromClause = sql`AND assessed_at >= ${new Date(from)}`;
    const toClause = to ? sql`AND assessed_at <= ${new Date(to)}` : sql``;

    // Get one assessment per category per week
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (category, date_trunc('week', assessed_at))
        category,
        date_trunc('week', assessed_at) AS week,
        status,
        reason,
        matches
      FROM assessments
      WHERE 1=1 ${fromClause} ${toClause}
      ORDER BY category, date_trunc('week', assessed_at), assessed_at DESC
    `);

    // Group by week
    const weekMap = new Map<
      string,
      Array<{ category: string; reason: string; matches: string[] }>
    >();
    for (const row of rows.rows) {
      const r = row as Record<string, unknown>;
      const week = toDateString(new Date(r.week as string));
      if (!weekMap.has(week)) weekMap.set(week, []);
      weekMap.get(week)!.push({
        category: r.category as string,
        reason: r.reason as string,
        matches: Array.isArray(r.matches) ? (r.matches as string[]) : [],
      });
    }

    // Analyze infrastructure per week
    const result = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, entries]) => {
        let activeThemeCount = 0;
        const themeIntensities: number[] = [];

        for (const theme of INFRASTRUCTURE_THEMES) {
          let matchCount = 0;
          for (const entry of entries) {
            const texts = [entry.reason, ...entry.matches];
            for (const text of texts) {
              for (const keyword of theme.keywords) {
                if (matchKeyword(text, keyword)) {
                  matchCount++;
                }
              }
            }
          }
          if (matchCount >= theme.activationThreshold) {
            activeThemeCount++;
          }
          themeIntensities.push(matchCount);
        }

        const activeIntensities = themeIntensities.filter((i) => i > 0);
        const convergenceScore =
          activeIntensities.length < 2
            ? 0
            : activeIntensities.reduce((product, i) => product * i, 1);

        let convergence: ConvergenceLevel = 'none';
        if (activeThemeCount === 0) convergence = 'none';
        else if (activeThemeCount === 1) convergence = 'emerging';
        else if (convergenceScore >= CONVERGENCE_ENTRENCHED_THRESHOLD) convergence = 'entrenched';
        else convergence = 'active';

        return { week, activeThemeCount, convergence, convergenceScore };
      });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[api/history/convergence] Error:', err);
    return res.status(500).json({ error: 'Failed to compute convergence' });
  }
}
