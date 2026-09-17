/** Render a drizzle `sql` template (or any nested chunk) to its
 *  parameter-inlined text for assertions: one copy for every query test
 *  (document-filters, search-filter-conditions, event-validation-queries). */
export function sqlText(chunk: unknown): string {
  const render = (c: unknown): string => {
    if (typeof c === 'string') return c;
    const anyC = c as { queryChunks?: unknown[]; value?: unknown; name?: string };
    if (Array.isArray(anyC.queryChunks)) return anyC.queryChunks.map(render).join('');
    if (Array.isArray(anyC.value)) return anyC.value.join('');
    if (anyC.value !== undefined) return String(anyC.value);
    if (anyC.name) return anyC.name;
    return '';
  };
  return render(chunk).replace(/\s+/g, ' ').trim();
}
