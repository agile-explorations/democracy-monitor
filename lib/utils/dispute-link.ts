/**
 * "Dispute this reading" (#815): the pure half. Every surface that shows an
 * AI verdict builds the same link into the feedback page, carrying enough
 * context that the dispute is about one document and one reading — not a
 * free-text complaint. The feedback page parses it back; the API stores it
 * as structured metadata; the public list renders it beside the response.
 */

import { newIssueUrl } from '@/lib/data/repo-links';

export type DisputeSurface = 'week' | 'research' | 'explore';

export interface DisputeContext {
  documentId?: number | null;
  url: string | null;
  title: string;
  category: string;
  weekOf?: string | null;
  /** The stored verdict value (e.g. clearly_concerning). */
  verdict: string;
  erosionType?: string | null;
  surface: DisputeSurface;
}

const MAX_TITLE = 200;

/** The feedback-page link for one document's reading. */
export function disputeHref(ctx: DisputeContext): string {
  const p = new URLSearchParams({ type: 'dispute' });
  if (ctx.documentId != null) p.set('doc', String(ctx.documentId));
  if (ctx.url) p.set('url', ctx.url);
  p.set('title', ctx.title.slice(0, MAX_TITLE));
  p.set('category', ctx.category);
  if (ctx.weekOf) p.set('week', ctx.weekOf);
  p.set('verdict', ctx.verdict);
  if (ctx.erosionType) p.set('mechanism', ctx.erosionType);
  p.set('surface', ctx.surface);
  return `/feedback?${p.toString()}`;
}

const SURFACES: DisputeSurface[] = ['week', 'research', 'explore'];

/** Parse the feedback page's query back into a context; null unless it is a dispute. */
export function parseDisputeQuery(
  query: Record<string, string | string[] | undefined>,
): DisputeContext | null {
  const one = (k: string) => {
    const v = query[k];
    return Array.isArray(v) ? v[0] : v;
  };
  if (one('type') !== 'dispute') return null;
  const title = one('title');
  const category = one('category');
  const verdict = one('verdict');
  if (!title || !category || !verdict) return null;
  const doc = one('doc');
  const surface = one('surface');
  return {
    documentId: doc && /^\d+$/.test(doc) ? Number(doc) : null,
    url: one('url') ?? null,
    title,
    category,
    weekOf: one('week') ?? null,
    verdict,
    erosionType: one('mechanism') ?? null,
    surface: SURFACES.includes(surface as DisputeSurface) ? (surface as DisputeSurface) : 'week',
  };
}

/** The second path: a prefilled public GitHub issue for readers with an account. */
export function disputeIssueUrl(ctx: DisputeContext): string {
  const title = `Dispute: "${ctx.title.slice(0, 80)}" read as ${ctx.verdict}`;
  const body = [
    `**Document**: ${ctx.title}`,
    ctx.url ? `**Link**: ${ctx.url}` : null,
    `**Category**: ${ctx.category}${ctx.weekOf ? ` — week of ${ctx.weekOf}` : ''}`,
    `**The reviewer's reading**: ${ctx.verdict}${ctx.erosionType ? ` (${ctx.erosionType})` : ''}`,
    ctx.documentId != null ? `**Document id**: ${ctx.documentId}` : null,
    '',
    '**Why this reading is wrong** (point to the passage):',
    '',
  ]
    .filter((l) => l !== null)
    .join('\n');
  return newIssueUrl(title, body, ['dispute']);
}
