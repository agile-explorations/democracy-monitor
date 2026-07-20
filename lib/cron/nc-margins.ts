/**
 * CLI: pnpm nc:margins [--out FILE] [--diff FILE]
 *
 * Captures negative-control margins (actual vs threshold, per-category detail
 * values) as JSON, and diffs two captures. Built for the #556 parity runbook:
 * capture before a data operation, capture after, and see exactly how much
 * each NC margin moved — not just pass/fail.
 */

import * as fs from 'fs';
import type { NegativeControlResult } from '@/lib/services/event-validation-checks';
import { runNegativeControls } from '@/lib/services/event-validation-service';
import { checkHelp } from '@/lib/utils/cli-help';

interface Capture {
  capturedAt: string;
  controls: NegativeControlResult[];
}

function fmtDetail(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function printCapture(c: Capture): void {
  console.log(`\nNC margins (captured ${c.capturedAt}):`);
  for (const nc of c.controls) {
    console.log(
      `  ${nc.pass ? '✓' : '✗'} ${nc.id}: actual ${nc.actual} | threshold ${nc.threshold}`,
    );
  }
}

function printDiff(before: Capture, after: Capture): void {
  console.log(`\nNC margin diff: ${before.capturedAt} → ${after.capturedAt}`);
  for (const nc of after.controls) {
    const prev = before.controls.find((p) => p.id === nc.id);
    if (!prev) {
      console.log(`  ${nc.id}: (new) actual ${nc.actual} | threshold ${nc.threshold}`);
      continue;
    }
    const changed = prev.actual !== nc.actual || prev.pass !== nc.pass;
    console.log(
      `  ${nc.pass ? '✓' : '✗'} ${nc.id}: ${prev.actual} → ${nc.actual}` +
        ` (threshold ${nc.threshold})${changed ? '' : '  [unchanged]'}`,
    );
    const prevDetails = new Map((prev.details ?? []).map((d) => [d.category, d.value]));
    for (const d of nc.details ?? []) {
      const pv = prevDetails.get(d.category);
      if (pv === undefined || Math.abs(pv - d.value) < 1e-9) continue;
      console.log(
        `      ${d.category}: ${fmtDetail(pv)} → ${fmtDetail(d.value)}` +
          ` (Δ ${((d.value - pv) * 100).toFixed(2)}pp)${d.pass ? '' : ' ✗'}`,
      );
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const diffIdx = args.indexOf('--diff');
  const outFile = outIdx >= 0 ? args[outIdx + 1] : undefined;
  const diffFile = diffIdx >= 0 ? args[diffIdx + 1] : undefined;

  const capture: Capture = {
    capturedAt: new Date().toISOString(),
    controls: await runNegativeControls(),
  };

  printCapture(capture);
  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(capture, null, 1));
    console.log(`\nSaved to ${outFile}`);
  }
  if (diffFile) {
    const before = JSON.parse(fs.readFileSync(diffFile, 'utf8')) as Capture;
    printDiff(before, capture);
  }
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(
    process.argv.slice(2),
    `Usage: pnpm nc:margins [options]

Captures negative-control margins (actual vs threshold + per-category values).

Options:
  --out <file>    Save the capture as JSON
  --diff <file>   Diff the current margins against a previous capture`,
  );
  main().catch((err) => {
    console.error('[nc-margins] Fatal:', err);
    process.exit(1);
  });
}
