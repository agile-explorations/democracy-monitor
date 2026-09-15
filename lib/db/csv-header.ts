/** Pure helpers for the header-driven documents restore (lib/db/init.ts). */

const CSV_COLUMN_NAME = /^[a-z_][a-z0-9_]*$/;

/** Split a CSV header line into validated column identifiers. */
export function parseCsvHeader(header: string): string[] {
  const columns = header.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  for (const c of columns) {
    if (!CSV_COLUMN_NAME.test(c)) throw new Error(`Unsafe column name in dump header: ${c}`);
  }
  return columns;
}
