/**
 * R-TIPWIRE coverage rendering (#866; own/others split R-TIPWIRE-4 #874;
 * attribution + expired URLs R-TIPWIRE-5 #922).
 * Operator-facing digest/packet lines; the sent tip never carries this.
 *
 * Two answers per tip: "your outlet already ran this" (per listed reporter,
 * from the per-host hits) and "others already ran this" (everything else).
 * A check that could not run says so and hands the owner the outlet search —
 * the tip still ships (owner decision 2026-09-08). Once a candidate closes
 * the hit URLs are pruned (Brave ToS); the counts and hosts still render.
 */

import { COVERAGE_URL_RETENTION_DAYS, hostMatchesDomain } from '@/lib/data/coverage-outlets';
import type { TipCoverageCheck } from '@/lib/db/schema';

export interface OutletRef {
  name: string;
  domain: string;
}

const OWN_URLS_SHOWN = 2;

export const COVERAGE_UNAVAILABLE_LINE =
  'Coverage: outlet check unavailable — search the outlet before sending (search API unreachable, or no key a web index can answer)';
/** A quoted report/docket number matches only pages that print it (#925). */
const CODE_ZERO_NOTE = '0 exact matches — coverage rarely prints report or docket numbers';
/** Brave Search API ToS §4(d): attribution wherever results display. */
export const POWERED_BY_BRAVE_LINE = '  Powered by Brave';

const okKeys = (c: TipCoverageCheck) => c.keys.filter((k) => !k.error);
const rerunHint = (candidateId?: number) =>
  candidateId ? `; re-run pnpm tips:coverage --candidate ${candidateId}` : '';

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

/** After the prune only hostnames remain: say whether the outlet was among them. */
function prunedOutletLines(c: TipCoverageCheck, outlets: OutletRef[]): string[] {
  const hosts = okKeys(c).flatMap((k) => Object.keys(k.hitsByDomain ?? {}));
  return outlets.map((o) =>
    hosts.some((h) => hostMatchesDomain(h, o.domain))
      ? `  Own outlet — ${o.name} (${o.domain}): hit(s) seen, URLs expired`
      : `  Own outlet — ${o.name} (${o.domain}): 0 hit(s)`,
  );
}

/** Per-outlet own-hit lines plus an "Others" count; "unknown" for checks stored before the split. */
function ownOutletLines(c: TipCoverageCheck, outlets: OutletRef[], candidateId?: number): string[] {
  if (outlets.length === 0) return [];
  if (!okKeys(c).some((k) => k.hitsByDomain !== undefined)) {
    return outlets.map(
      (o) =>
        `  Own outlet — ${o.name} (${o.domain}): unknown (check predates the outlet split${rerunHint(candidateId)})`,
    );
  }
  if (c.urlsPrunedAt) return prunedOutletLines(c, outlets);
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

/** One line per key: its error, the code-zero note, or its sample URLs. */
function keyLine(k: TipCoverageCheck['keys'][number], pruned: boolean): string[] {
  if (k.error) return [`  · "${k.key}": ${k.error}`];
  if (k.kind === 'code' && k.hits === 0) return [`  · "${k.key}": ${CODE_ZERO_NOTE}`];
  return pruned ? [] : k.sampleUrls.map((u) => `  · "${k.key}": ${u}`);
}

function keyLines(c: TipCoverageCheck, candidateId?: number): string[] {
  const pruned = c.urlsPrunedAt !== undefined;
  const lines = c.keys.flatMap((k) => keyLine(k, pruned));
  if (!pruned) return lines;
  const day = c.urlsPrunedAt?.slice(0, 10);
  return [
    ...lines,
    `  · hit URLs expired ${day} (not retained after the candidate closes / ${COVERAGE_URL_RETENTION_DAYS} d${rerunHint(candidateId)})`,
  ];
}

/** Digest/packet lines. `outlets`: the listed reporters' outlets; `candidateId` only for the re-run hint. */
export function coverageLine(
  c: TipCoverageCheck | null | undefined,
  outlets: OutletRef[] = [],
  candidateId?: number,
): string[] {
  if (!c) return ['Coverage: not yet checked'];
  // Several listed reporters may share an outlet: one line per outlet.
  const distinct = outlets.filter((o, i) => outlets.findIndex((x) => x.domain === o.domain) === i);
  const lines =
    c.label === 'not-checkable'
      ? [headLine(c), ...keyLines(c, candidateId)]
      : [headLine(c), ...ownOutletLines(c, distinct, candidateId), ...keyLines(c, candidateId)];
  return c.provider === 'brave' ? [...lines, POWERED_BY_BRAVE_LINE] : lines;
}
