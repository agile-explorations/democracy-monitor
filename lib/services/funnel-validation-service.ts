/**
 * Orchestrator for the per-source funnel diagnostic (#547). Assembles the four
 * windowed stage queries into a SourceFunnel per (category, source_origin), then
 * runs the pure collapse evaluation. Returns a report the CLI and the weekly
 * cron both consume.
 */

import { isDbAvailable } from '@/lib/db';
import { evaluateCategoryHealth } from './category-health-checks';
import type { CategoryHealthResult } from './category-health-checks';
import { evaluateFunnel } from './funnel-collapse-checks';
import type {
  FunnelCollapseResult,
  FunnelThresholds,
  SourceFunnel,
} from './funnel-collapse-checks';
import {
  queryCategoryHealth,
  queryFrDrops,
  queryP1Flagged,
  queryP2Confirmed,
  queryRetrievedAndPassed,
} from './funnel-validation-queries';
import type { StageCountRow } from './funnel-validation-queries';

const DEFAULT_WINDOW_DAYS = 90;
/** Health checks (#840) need more audit samples than 90 days holds for small
 *  categories (mediaFreedom accrues ~16 audits/90d vs a 25-sample floor), so
 *  they run on their own longer window ending at the funnel window's end. */
const HEALTH_WINDOW_DAYS = 182;
const FEDERAL_REGISTER = 'federal_register';
const UNKNOWN_ORIGIN = 'unknown';
const MS_PER_DAY = 86_400_000;

export interface FunnelWindow {
  from: string;
  to: string;
  days: number | null; // null when an explicit --from/--to range was given
}

export interface FunnelReport {
  window: FunnelWindow;
  sources: SourceFunnel[];
  collapses: FunnelCollapseResult[];
  /** Per-category detection-health warns (#840), on their own 182-day window. */
  health: CategoryHealthResult[];
  healthWindow: FunnelWindow;
}

export interface FunnelOptions {
  days?: number;
  from?: string;
  to?: string;
  category?: string;
  thresholds?: FunnelThresholds;
}

/** Resolve the window: an explicit from/to wins; otherwise `days` back from now
 *  (upper bound is exclusive-of-tomorrow so today is included). */
export function resolveWindow(opts: Pick<FunnelOptions, 'days' | 'from' | 'to'>): FunnelWindow {
  if (opts.from && opts.to) return { from: opts.from, to: opts.to, days: null };
  const days = opts.days ?? DEFAULT_WINDOW_DAYS;
  const now = new Date();
  const toDate = new Date(now.getTime() + MS_PER_DAY);
  const fromDate = new Date(now.getTime() - days * MS_PER_DAY);
  return { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10), days };
}

const keyOf = (category: string, origin: string): string => `${category}|${origin}`;

/** Get-or-create the funnel entry for a (category, source_origin) pair. */
function ensureSource(
  map: Map<string, SourceFunnel>,
  category: string,
  origin: string,
): SourceFunnel {
  const key = keyOf(category, origin);
  let entry = map.get(key);
  if (!entry) {
    entry = {
      category,
      sourceOrigin: origin,
      stages: { retrieved: 0, passedRelevance: 0, p1Flagged: 0, p2Confirmed: 0 },
    };
    map.set(key, entry);
  }
  return entry;
}

function applyStageCounts(
  map: Map<string, SourceFunnel>,
  rows: StageCountRow[],
  field: 'p1Flagged' | 'p2Confirmed',
): void {
  for (const row of rows) {
    const entry = ensureSource(map, row.category, row.sourceOrigin ?? UNKNOWN_ORIGIN);
    entry.stages[field] = row.count;
  }
}

/** Build SourceFunnel[] from the four raw query result sets. Exported for tests. */
export function assembleSources(
  retrieved: Awaited<ReturnType<typeof queryRetrievedAndPassed>>,
  frDrops: Awaited<ReturnType<typeof queryFrDrops>>,
  p1: StageCountRow[],
  p2: StageCountRow[],
): SourceFunnel[] {
  const map = new Map<string, SourceFunnel>();

  for (const row of retrieved) {
    const entry = ensureSource(map, row.category, row.sourceOrigin ?? UNKNOWN_ORIGIN);
    entry.stages.retrieved = row.retrieved;
    entry.stages.passedRelevance = row.passedRelevance;
  }
  // FR live-drops are additional retrieved volume attributed to federal_register.
  for (const row of frDrops) {
    ensureSource(map, row.category, FEDERAL_REGISTER).stages.retrieved += row.dropped;
  }
  applyStageCounts(map, p1, 'p1Flagged');
  applyStageCounts(map, p2, 'p2Confirmed');

  return [...map.values()];
}

export async function runFunnelValidation(opts: FunnelOptions = {}): Promise<FunnelReport> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const window = resolveWindow(opts);
  const { from, to } = window;
  const { category } = opts;

  const [retrieved, frDrops, p1, p2] = await Promise.all([
    queryRetrievedAndPassed(from, to, category),
    queryFrDrops(from, to, category),
    queryP1Flagged(from, to, category),
    queryP2Confirmed(from, to, category),
  ]);

  const sources = assembleSources(retrieved, frDrops, p1, p2);
  const collapses = evaluateFunnel(sources, opts.thresholds);

  const healthFrom = new Date(new Date(to).getTime() - HEALTH_WINDOW_DAYS * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
  const healthWindow: FunnelWindow = { from: healthFrom, to, days: HEALTH_WINDOW_DAYS };
  const healthInputs = await queryCategoryHealth(healthFrom, to, category);
  const health = evaluateCategoryHealth(healthInputs);

  return { window, sources, collapses, health, healthWindow };
}
