import { useCallback, useMemo, useState } from 'react';
import type { DocumentExplanation } from '@/lib/types/explanation';
import { escapeCell } from '@/lib/utils/csv';

type SortField = 'title' | 'documentClass' | 'finalScore' | 'matches' | 'suppressed';
type SortDir = 'asc' | 'desc';

export interface DocumentTableProps {
  documents: DocumentExplanation[];
  category: string;
  weekOf: string;
}

function sortDocuments(
  docs: DocumentExplanation[],
  field: SortField,
  dir: SortDir,
): DocumentExplanation[] {
  return [...docs].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'title':
        cmp = a.title.localeCompare(b.title);
        break;
      case 'documentClass':
        cmp = a.documentClass.localeCompare(b.documentClass);
        break;
      case 'finalScore':
        cmp = a.finalScore - b.finalScore;
        break;
      case 'matches':
        cmp = a.matches.length - b.matches.length;
        break;
      case 'suppressed':
        cmp = a.suppressed.length - b.suppressed.length;
        break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

function toCsvString(docs: DocumentExplanation[]): string {
  const header = 'Title,URL,Class,Multiplier,Severity,Final Score,Capture,Drift,Warning,Suppressed';
  const rows = docs.map((d) =>
    [
      escapeCell(d.title),
      escapeCell(d.url),
      d.documentClass,
      d.classMultiplier,
      d.severityScore.toFixed(2),
      d.finalScore.toFixed(2),
      d.tierBreakdown.find((t) => t.tier === 'capture')?.count ?? 0,
      d.tierBreakdown.find((t) => t.tier === 'drift')?.count ?? 0,
      d.tierBreakdown.find((t) => t.tier === 'warning')?.count ?? 0,
      d.suppressed.length,
    ].join(','),
  );
  return `${header}\n${rows.join('\n')}`;
}

function SortHeader({
  label,
  field,
  currentField,
  currentDir,
  onSort,
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const arrow = currentField === field ? (currentDir === 'asc' ? ' \u2191' : ' \u2193') : '';
  return (
    <th
      className="px-3 py-2 text-left text-[11px] font-medium text-dm-text-secondary uppercase tracking-wider cursor-pointer hover:text-dm-text-primary select-none"
      onClick={() => onSort(field)}
    >
      {label}
      {arrow}
    </th>
  );
}

export function DocumentTable({ documents, category, weekOf }: DocumentTableProps) {
  const [sortField, setSortField] = useState<SortField>('finalScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(
    () => sortDocuments(documents, sortField, sortDir),
    [documents, sortField, sortDir],
  );

  const handleSort = useCallback(
    (field: SortField) => {
      if (field === sortField) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('desc');
      }
    },
    [sortField],
  );

  const handleExport = useCallback(() => {
    const csv = toCsvString(documents);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${category}-${weekOf}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [documents, category, weekOf]);

  if (documents.length === 0) {
    return <p className="text-sm text-dm-text-secondary">No scored documents this week.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary">
          All Documents This Week
        </h3>
        <button
          onClick={handleExport}
          className="text-xs text-dm-accent hover:underline cursor-pointer"
        >
          Export CSV &rarr;
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-dm-border">
            <tr>
              <SortHeader
                label="Title"
                field="title"
                currentField={sortField}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Class"
                field="documentClass"
                currentField={sortField}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Score"
                field="finalScore"
                currentField={sortField}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Matches"
                field="matches"
                currentField={sortField}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Suppressed"
                field="suppressed"
                currentField={sortField}
                currentDir={sortDir}
                onSort={handleSort}
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-dm-border/50">
            {sorted.map((doc) => (
              <tr key={doc.url} className="hover:bg-dm-card/50">
                <td className="px-3 py-2 max-w-xs">
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-dm-accent hover:underline line-clamp-1"
                  >
                    {doc.title}
                  </a>
                </td>
                <td className="px-3 py-2 text-dm-text-secondary">{doc.documentClass}</td>
                <td className="px-3 py-2 font-medium text-dm-text-primary">
                  {doc.finalScore.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-dm-text-secondary">{doc.matches.length}</td>
                <td className="px-3 py-2 text-dm-text-secondary">{doc.suppressed.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
