import { ROBOTS_REGISTRY } from '@/lib/data/robots-registry';
import type { RobotsRegistryEntry } from '@/lib/data/robots-registry';

/**
 * Programmatic robots.txt compliance (owner directive 2026-08-08): every host
 * in the robots registry is audited on every weekly snapshot run and via
 * `pnpm validate:robots`. Evaluation follows RFC 9309 semantics: the group for
 * our own user-agent token wins over `*`; within a group the longest matching
 * rule decides; Allow wins length ties; `*` wildcards and `$` anchors are
 * honored; an empty Disallow permits everything.
 */

const OUR_UA_TOKEN = 'democracymonitor';
const FETCH_TIMEOUT_MS = 15_000;

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface RobotsVerdict {
  host: string;
  path: string;
  allowed: boolean;
  /** The matched rule pattern, or null when no rule matched (default allow). */
  matchedRule: string | null;
  kind: RobotsRegistryEntry['kind'];
  status: RobotsRegistryEntry['status'];
}

export interface RobotsHostRecord {
  host: string;
  /** HTTP status of the robots.txt fetch (null = network failure). */
  fetchStatus: number | null;
  /** Raw robots.txt body observed at check time (null when unreachable). */
  robotsTxt: string | null;
}

export interface RobotsAuditResult {
  verdicts: RobotsVerdict[];
  /** Disallowed paths on crawl-kind hosts — the actionable violations. */
  violations: RobotsVerdict[];
  /** Hosts whose robots.txt could not be fetched (audited as default-allow). */
  unreachableHosts: string[];
  /** Raw per-host evidence for the persisted audit trail. */
  hostRecords: RobotsHostRecord[];
}

/** Parse robots.txt into per-rule lists for the group governing our UA (pure). */
export function parseRobotsRules(text: string): RobotsRule[] {
  const starRules: RobotsRule[] = [];
  const ourRules: RobotsRule[] = [];
  let currentAgents: string[] = [];
  let inGroupBody = false;

  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (inGroupBody) currentAgents = [];
      currentAgents.push(value.toLowerCase());
      inGroupBody = false;
    } else if (field === 'allow' || field === 'disallow') {
      inGroupBody = true;
      const rule = { allow: field === 'allow', pattern: value };
      if (currentAgents.includes('*')) starRules.push(rule);
      if (currentAgents.some((a) => a !== '*' && OUR_UA_TOKEN.includes(a))) ourRules.push(rule);
    } else {
      inGroupBody = true;
    }
  }
  return ourRules.length > 0 ? ourRules : starRules;
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped.endsWith('\\$') ? escaped.slice(0, -2) + '$' : escaped}`);
}

/** Evaluate one path against parsed rules — longest match wins, Allow wins ties (pure). */
export function isPathAllowed(
  rules: RobotsRule[],
  path: string,
): { allowed: boolean; matchedRule: string | null } {
  let best: { rule: RobotsRule; length: number } | null = null;
  for (const rule of rules) {
    if (rule.pattern === '') continue; // empty Disallow = allow all; matches nothing
    if (!patternToRegex(rule.pattern).test(path)) continue;
    const length = rule.pattern.replace(/\*/g, '').length;
    if (
      best === null ||
      length > best.length ||
      (length === best.length && rule.allow && !best.rule.allow)
    ) {
      best = { rule, length };
    }
  }
  if (!best) return { allowed: true, matchedRule: null };
  return {
    allowed: best.rule.allow,
    matchedRule: `${best.rule.allow ? 'Allow' : 'Disallow'}: ${best.rule.pattern}`,
  };
}

async function fetchRobotsTxt(
  host: string,
): Promise<{ text: string | null; status: number | null }> {
  try {
    const response = await fetch(`https://${host}/robots.txt`, {
      headers: { 'User-Agent': 'DemocracyMonitor/1.0 (civic monitoring)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
    // 4xx (incl. 404 "no robots") ⇒ unrestricted per RFC 9309 §2.3.1.2.
    if (!response.ok) {
      return { text: response.status >= 500 ? null : '', status: response.status };
    }
    return { text: await response.text(), status: response.status };
  } catch (err) {
    console.warn(`[robots-compliance] robots.txt fetch failed for ${host}: ${err}`);
    return { text: null, status: null };
  }
}

