/**
 * R-TIPWIRE coverage rendering (#866; own/others split R-TIPWIRE-4 #874).
 * Operator-facing digest/packet lines; the sent tip never carries this.
 *
 * Two answers per tip: "your outlet already ran this" (per listed reporter,
 * from the per-host hits) and "others already ran this" (everything else).
 * A check that could not run says so and hands the owner the outlet search —
 * the tip still ships (owner decision 2026-09-08).
 */

import { hostMatchesDomain } from '@/lib/data/coverage-outlets';
import type { TipCoverageCheck } from '@/lib/db/schema';

export interface OutletRef {
  name: string;
  domain: string;
}

const OWN_URLS_SHOWN = 2;

export const COVERAGE_UNAVAILABLE_LINE =
  'Coverage: outlet check unavailable — search the outlet before sending (GDELT unreachable, or no identifier-grade key)';

const okKeys = (c: TipCoverageCheck) => c.keys.filter((k) => !k.error);

function headLine(c: TipCoverageCheck): string {
  const hits = okKeys(c).reduce((n, k) => n + k.hits, 0);
  return {
    'checkable-zero': `Coverage: 0 hits in ${c.windowDays}d (checkable claim)`,
    niche: `Coverage: ${hits} hit(s) in ${c.windowDays}d, all niche — see URLs`,
    'likely-covered': `Coverage: ${hits} hit(s) in ${c.windowDays}d — likely covered, read before sending`,
    'not-checkable': COVERAGE_UNAVAILABLE_LINE,
  }[c.label];
}

/** Unique hit URLs across keys, split by whether the host belongs to one of `outlets`. */
function splitHits(c: TipCoverageCheck, outlets: OutletRef[]) {
  const own = new Map<string, string[]>(outlets.map((o) => [o.domain, []]));
  const others = new Set<string>();
  const seen = new Set<string>();
  for (const k of okKeys(c)) {
    for (const [host, urls] of Object.entries(k.hitsByDomain ?? {})) {
      const outlet = outlets.find((o) => hostMatchesDomain(host, o.domain));
      for (const u of urls) {
        if (seen.has(u)) continue;
        seen.add(u);
        if (outlet) own.get(outlet.domain)?.push(u);
        else others.add(u);
      }
    }
  }
  return { own, others: others.size };
}

/** Per-outlet own-hit lines plus an "Others" count; "unknown" for checks stored before the split. */
function ownOutletLines(c: TipCoverageCheck, outlets: OutletRef[], candidateId?: number): string[] {
  if (outlets.length === 0) return [];
  if (!okKeys(c).some((k) => k.hitsByDomain !== undefined)) {
    const rerun = candidateId ? `; re-run pnpm tips:coverage --candidate ${candidateId}` : '';
    return outlets.map(
      (o) =>
        `  Own outlet — ${o.name} (${o.domain}): unknown (check predates the outlet split${rerun})`,
    );
  }
  const { own, others } = splitHits(c, outlets);
  const lines = outlets.flatMap((o) => {
    const urls = own.get(o.domain) ?? [];
    return [
      `  Own outlet — ${o.name} (${o.domain}): ${urls.length} hit(s)`,
      ...urls.slice(0, OWN_URLS_SHOWN).map((u) => `    · ${u}`),
    ];
  });
  return [...lines, `  Others: ${others} hit(s)`];
}

function keyLines(c: TipCoverageCheck): string[] {
  return c.keys.flatMap((k) =>
    k.error ? [`  · "${k.key}": ${k.error}`] : k.sampleUrls.map((u) => `  · "${k.key}": ${u}`),
  );
}

/** Digest/packet lines. `outlets`: the listed reporters' outlets; `candidateId` only for the re-run hint. */
export function coverageLine(
  c: TipCoverageCheck | null | undefined,
  outlets: OutletRef[] = [],
  candidateId?: number,
): string[] {
  if (!c) return ['Coverage: not yet checked'];
  if (c.label === 'not-checkable') return [headLine(c), ...keyLines(c)];
  // Several listed reporters may share an outlet: one line per outlet.
  const distinct = outlets.filter((o, i) => outlets.findIndex((x) => x.domain === o.domain) === i);
  return [headLine(c), ...ownOutletLines(c, distinct, candidateId), ...keyLines(c)];
}
