import { sql } from 'drizzle-orm';
import { INFRASTRUCTURE_THEMES } from '@/lib/data/infrastructure-keywords';
import { getDb } from '@/lib/db';
import { CONVERGENCE_ENTRENCHED_THRESHOLD } from '@/lib/methodology/scoring-config';
import type { ConvergenceLevel } from '@/lib/types/infrastructure';
import { toDateString } from '@/lib/utils/date-utils';
import { matchKeyword } from '@/lib/utils/keyword-match';

export type WeekEntry = { category: string; reason: string; matches: string[] };
export type WeekMap = Map<string, WeekEntry[]>;

export interface ConvergencePoint {
  week: string;
  activeThemeCount: number;
  convergence: ConvergenceLevel;
  convergenceScore: number;
}

function computeWeekPoint(week: string, entries: WeekEntry[]): ConvergencePoint {
  let activeThemeCount = 0;
  const themeIntensities: number[] = [];

  for (const theme of INFRASTRUCTURE_THEMES) {
    let matchCount = 0;
    for (const entry of entries) {
      const texts = [entry.reason, ...entry.matches];
      for (const text of texts) {
        for (const keyword of theme.keywords) {
          if (matchKeyword(text, keyword)) matchCount++;
        }
      }
    }
    if (matchCount >= theme.activationThreshold) activeThemeCount++;
    themeIntensities.push(matchCount);
  }

  const activeIntensities = themeIntensities.filter((i) => i > 0);
  const convergenceScore =
    activeIntensities.length < 2 ? 0 : activeIntensities.reduce((product, i) => product * i, 1);

  let convergence: ConvergenceLevel = 'none';
  if (activeThemeCount === 0) convergence = 'none';
  else if (activeThemeCount === 1) convergence = 'emerging';
  else if (convergenceScore >= CONVERGENCE_ENTRENCHED_THRESHOLD) convergence = 'entrenched';
  else convergence = 'active';

  return { week, activeThemeCount, convergence, convergenceScore };
}

export function computeConvergenceSeries(weekMap: WeekMap): ConvergencePoint[] {
  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, entries]) => computeWeekPoint(week, entries));
}

export async function fetchWeeklyConvergenceData(
  from: string,
  to?: string,
): Promise<ConvergencePoint[]> {
  const db = getDb();

  const fromClause = sql`AND assessed_at >= ${new Date(from)}`;
  const toClause = to ? sql`AND assessed_at <= ${new Date(to)}` : sql``;

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

  const weekMap: WeekMap = new Map();
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

  return computeConvergenceSeries(weekMap);
}
