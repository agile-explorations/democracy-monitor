/**
 * Ingest warning collection (#feedback 2026-07-25): every warning carries a
 * severity — 'action' items have a remediation (a command to run or breakage
 * to investigate); 'limitation' items are documented coverage facts that no
 * command fixes. Extracted from ingest-validation-service (max-lines).
 */

import { CATEGORIES } from '@/lib/data/categories';
import type { Category } from '@/lib/types';
import type { SourcePeriodGap } from './ingest-validation-queries';
import type { IngestReport, SourcePeriodCoverage } from './ingest-validation-service';

/** Source types where content can be backfilled via `pnpm backfill:content`. */
export const CONTENT_FIXABLE_TYPES = new Set(['Presidential Document', 'congressional_report']);

/** Source origins where content can be backfilled via `pnpm backfill:content`. */
export const CONTENT_FIXABLE_ORIGINS = new Map<string, string>();

const EXPECTED_PERIODS = ['biden_2022', 'biden_2021', 'trump_2017', 'trump_2018', 'trump_t2'];
const CL_PAGINATION_CAP = 900;

export interface IngestWarning {
  severity: 'action' | 'limitation';
  text: string;
}

function checkFrCoverage(frCoverage: SourcePeriodCoverage[], cats: Category[]): string[] {
  const warnings: string[] = [];
  const frByCat = new Map<string, Set<string>>();
  for (const row of frCoverage) {
    if (!frByCat.has(row.category)) frByCat.set(row.category, new Set());
    frByCat.get(row.category)!.add(row.period);
  }
  for (const cat of cats) {
    const periods = frByCat.get(cat.key);
    if (!periods) {
      warnings.push(`${cat.key} has no FR documents in any period`);
      continue;
    }
    const missing = EXPECTED_PERIODS.filter((p) => !periods.has(p));
    if (missing.length > 0) {
      warnings.push(`${cat.key} missing FR documents in: ${missing.join(', ')}`);
    }
  }
  return warnings;
}

/** Expected start dates for each analysis period. */
const PERIOD_START_DATES: Record<string, string> = {
  trump_2017: '2017-01-20',
  trump_2018: '2018-01-20',
  biden_2021: '2021-01-20',
  biden_2022: '2022-01-20',
  trump_t2: '2025-01-20',
};

/** Days after period start before a source is considered "late". */
const LATE_START_DAYS = 30;

/** Sources excluded from period gap warnings (retired or metadata-only). */
const RETIRED_SOURCES = new Set(['whitehouse', 'gdelt']);

