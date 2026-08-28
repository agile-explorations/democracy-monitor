/**
 * Report builder for `pnpm narratives:verify` (#700): the deterministic
 * number check applied to STORED weekly summaries against CURRENT data.
 * Pure — the CLI loads rows and rebuilds each week's allowed set.
 *
 * Three classes, because a stored summary can disagree with today's data
 * for different reasons:
 *   - enumeration: count word ≠ list length — an error in the artifact itself
 *   - categories:  a category count not in today's factual block — probably
 *                  an error (statuses rarely drift), possibly a later flip
 *   - documents:   a document total not in today's block — usually drift
 *                  (late documents, purges); the as-of stamp covers it
 */

import {
  checkEnumerations,
  extractCountClaims,
  describeViolation,
  findEnumerations,
} from '@/lib/services/narrative-number-check';
import type { NumberViolation } from '@/lib/services/narrative-number-check';

export interface StoredSummary {
  weekOf: string;
  version: string;
  content: string;
}

export interface SummaryFindings {
  weekOf: string;
  version: string;
  enumeration: string[];
  categories: string[];
  documents: string[];
}

export interface VerifyReport {
  weeks: number;
  rows: number;
  findings: SummaryFindings[];
  totals: { enumeration: number; categories: number; documents: number };
}

function describeCount(
  kind: 'count' | 'comparison',
  raw: string,
  context: string,
  index: number,
): string {
  return describeViolation({
    kind,
    raw,
    value: Number(raw.replace(/,/g, '')) || 0,
    context,
    index,
  });
}

/** Findings for one stored summary against that week's allowed numbers. */
export function verifyStoredSummary(
  row: StoredSummary,
  allowed: Set<number>,
  titles?: string[],
): SummaryFindings {
  const findings: SummaryFindings = {
    weekOf: row.weekOf,
    version: row.version,
    enumeration: checkEnumerations(row.content, titles).map(describeViolation),
    categories: [],
    documents: [],
  };
  const clean = row.content.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Any enumeration head is judged by its list (consistent or not), not the block.
  const heads = new Set(findEnumerations(row.content, titles).map((e) => e.index));
  for (const claim of extractCountClaims(clean)) {
    if (allowed.has(claim.value) || heads.has(claim.index)) continue;
    const from = Math.max(0, claim.index - 60);
    const context = clean.slice(from, claim.index + claim.raw.length + 60).replace(/\s+/g, ' ');
    const line = describeCount(claim.kind, claim.raw, context, claim.index);
    if (claim.noun === 'categories') findings.categories.push(line);
    else findings.documents.push(line);
  }
  return findings;
}

export function buildVerifyReport(
  rows: StoredSummary[],
  allowedByWeek: Map<string, Set<number>>,
  titles?: string[],
): VerifyReport {
  const findings = rows
    .map((row) => verifyStoredSummary(row, allowedByWeek.get(row.weekOf) ?? new Set(), titles))
    .filter((f) => f.enumeration.length + f.categories.length + f.documents.length > 0);
  return {
    weeks: new Set(rows.map((r) => r.weekOf)).size,
    rows: rows.length,
    findings,
    totals: {
      enumeration: findings.reduce((n, f) => n + f.enumeration.length, 0),
      categories: findings.reduce((n, f) => n + f.categories.length, 0),
      documents: findings.reduce((n, f) => n + f.documents.length, 0),
    },
  };
}

/** Console rendering: definitive first, then probable, then informational. */
export function renderVerifyReport(report: VerifyReport): string[] {
  const lines = [
    `Checked ${report.rows} stored summaries across ${report.weeks} weeks — ` +
      `enumeration mismatches: ${report.totals.enumeration} (definitive), ` +
      `category counts: ${report.totals.categories} (probable), ` +
      `document totals: ${report.totals.documents} (drift, informational)`,
  ];
  for (const f of report.findings) {
    for (const e of f.enumeration) lines.push(`  ${f.weekOf} ${f.version} ENUMERATION  ${e}`);
    for (const c of f.categories) lines.push(`  ${f.weekOf} ${f.version} CATEGORIES   ${c}`);
    for (const d of f.documents) lines.push(`  ${f.weekOf} ${f.version} DOCUMENTS    ${d}`);
  }
  return lines;
}

export type { NumberViolation };
