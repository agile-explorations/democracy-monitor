/**
 * Era-sliced AI-verdict rates (#772): the same Pass-1 screen and Pass-2
 * review, applied to every analysis period, reported side by side. Rates
 * that differ by era are either the record or the reviewer — publishing the
 * numbers is what lets a reader ask which, and the swap audit
 * (verdict-symmetry.ts) is how we answer. One aggregate query per era over
 * documents with content (the same population validate:detection uses).
 */

import { sql } from 'drizzle-orm';
import { getAnalysisPeriods } from '@/lib/data/analysis-periods';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { getDb, isDbAvailable } from '@/lib/db';
import { addDays } from '@/lib/utils/date-utils';

export interface EraVerdictRates {
  era: string;
  label: string;
  from: string;
  to: string;
  /** Documents with content in the era (P1 population). */
  documents: number;
  pass1Flagged: number;
  pass1FlagRate: number;
  /** Non-audit Pass-2 reviews. */
  pass2Reviews: number;
  pass2Departures: number;
  /** Share of reviews classed possible or clear departure. */
  pass2DepartureRate: number;
  pass2ClearDepartureRate: number;
  /** Random audit sample of UNFLAGGED docs reviewed by Pass 2. */
  auditSamples: number;
  auditDepartures: number;
  /** Share of the audit sample Pass 2 called a departure — the screen's miss rate. */
  auditMissRate: number;
}

export interface VerdictRatesReport {
  computedAt: string;
  eras: EraVerdictRates[];
}

/** Human label for an era id. */
export function eraLabel(id: string): string {
  if (id === 'trump_t2') return 'Trump 2025– (current term)';
  return BASELINE_CONFIGS.find((b) => b.id === id)?.label ?? id;
}

const rate = (num: number, den: number) => (den > 0 ? num / den : 0);

function toEraRates(
  p: { label: string; from: string; to: string },
  row: Record<string, string>,
): EraVerdictRates {
  const documents = Number(row.documents);
  const pass1Flagged = Number(row.p1_flagged);
  const pass2Reviews = Number(row.p2_reviews);
  const pass2Departures = Number(row.p2_departures);
  const auditSamples = Number(row.audit_samples);
  const auditDepartures = Number(row.audit_departures);
  return {
    era: p.label,
    label: eraLabel(p.label),
    from: p.from,
    to: p.to,
    documents,
    pass1Flagged,
    pass1FlagRate: rate(pass1Flagged, documents),
    pass2Reviews,
    pass2Departures,
    pass2DepartureRate: rate(pass2Departures, pass2Reviews),
    pass2ClearDepartureRate: rate(Number(row.p2_clear), pass2Reviews),
    auditSamples,
    auditDepartures,
    auditMissRate: rate(auditDepartures, auditSamples),
  };
}

export async function computeEraVerdictRates(): Promise<VerdictRatesReport> {
  if (!isDbAvailable()) return { computedAt: new Date().toISOString(), eras: [] };
  const db = getDb();
  const eras: EraVerdictRates[] = [];
  for (const p of getAnalysisPeriods()) {
    const toExclusive = addDays(p.to, 1);
    const r = await db.execute(sql`
      WITH docs AS (
        SELECT d.url, d.category
        FROM documents d
        WHERE d.published_at >= ${p.from}::date AND d.published_at < ${toExclusive}::date
          AND (d.content_type IS NULL OR d.content_type != 'metadata_only')
          AND d.category != 'intent'
          AND d.retrieval_relevant IS NOT FALSE
      )
      SELECT
        (SELECT count(*) FROM docs) AS documents,
        count(*) FILTER (WHERE a.pass = 1 AND a.relevant = true) AS p1_flagged,
        count(*) FILTER (WHERE a.pass = 2 AND NOT a.is_audit_sample) AS p2_reviews,
        count(*) FILTER (WHERE a.pass = 2 AND NOT a.is_audit_sample
          AND a.assessment IN ('potentially_concerning', 'clearly_concerning')) AS p2_departures,
        count(*) FILTER (WHERE a.pass = 2 AND NOT a.is_audit_sample
          AND a.assessment = 'clearly_concerning') AS p2_clear,
        count(*) FILTER (WHERE a.pass = 2 AND a.is_audit_sample) AS audit_samples,
        count(*) FILTER (WHERE a.pass = 2 AND a.is_audit_sample
          AND a.assessment IN ('potentially_concerning', 'clearly_concerning')) AS audit_departures
      FROM ai_document_assessments a
      JOIN docs ON docs.url = a.url AND docs.category = a.category`);
    eras.push(toEraRates(p, r.rows[0] as Record<string, string>));
  }
  return { computedAt: new Date().toISOString(), eras };
}
