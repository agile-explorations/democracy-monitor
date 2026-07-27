import { desc, sql } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '@/lib/db';
import { weeklyAggregates } from '@/lib/db/schema';
import {
  buildThematicHeatmapRows,
  detectThematicStandouts,
} from '@/lib/services/thematic-heatmap-service';
import { getThemeLabel } from '@/lib/services/thematic-theme-labels';
import { formatError, requireDb, requireMethod } from '@/lib/utils/api-helpers';
import { latestCompleteWeek } from '@/lib/utils/date-utils';

/** Weeks since inauguration (Jan 20, 2025). */
function weeksSinceAdminStart(): number {
  const start = new Date('2025-01-20T00:00:00Z');
  const diffMs = Date.now() - start.getTime();
  return Math.max(1, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  try {
    const db = getDb();
    const weeks = weeksSinceAdminStart();
    const cutoff = latestCompleteWeek();

    const rows = await db
      .select({
        category: weeklyAggregates.category,
        weekOf: weeklyAggregates.weekOf,
        thematicDetail: weeklyAggregates.thematicDetail,
        documentCount: weeklyAggregates.documentCount,
      })
      .from(weeklyAggregates)
      .where(
        sql`${weeklyAggregates.weekOf} >= (
          SELECT MAX(week_of) - make_interval(days => ${weeks * 7})
          FROM weekly_aggregates
          WHERE week_of <= ${cutoff}
        ) AND ${weeklyAggregates.weekOf} <= ${cutoff}`,
      )
      .orderBy(weeklyAggregates.category, desc(weeklyAggregates.weekOf));

    const mapped = rows.map((r) => ({
      category: r.category,
      week_of: r.weekOf,
      thematic_detail: r.thematicDetail,
      document_count: r.documentCount,
    }));

    const heatmapRows = buildThematicHeatmapRows(mapped);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    const standouts = detectThematicStandouts(heatmapRows);
    // AI theme labels on shifts (#583): cached 7 days, <=8 calls worst case,
    // every failure degrades to the unlabeled sentence.
    await Promise.all(
      standouts
        .filter((r) => r.direction === 'above')
        .map(async (r) => {
          const label = await getThemeLabel(r.category, r.endWeek);
          if (label) r.sentence = `${r.sentence.replace(/\.$/, '')} — ${label}.`;
        }),
    );
    return res.status(200).json({ rows: heatmapRows, standouts });
  } catch (err) {
    return res.status(500).json({ error: formatError(err) });
  }
}
