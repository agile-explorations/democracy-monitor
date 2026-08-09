/**
 * CLI: pnpm robots:attest -- --window YYYYMMDD [--confirm]
 *
 * Retrospective robots.txt attestation (#685): for each ACTIVE crawl host in
 * the robots registry, fetch the Wayback Machine's capture of that host's
 * robots.txt nearest the given date, evaluate the paths we crawled, and
 * persist the verdicts to the robots_audit trail with robots_source='wayback'.
 *
 * This is the evidentiary record for documents retrieved BEFORE the live
 * weekly audit existed: third-party-archived robots text proving what each
 * host's policy said during the fetch window. It records violations as
 * faithfully as compliance — the dhs.gov /archive/ rule appears as a
 * violation row (remediated per #685), which is what makes the rest of the
 * trail credible.
 */

import { ROBOTS_REGISTRY } from '@/lib/data/robots-registry';
import {
  isPathAllowed,
  parseRobotsRules,
  persistRobotsAudit,
} from '@/lib/services/robots-compliance';
import type { RobotsAuditResult, RobotsVerdict } from '@/lib/services/robots-compliance';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';

const WAYBACK_DELAY_MS = 2_000;
const FETCH_TIMEOUT_MS = 45_000;

/** Paths crawled before the live audit existed but absent from the forward
 * registry — attested so the trail covers what actually happened. */
const HISTORICAL_PATHS: Record<string, string[]> = {
  'www.dhs.gov': ['/archive/news', '/archive/news/2022/01/01/example'],
};

async function fetchWaybackRobots(
  host: string,
  window: string,
): Promise<{ text: string; captureUrl: string } | null> {
  const url = `https://web.archive.org/web/${window}id_/https://${host}/robots.txt`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'DemocracyMonitor/1.0 (civic monitoring)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!response.ok) {
      console.warn(`[robots-attest] ${response.status} for ${url}`);
      return null;
    }
    return { text: await response.text(), captureUrl: response.url };
  } catch (err) {
    console.warn(`[robots-attest] fetch failed for ${url}: ${err}`);
    return null;
  }
}

async function run(window: string, confirm: boolean): Promise<void> {
  const activeCrawlHosts = ROBOTS_REGISTRY.filter(
    (e) => e.kind === 'crawl' && e.status === 'active',
  );
  const byHost = new Map<string, string[]>();
  for (const entry of activeCrawlHosts) {
    byHost.set(entry.host, [
      ...(byHost.get(entry.host) ?? []),
      ...entry.paths,
      ...(HISTORICAL_PATHS[entry.host] ?? []),
    ]);
  }

  const verdicts: RobotsVerdict[] = [];
  const hostRecords: RobotsAuditResult['hostRecords'] = [];
  const captureNotes: string[] = [];

  for (const [host, paths] of byHost) {
    await sleep(WAYBACK_DELAY_MS);
    const capture = await fetchWaybackRobots(host, window);
    if (!capture) {
      hostRecords.push({ host, fetchStatus: null, robotsTxt: null });
      captureNotes.push(`${host}: NO WAYBACK CAPTURE near ${window}`);
      continue;
    }
    hostRecords.push({ host, fetchStatus: 200, robotsTxt: capture.text });
    captureNotes.push(`${host}: ${capture.captureUrl}`);
    const rules = parseRobotsRules(capture.text);
    for (const path of paths) {
      const { allowed, matchedRule } = isPathAllowed(rules, path);
      verdicts.push({ host, path, allowed, matchedRule, kind: 'crawl', status: 'active' });
      const flag = allowed ? '✓' : '✗ VIOLATION';
      console.log(`  ${flag} ${host}${path}${matchedRule ? ` — ${matchedRule}` : ''}`);
    }
  }

  const violations = verdicts.filter((v) => !v.allowed);
  const result: RobotsAuditResult = {
    verdicts,
    violations,
    unreachableHosts: hostRecords.filter((r) => r.robotsTxt === null).map((r) => r.host),
    hostRecords,
  };
  console.log(
    `[robots-attest] window ${window}: ${verdicts.length} host-paths, ${violations.length} violation(s) at retrieval time`,
  );

  if (!confirm) {
    console.log('[robots-attest] dry-run — pass --confirm to persist to the audit trail');
    return;
  }
  const persisted = await persistRobotsAudit(
    result,
    'retrospective',
    `Wayback-evidenced attestation for fetch window ${window} (#685). Captures: ${captureNotes.join(' | ')}`,
    'wayback',
  );
  console.log(`[robots-attest] persisted ${persisted} host rows to robots_audit`);
}

function parseCliArgs(args: string[]): { window: string; confirm: boolean } {
  let window = '';
  let confirm = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--window') window = args[++i];
    else if (args[i] === '--confirm') confirm = true;
  }
  if (!/^\d{8}$/.test(window)) throw new Error('--window YYYYMMDD required');
  return { window, confirm };
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm robots:attest -- --window YYYYMMDD [--confirm]

Retrospective robots.txt attestation from Wayback captures for a past fetch
window. Persists to robots_audit with robots_source='wayback'. Records
violations as faithfully as compliance.`,
  );
  const { window, confirm } = parseCliArgs(argv);
  run(window, confirm)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[robots-attest] failed:', err);
      process.exit(1);
    });
}
