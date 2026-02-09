/** Escape a CSV cell value. Handles commas, quotes, newlines, and non-primitive values. */
export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return `"${json.replace(/"/g, '""')}"`;
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of flat objects to a CSV string.
 * If columns are not provided, they are inferred from the first row's keys.
 */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return '';

  const cols = columns ?? Object.keys(rows[0]);
  const header = cols.map(escapeCell).join(',');
  const body = rows.map((row) => cols.map((col) => escapeCell(row[col])).join(',')).join('\n');

  return `${header}\n${body}`;
}
