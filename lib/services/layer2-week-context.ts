import type { Pass2WeekContext } from '@/lib/ai/prompts/layer2-pass2';
import type { Pass1Result } from './layer2-assessment-service';
import { getBaselineAIFlagRate, getWeekP1Context } from './layer2-store';

export interface Layer2Options {
  pass1Provider?: 'openai' | 'anthropic';
  pass1Model?: string;
  pass2Provider?: 'openai' | 'anthropic';
  pass2Model?: string;
  auditSampleRate?: number;
  dryRun?: boolean;
  verbose?: boolean;
}

const MAX_PEER_TITLES = 5;

export interface PeerWithUrl {
  url: string;
  title: string;
  erosionType: string;
}

export interface PriorWeekData {
  totalDocs: number;
  flaggedDocs: number;
  flaggedPeers: PeerWithUrl[];
}

/**
 * Build per-document week context by excluding the document's own URL from the peer list.
 * Returns undefined if baseContext or allPeers are not available.
 */
export function buildPerDocContext(
  baseContext: Omit<Pass2WeekContext, 'flaggedPeers'> | undefined,
  allPeers: PeerWithUrl[] | undefined,
  docUrl: string,
): Pass2WeekContext | undefined {
  if (!baseContext || !allPeers) return undefined;
  return {
    ...baseContext,
    flaggedPeers: allPeers
      .filter((p) => p.url !== docUrl)
      .slice(0, MAX_PEER_TITLES)
      .map((p) => ({ title: p.title, erosionType: p.erosionType })),
  };
}

export function computeTrajectory(currentRate: number, priorRate: number): string {
  if (priorRate === 0 && currentRate === 0) return 'quiet (no flags either week)';
  if (currentRate > priorRate * 1.5) return 'sharp escalation';
  if (currentRate > priorRate) return 'escalating';
  if (currentRate < priorRate * 0.5) return 'declining';
  return 'stable';
}

export function getPriorWeekOf(weekOf: string): string {
  const d = new Date(weekOf + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

export interface RetryWeekContext extends Omit<Pass2WeekContext, 'flaggedPeers'> {
  flaggedPeers: PeerWithUrl[];
}

/**
 * Build week context from stored DB data for retry operations.
 * Returns null if no docs exist for the week.
 */
export async function buildRetryWeekContext(
  categoryKey: string,
  weekOf: string,
  categoryTitle: string,
  expertDescription: string,
): Promise<RetryWeekContext | null> {
  const priorWeekOf = getPriorWeekOf(weekOf);
  const [currentWeek, priorWeek, baseline] = await Promise.all([
    getWeekP1Context(categoryKey, weekOf),
    getWeekP1Context(categoryKey, priorWeekOf),
    getBaselineAIFlagRate(categoryKey, 'biden_2022'),
  ]);

  if (currentWeek.totalDocs === 0) return null;

  const flagRate = currentWeek.flaggedDocs / currentWeek.totalDocs;
  const priorFlagRate = priorWeek.totalDocs > 0 ? priorWeek.flaggedDocs / priorWeek.totalDocs : 0;

  return {
    categoryTitle,
    expertDescription,
    totalDocs: currentWeek.totalDocs,
    flaggedDocs: currentWeek.flaggedDocs,
    flagRate,
    baselineAvgFlagRate: baseline?.rate ?? 0,
    flaggedPeers: currentWeek.flaggedPeers,
    priorWeekTotalDocs: priorWeek.totalDocs,
    priorWeekFlaggedDocs: priorWeek.flaggedDocs,
    priorWeekFlagRate: priorFlagRate,
    priorWeekPeers: priorWeek.flaggedPeers
      .slice(0, MAX_PEER_TITLES)
      .map((p) => ({ title: p.title, erosionType: p.erosionType })),
    trajectory: computeTrajectory(flagRate, priorFlagRate),
  };
}

export function buildPeerList(
  pass1Results: Pass1Result[],
  items: Array<{ link?: string; title?: string }>,
): PeerWithUrl[] {
  const itemByUrl = new Map(items.map((i) => [i.link || i.title, i]));
  return pass1Results
    .filter((r) => r.response.relevant)
    .sort((a, b) => b.response.confidence - a.response.confidence)
    .slice(0, MAX_PEER_TITLES + 5)
    .map((r) => ({
      url: r.url,
      title: itemByUrl.get(r.url)?.title ?? r.url,
      erosionType: r.response.erosionType,
    }));
}

export function buildBaseContext(
  pass1Results: Pass1Result[],
  flaggedCount: number,
  priorWeek: PriorWeekData,
  categoryTitle: string,
  expertDescription: string,
  baselineAvgFlagRate: number,
): Omit<Pass2WeekContext, 'flaggedPeers'> {
  const totalDocs = pass1Results.length;
  const flagRate = totalDocs > 0 ? flaggedCount / totalDocs : 0;
  const priorFlagRate = priorWeek.totalDocs > 0 ? priorWeek.flaggedDocs / priorWeek.totalDocs : 0;

  return {
    categoryTitle,
    expertDescription,
    totalDocs,
    flaggedDocs: flaggedCount,
    flagRate,
    baselineAvgFlagRate,
    priorWeekTotalDocs: priorWeek.totalDocs,
    priorWeekFlaggedDocs: priorWeek.flaggedDocs,
    priorWeekFlagRate: priorFlagRate,
    priorWeekPeers: priorWeek.flaggedPeers
      .slice(0, MAX_PEER_TITLES)
      .map((p) => ({ title: p.title, erosionType: p.erosionType })),
    trajectory: computeTrajectory(flagRate, priorFlagRate),
  };
}