function checkLateStart(
  source: string,
  t2: { count: number; earliest: string | null } | undefined,
): IngestWarning | null {
  if (!t2 || t2.count === 0 || !t2.earliest) return null;
  const periodStart = new Date(PERIOD_START_DATES.trump_t2);
  const daysDiff = Math.round(
    (new Date(t2.earliest).getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysDiff <= LATE_START_DAYS) return null;
  return {
    severity: 'limitation',
    text: `${source}: T2 data starts ${t2.earliest} (${daysDiff} days after inauguration)`,
  };
}

function checkSourcePeriodGaps(coverage: SourcePeriodGap[]): IngestWarning[] {
  const warnings: IngestWarning[] = [];

  // Build map: source -> { period -> { count, earliest } }
  const bySource = new Map<string, Map<string, { count: number; earliest: string | null }>>();
  for (const row of coverage) {
    if (row.period === 'other') continue;
    if (RETIRED_SOURCES.has(row.sourceOrigin)) continue;
    if (!bySource.has(row.sourceOrigin)) bySource.set(row.sourceOrigin, new Map());
    bySource.get(row.sourceOrigin)!.set(row.period, {
      count: row.count,
      earliest: row.earliestDate,
    });
  }

  for (const [source, periods] of bySource) {
    const hasAnyBaseline = EXPECTED_PERIODS.some(
      (p) => p !== 'trump_t2' && (periods.get(p)?.count ?? 0) > 0,
    );
    const t2 = periods.get('trump_t2');

    // Source in baselines but missing from T2
    if (hasAnyBaseline && (!t2 || t2.count === 0)) {
      // A source that used to flow and no longer does is potential breakage.
      warnings.push({
        severity: 'action',
        text: `${source}: present in baselines but missing from T2`,
      });
    }

    // Source in T2 but started late (>30 days after inauguration)
    const lateStart = checkLateStart(source, t2);
    if (lateStart) warnings.push(lateStart);

    // Large volume asymmetry across periods (baseline vs baseline)
    const baselinePeriods = ['biden_2022', 'biden_2021', 'trump_2017', 'trump_2018'];
    const baselineCounts = baselinePeriods
      .map((p) => periods.get(p)?.count ?? 0)
      .filter((c) => c > 0);
    if (baselineCounts.length >= 2) {
      const max = Math.max(...baselineCounts);
      const min = Math.min(...baselineCounts);
      if (max > 10 * min && min > 0) {
        warnings.push({
          severity: 'limitation',
          text: `${source}: >10x volume asymmetry across baselines (${min}–${max})`,
        });
      }
    }
  }

  return warnings;
}

function collectContentWarnings(report: IngestReport): IngestWarning[] {
  const warnings: IngestWarning[] = [];
  for (const cc of report.contentCompleteness) {
    if (CONTENT_FIXABLE_TYPES.has(cc.sourceType)) {
      const source = cc.sourceType === 'Presidential Document' ? 'fr' : 'govinfo';
      warnings.push({
        severity: 'action',
        text: `${cc.nullContent} ${cc.sourceType} docs have null content (run: pnpm backfill:content --source ${source})`,
      });
    }
  }
  for (const cc of report.contentCompletenessByOrigin) {
    const source = CONTENT_FIXABLE_ORIGINS.get(cc.sourceType);
    if (source) {
      warnings.push({
        severity: 'action',
        text: `${cc.nullContent} ${cc.sourceType} docs have null content (run: pnpm backfill:content --source ${source})`,
      });
    }
  }
  return warnings;
}

/** Fetch errors — remediable data loss. Baseline-only backlogs say so:
 *  the Source Fetch Health bar is current-term-scoped, and an unscoped
 *  count next to a green bar reads as a contradiction. */
function fetchErrorWarnings(report: IngestReport): IngestWarning[] {
  return report.fetchErrors.map((fe) => {
    const scope = fe.allBaseline
      ? ` — all in baseline periods (${fe.earliestWeek} to ${fe.latestWeek}), current term clean`
      : '';
    return {
      severity: 'action' as const,
      text: `${fe.sourceOrigin}: ${fe.totalIncomplete} incomplete fetch(es) across ${fe.categories} category(ies)${scope} (run: pnpm backfill:gaps --source ${fe.sourceOrigin})`,
    };
  });
}

/** Whole-day multi-topic CREC granules missing fragment children (#704). */
function unfragmentedCrecWarning(report: IngestReport): IngestWarning | null {
  if ((report.unfragmentedCrecGranules ?? 0) === 0) return null;
  return {
    severity: 'action',
    text: `${report.unfragmentedCrecGranules} whole-day multi-topic CREC granule(s) lack fragment children — run: pnpm crec:build-fragments --confirm (idempotent, restores per-speech retrieval granularity, #704)`,
  };
}

export function collectWarningDetails(
  report: IngestReport,
  categoryFilter?: string,
): IngestWarning[] {
  const cats = categoryFilter ? CATEGORIES.filter((c) => c.key === categoryFilter) : CATEGORIES;
  const warnings: IngestWarning[] = [...collectContentWarnings(report)];

  for (const pf of report.paginationFitness) {
    if (pf.peakWeeklyCount >= CL_PAGINATION_CAP) {
      warnings.push({
        severity: 'action',
        text: `${pf.category} CourtListener peak=${pf.peakWeeklyCount} hits pagination cap ${CL_PAGINATION_CAP}`,
      });
    }
  }

  // Period coverage facts — real, documented, not fixable by a command.
  warnings.push(
    ...checkFrCoverage(report.frPeriodCoverage, cats).map(
      (text): IngestWarning => ({ severity: 'limitation', text }),
    ),
  );
  warnings.push(...checkSourcePeriodGaps(report.sourcePeriodCoverage));

  // Signal definition coverage gaps — configuration facts.
  for (const gap of report.signalCoverageGaps) {
    const label = gap.origin === 'signal' ? 'signal-defined' : 'pipeline-routed';
    warnings.push({
      severity: 'limitation',
      text: `${gap.category} missing ${label} source: ${gap.expectedSource}`,
    });
  }

  const crecWarning = unfragmentedCrecWarning(report);
  if (crecWarning) warnings.push(crecWarning);

  warnings.push(...fetchErrorWarnings(report));

  // Metadata-only classification (#648: moved from Data Readiness). Each
  // population carries its own remediation hint, so 'action'.
  for (const m of report.metadataOnlyClassification ?? []) {
    if (!m.pass) {
      const detail =
        m.mode === 'none-present'
          ? `${m.total} residual row(s) present (expected 0 — retired to tracked_cases)`
          : `${m.unmarked} of ${m.total} not marked metadata_only`;
      warnings.push({
        severity: 'action',
        text: `${m.population}: ${detail} (run: ${m.hint})`,
      });
    }
  }

  return warnings;
}
