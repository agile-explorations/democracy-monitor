/**
 * Tipwire date guard (R-CREC-SPEAKERS #931). A judge-written tip said "Sept.
 * 13" for a Congressional Record dated Sept. 14 — a Sunday. The judge sees
 * dates as "Sep 14, 2026" and writes them back in its own words; nothing
 * checked them. Every calendar date in a tip must be *in evidence*: equal to
 * a matched document's publication date — within a day for a CourtListener
 * opinion, which is filed the day after its date; exact for every other
 * source, a Record or Register date being exact — or written in a matched
 * document's text (tips legitimately cite dates inside documents —
 * "operation July 27–August 29", "the Aug. 3 rule corrected Aug. 25").
 *
 * Pure, like `checkNarrativeNumbers`; the caller does I/O and rendering.
 * Advisory: a flag renders in the packet and digest and is counted beside
 * `wrong_fact`; the human verdict stays the gate. The context brief (#933)
 * treats an unresolved flag as "needs review", never as silent send.
 */

import { ONE_DAY_MS, parseDatesInText } from '@/lib/utils/date-utils';

export interface DateEvidenceDoc {
  publishedAt: string | null;
  /** `courtlistener` earns the one-day filing tolerance; every other origin is exact. */
  sourceOrigin?: string | null;
  /** Content plus any verbatim excerpts the judge saw. */
  text?: string | null;
}

export interface DateViolation {
  /** As written in the tip. */
  raw: string;
  iso: string;
  /** The matched document date closest to the tip's date, and how far off it is. */
  nearestPublished: string | null;
  distanceDays: number | null;
}

export interface DateGuardOptions {
  /** Override the per-source tolerance (days a tip date may differ from a publication date). */
  toleranceDays?: number;
  /** Year assumed for a tip date written without one ("Sept. 13"). */
  defaultYear?: number;
}

/** Opinions carry the cluster's filing date, a day after the decision (#741). */
const COURTLISTENER_TOLERANCE_DAYS = 1;

function toleranceFor(doc: DateEvidenceDoc, override?: number): number {
  if (override !== undefined) return override;
  return doc.sourceOrigin === 'courtlistener' ? COURTLISTENER_TOLERANCE_DAYS : 0;
}

const dayOf = (iso: string | null): string | null => (iso ? iso.slice(0, 10) : null);

/** Whole-day distance between two YYYY-MM-DD strings (UTC midnights). */
function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / ONE_DAY_MS;
}

/** Calendar dates written in a document's text, in the document's own year when absent. */
function datesInDoc(doc: DateEvidenceDoc): Set<string> {
  const year = doc.publishedAt ? new Date(doc.publishedAt).getUTCFullYear() : undefined;
  return new Set(parseDatesInText(doc.text ?? '', year).map((d) => d.iso));
}

interface PublishedDate {
  day: string;
  tolerance: number;
}

/** Dates the tip states that no matched document supports. One violation per date. */
export function checkTipDates(
  tipText: string,
  docs: readonly DateEvidenceDoc[],
  opts: DateGuardOptions = {},
): DateViolation[] {
  const published: PublishedDate[] = docs.flatMap((d) => {
    const day = dayOf(d.publishedAt);
    return day ? [{ day, tolerance: toleranceFor(d, opts.toleranceDays) }] : [];
  });
  const mentioned = new Set(docs.flatMap((d) => [...datesInDoc(d)]));
  const seen = new Set<string>();
  const violations: DateViolation[] = [];
  for (const date of parseDatesInText(tipText, opts.defaultYear)) {
    if (seen.has(date.iso)) continue;
    seen.add(date.iso);
    if (mentioned.has(date.iso)) continue;
    const distances = published.map((p) => ({ ...p, d: daysBetween(p.day, date.iso) }));
    if (distances.some(({ d, tolerance }) => d <= tolerance)) continue;
    const nearest = distances.sort((a, b) => a.d - b.d)[0];
    violations.push({
      raw: date.raw,
      iso: date.iso,
      nearestPublished: nearest?.day ?? null,
      distanceDays: nearest ? Math.round(nearest.d) : null,
    });
  }
  return violations;
}

/** Operator-facing line: what the tip said, what the record says. */
export function describeDateViolation(v: DateViolation): string {
  const nearest =
    v.nearestPublished === null
      ? 'no matched document carries a date'
      : `nearest document date is ${v.nearestPublished} (${v.distanceDays} day(s) off)`;
  return `tip says "${v.raw}" (${v.iso}); ${nearest}; no document text mentions it`;
}
