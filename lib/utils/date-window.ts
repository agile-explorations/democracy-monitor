import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

/**
 * Inclusive-day published_at window for raw SQL over an aliased documents
 * table. dateTo means "through the end of that day": strictly less than
 * midnight of the NEXT day. Must stay strict — date-only sources store
 * published_at at exactly that boundary midnight, and <= leaked the first
 * day outside the window (a Biden-era dateTo returned 2025-01-20 executive
 * orders).
 */
export function buildPublishedAtWindow(dateFrom?: string, dateTo?: string): SQL {
  if (!dateFrom && !dateTo) return sql``;
  return sql`${dateFrom ? sql`AND d.published_at >= ${dateFrom}::timestamptz` : sql``}${
    dateTo ? sql` AND d.published_at < ${dateTo}::timestamptz + interval '1 day'` : sql``
  }`;
}