/**
 * Audit every registry entry against its host's live robots.txt.
 * A Disallowed path on a crawl-kind host is a violation; API hosts report as
 * verdicts only (their access is governed by API terms, not crawling norms).
 */
export async function auditRobotsCompliance(
  registry: ReadonlyArray<RobotsRegistryEntry> = ROBOTS_REGISTRY,
): Promise<RobotsAuditResult> {
  const verdicts: RobotsVerdict[] = [];
  const unreachableHosts: string[] = [];
  const hostRecords: RobotsHostRecord[] = [];
  const byHost = new Map<string, RobotsRegistryEntry[]>();
  for (const entry of registry) {
    byHost.set(entry.host, [...(byHost.get(entry.host) ?? []), entry]);
  }

  for (const [host, entries] of byHost) {
    const { text, status } = await fetchRobotsTxt(host);
    hostRecords.push({ host, fetchStatus: status, robotsTxt: text });
    if (text === null) {
      unreachableHosts.push(host);
      continue;
    }
    const rules = parseRobotsRules(text);
    for (const entry of entries) {
      for (const path of entry.paths) {
        const { allowed, matchedRule } = isPathAllowed(rules, path);
        verdicts.push({ host, path, allowed, matchedRule, kind: entry.kind, status: entry.status });
      }
    }
  }

  const violations = verdicts.filter((v) => !v.allowed && v.kind === 'crawl');
  return { verdicts, violations, unreachableHosts, hostRecords };
}

/**
 * Persist an audit to the robots_audit trail — one row per host with the raw
 * robots.txt observed and that host's verdicts. The evidentiary record behind
 * "we were compliant when we retrieved these documents".
 */
export async function persistRobotsAudit(
  result: RobotsAuditResult,
  trigger: 'snapshot' | 'manual' | 'retrospective',
  note?: string,
  robotsSource: 'live' | 'wayback' = 'live',
): Promise<number> {
  const { isDbAvailable, getDb } = await import('@/lib/db');
  if (!isDbAvailable()) {
    console.warn('[robots-compliance] DB unavailable — audit NOT persisted');
    return 0;
  }
  const { robotsAudit } = await import('@/lib/db/schema');
  const rows = result.hostRecords.map((record) => {
    const hostVerdicts = result.verdicts.filter((v) => v.host === record.host);
    return {
      trigger,
      host: record.host,
      fetchStatus: record.fetchStatus,
      robotsTxt: record.robotsTxt,
      robotsSource,
      verdicts: hostVerdicts,
      violationCount: hostVerdicts.filter((v) => !v.allowed && v.kind === 'crawl').length,
      note: note ?? null,
    };
  });
  if (rows.length === 0) return 0;
  await getDb().insert(robotsAudit).values(rows);
  return rows.length;
}

/** Console-log an audit result in the pipeline's standard format. */
export function reportRobotsAudit(result: RobotsAuditResult, label: string): void {
  const { verdicts, violations, unreachableHosts } = result;
  console.log(
    `[${label}] robots audit: ${verdicts.length} host-paths checked, ${violations.length} violation(s), ${unreachableHosts.length} unreachable host(s)`,
  );
  for (const v of violations) {
    console.error(
      `[${label}] ROBOTS VIOLATION: ${v.host}${v.path} (${v.status}) — ${v.matchedRule}`,
    );
  }
  for (const h of unreachableHosts) {
    console.warn(
      `[${label}] robots.txt unreachable for ${h} (5xx/network) — treating as unverified`,
    );
  }
}
