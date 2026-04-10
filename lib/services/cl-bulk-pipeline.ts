/**
 * CourtListener bulk data utilities — CSV parsing, NOS routing, date ranges.
 *
 * Pure functions used by the database staging pipeline (cl-bulk-staging.ts).
 * The 4-pass in-memory streaming pipeline has been replaced by PostgreSQL
 * staging tables — see cl-bulk-staging.ts for the current implementation.
 */

import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BulkPipelineResult {
  docketsMatched: number;
  clustersMatched: number;
  opinionsMatched: number;
  documentsStored: number;
}

// ---------------------------------------------------------------------------
// NOS routing — replicates category signal definitions from categories.ts
// ---------------------------------------------------------------------------

/** NOS codes and their category routing (mirrors signal definitions). */
const NOS_ROUTING: Record<string, string[]> = {
  '440': ['lawEnforcement', 'civilLiberties'],
  '530': ['lawEnforcement', 'civilLiberties'],
  '890': ['lawEnforcement'],
};

const MATCHED_NOS_CODES = new Set(Object.keys(NOS_ROUTING));

/**
 * First-amendment text match — replicates CL search query:
 * "first amendment" AND (violation OR injunction OR challenge OR retaliation OR "free speech" OR "free press")
 */
const FIRST_AMENDMENT_RE = /\bfirst amendment\b/i;
const FIRST_AMENDMENT_QUALIFIERS =
  /\b(violation|injunction|challenge|retaliation|free speech|free press)\b/i;

export function matchesFirstAmendment(caseName: string, cause: string): boolean {
  const text = `${caseName} ${cause}`;
  return FIRST_AMENDMENT_RE.test(text) && FIRST_AMENDMENT_QUALIFIERS.test(text);
}

/** Extract the 3-digit NOS code from CL's nature_of_suit field (e.g. "440 Civil rights other"). */
export function extractNosCode(nos: string): string | null {
  const match = nos.match(/^(\d{3})/);
  return match ? match[1] : null;
}

/** Determine which categories a docket routes to based on NOS code and text match. */
export function routeDocket(nos: string, caseName: string, cause: string): string[] {
  const nosCode = extractNosCode(nos);
  const categories: string[] = [];
  if (nosCode && MATCHED_NOS_CODES.has(nosCode)) {
    categories.push(...NOS_ROUTING[nosCode]);
  }
  if (matchesFirstAmendment(caseName, cause) && !categories.includes('civilLiberties')) {
    categories.push('civilLiberties');
  }
  return categories;
}

// ---------------------------------------------------------------------------
// CSV parsing — RFC 4180 format (comma-delimited, double-quote enclosed)
// ---------------------------------------------------------------------------

/**
 * Parse a single RFC 4180 CSV line into fields.
 * Handles: quoted fields with embedded commas, escaped quotes (""), empty → null.
 */
export function parseCsvLine(line: string): (string | null)[] {
  const fields: (string | null)[] = [];
  let i = 0;

  while (i <= line.length) {
    if (i === line.length) {
      fields.push(null);
      break;
    }
    if (line[i] === '"') {
      // Quoted field
      let end = i + 1;
      while (end < line.length) {
        if (line[end] === '"') {
          if (end + 1 < line.length && line[end + 1] === '"') {
            end += 2; // escaped quote
          } else {
            break;
          }
        } else {
          end++;
        }
      }
      const raw = line.slice(i + 1, end).replace(/""/g, '"');
      fields.push(raw || null);
      i = end + 2; // skip closing quote + comma
    } else {
      // Unquoted field
      const comma = line.indexOf(',', i);
      if (comma === -1) {
        const val = line.slice(i);
        fields.push(val || null);
        break;
      }
      const val = line.slice(i, comma);
      fields.push(val || null);
      i = comma + 1;
    }
  }

  return fields;
}

/**
 * Parse a header line and return a column index lookup.
 * Throws if any required columns are missing.
 */
export function parseHeader(line: string, requiredColumns: string[]): Record<string, number> {
  const columns = parseCsvLine(line).map((f) => f ?? '');
  const lookup: Record<string, number> = {};
  for (let i = 0; i < columns.length; i++) {
    lookup[columns[i]] = i;
  }
  for (const col of requiredColumns) {
    if (!(col in lookup)) {
      throw new Error(`Required column "${col}" not found in header: ${columns.join(', ')}`);
    }
  }
  return lookup;
}

// ---------------------------------------------------------------------------
// Year range helpers
// ---------------------------------------------------------------------------

interface YearRange {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

/** Convert presidential years to date ranges (Jan 20 → Jan 19 inauguration boundaries). */
export function yearsToDateRanges(years: number[]): YearRange[] {
  return years.map((y) => ({
    start: `${y}-01-20`,
    end: `${y + 1}-01-19`,
  }));
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/** File discovery — find bulk CSV files in the data directory. */
export function findBulkFiles(
  dataDir: string,
  opts?: { opinionsOptional?: boolean },
): {
  courts: string;
  dockets: string;
  clusters: string;
  opinions: string | null;
} {
  const files = fs.readdirSync(dataDir);
  const find = (prefix: string, optional?: boolean): string | null => {
    const match = files.find(
      (f) => f.startsWith(prefix) && (f.endsWith('.csv') || f.endsWith('.csv.bz2')),
    );
    if (!match) {
      if (optional) return null;
      throw new Error(`No ${prefix}* file found in ${dataDir}`);
    }
    return `${dataDir}/${match}`;
  };
  // Find opinion-clusters BEFORE opinions to avoid prefix collision
  const clusters = find('opinion-clusters')!;
  return {
    courts: find('courts')!,
    dockets: find('dockets')!,
    clusters,
    opinions: find('opinions-', opts?.opinionsOptional),
  };
}
