/**
 * validate:funnel (#547) — per-source pipeline funnel diagnostic.
 *
 * For each (category, source_origin) over a time window, reports the drop-off
 * across RETRIEVED → passed RELEVANCE → P1 flagged → P2 confirmed, and flags
 * SOURCES WHOSE STAGE COLLAPSES (real volume in, ~nothing out) against their
 * category siblings. The motivating case is the mediaFreedom contamination
 * (#524): thousands of FR docs retrieved, ~0% ever flagged.
 *
 * Usage: pnpm validate:funnel [--days N] [--from YYYY-MM-DD --to YYYY-MM-DD]
 *                             [--category KEY] [--json]
 * Exit: 0 = clean (warns allowed), 2 = error-tier collapse, 1 = fatal.
 */

import type { FunnelCollapseResult, SourceFunnel } from '@/lib/services/funnel-collapse-checks';
import { runFunnelValidation } from '@/lib/services/funnel-validation-service';
import type { FunnelReport } from '@/lib/services/funnel-validation-service';
import { checkHelp } from '@/lib/utils/cli-help';

interface FunnelArgs {
  days?: number;
  from?: string;
  to?: string;
  category?: string;
  json: boolean;
}

function parseArgs(argv: string[]): FunnelArgs {
  const val = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const daysRaw = val('--days');
  const days = daysRaw !== undefined ? Number(daysRaw) : undefined;
  return {
    days: days !== undefined && Number.isFinite(days) && days > 0 ? days : undefined,
    from: val('--from'),
    to: val('--to'),
    category: val('--category'),
    json: argv.includes('--json'),
  };
}

const num = (n: number): string => n.toLocaleString('en-US');
const pctOrDash = (n: number, d: number): string =>
  d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '—';

/** Collapse marker for a source: ✗ (error), ⚠ (warn), or ✓ (clean). */
function statusFor(source: SourceFunnel, collapses: FunnelCollapseResult[]): string {
  const mine = collapses.filter(
    (c) => c.category === source.category && c.sourceOrigin === source.sourceOrigin,
  );
  if (mine.length === 0) return '✓';
  const worst = mine.some((c) => c.severity === 'error') ? '✗' : '⚠';
  const label = mine.map((c) => `${c.stage.toUpperCase()} ${c.severity}`).join(', ');
  const reason = mine.map((c) => c.reason).join('; ');
  return `${worst} ${label} — ${reason}`;
}

function printReport(report: FunnelReport): void {
  const { window, sources, collapses } = report;
  const span = window.days !== null ? `last ${window.days} days` : `${window.from} → ${window.to}`;
  console.log(`\n=== Funnel diagnostic (validate:funnel) — ${span} ===`);

  const byCategory = new Map<string, SourceFunnel[]>();
  for (const s of sources) {
    const arr = byCategory.get(s.category) ?? [];
    arr.push(s);
    byCategory.set(s.category, arr);
  }

  for (const category of [...byCategory.keys()].sort()) {
    const rows = byCategory.get(category)!.sort((a, b) => b.stages.retrieved - a.stages.retrieved);
    console.log(`\n${category}`);
    console.log(`  ${'source'.padEnd(20)}${'RETRIEVED'.padStart(11)}  →REL%  →P1%   →P2%   status`);
    for (const s of rows) {
      const st = s.stages;
      const line =
        `  ${s.sourceOrigin.padEnd(20)}${num(st.retrieved).padStart(11)}  ` +
        `${pctOrDash(st.passedRelevance, st.retrieved).padStart(5)}  ` +
        `${pctOrDash(st.p1Flagged, st.passedRelevance).padStart(5)}  ` +
        `${pctOrDash(st.p2Confirmed, st.p1Flagged).padStart(5)}  ${statusFor(s, collapses)}`;
      console.log(line);
    }
  }

  const errors = collapses.filter((c) => c.severity === 'error');
  const warns = collapses.filter((c) => c.severity === 'warn');
  if (warns.length > 0) {
    console.log(`\n  ${warns.length} warning(s): ${warns.map((c) => c.id).join(', ')}`);
  }
  if (errors.length > 0) {
    console.log(
      `\nALERT: ${errors.length} error-tier collapse(s): ${errors.map((c) => c.id).join(', ')}`,
    );
  } else {
    console.log('\n  No error-tier collapses.');
  }

  // Detection-health warns (#840): audit-FN + discussion-share, own window.
  console.log(
    `\nDetection health (${report.healthWindow.from} → ${report.healthWindow.to}, warn-tier only):`,
  );
  if (report.health.length === 0) {
    console.log('  all categories within thresholds');
  } else {
    for (const h of report.health) console.log(`  ⚠ ${h.id}: ${h.reason}`);
  }
}

if (require.main === module) {
  const savedDbUrl = process.env.DATABASE_URL;
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  if (savedDbUrl) process.env.DATABASE_URL = savedDbUrl;

  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm validate:funnel [--days N] [--from YYYY-MM-DD --to YYYY-MM-DD] [--category KEY] [--json]

Per-source pipeline funnel (RETRIEVED → RELEVANCE → P1 → P2) grouped by
(category, source_origin) over a window (default 90 days). Flags sources whose
stage collapses against their category siblings. Exits 2 on an error-tier
collapse, 0 otherwise.`,
  );

  const args = parseArgs(argv);
  runFunnelValidation(args)
    .then((report) => {
      if (args.json) console.log(JSON.stringify(report));
      else printReport(report);
      const hasError = report.collapses.some((c) => c.severity === 'error');
      process.exit(hasError ? 2 : 0);
    })
    .catch((err) => {
      console.error('[validate:funnel] Fatal:', err);
      process.exit(1);
    });
}
