import { useCallback, useMemo, useState } from 'react';
import type { DocumentExplanation } from '@/lib/types/explanation';
import { escapeCell } from '@/lib/utils/csv';

type SortField = 'title' | 'documentClass' | 'aiFlagged' | 'assessment' | 'erosionType';
type SortDir = 'asc' | 'desc';

export interface DocumentTableProps {
  documents: DocumentExplanation[];
  category: string;
  weekOf: string;
}

function getAIFlag(doc: DocumentExplanation): string {
  if (!doc.ai) return '—';
  return doc.ai.flagged ? 'Yes' : 'No';
}

function getAssessment(doc: DocumentExplanation): string {
  return doc.ai?.assessment ?? '—';
}

function getErosionType(doc: DocumentExplanation): string {
  return doc.ai?.erosionType ?? '—';
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
      case 'aiFlagged':
        cmp = getAIFlag(a).localeCompare(getAIFlag(b));
        break;
      case 'assessment':
        cmp = getAssessment(a).localeCompare(getAssessment(b));
        break;
      case 'erosionType':
        cmp = getErosionType(a).localeCompare(getErosionType(b));
        break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

function toCsvString(docs: DocumentExplanation[]): string {
  const header = 'Title,URL,Class,AI Flagged,Assessment,Erosion Type,Reasoning';
  const rows = docs.map((d) =>
    [
      escapeCell(d.title),
      escapeCell(d.url),
      d.documentClass,
      getAIFlag(d),
      getAssessment(d),
      getErosionType(d),
      escapeCell(d.ai?.reasoning ?? ''),
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
  className,
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const arrow = currentField === field ? (currentDir === 'asc' ? ' \u2191' : ' \u2193') : '';
  return (
    <th
      className={`px-3 py-2 text-left text-[11px] font-medium text-dm-text-secondary uppercase tracking-wider cursor-pointer hover:text-dm-text-primary select-none ${className ?? ''}`}
      onClick={() => onSort(field)}
    >
      {label}
      {arrow}
    </th>
  );
}

const ASSESSMENT_COLORS: Record<string, string> = {
  clearly_concerning: 'text-status-capture',
  potentially_concerning: 'text-status-drift',
  novel_not_concerning: 'text-dm-text-secondary',
  routine: 'text-dm-text-secondary',
};

const ASSESSMENT_LABELS: Record<string, string> = {
  clearly_concerning: 'clearly concerning',
  potentially_concerning: 'potentially concerning',
  novel_not_concerning: 'novel, not concerning',
  routine: 'routine',
};

const ASSESSMENT_TIPS: Record<string, string> = {
  clearly_concerning: 'Multiple indicators of democratic erosion with clear institutional impact',
  potentially_concerning: 'Some erosion indicators present but impact is uncertain or limited',
  novel_not_concerning: 'Unusual activity that does not indicate democratic erosion',
  routine: 'Normal administrative activity with no erosion signal',
};

const EROSION_TYPE_LABELS: Record<string, string> = {
  formal_override: 'formal override',
  operational_hollowing: 'operational hollowing',
  noncompliance_refusal: 'noncompliance / refusal',
  routine: 'routine',
  unclear: 'unclear',
};

const EROSION_TYPE_TIPS: Record<string, string> = {
  formal_override: 'Explicit legal or policy changes that remove institutional protections',
  operational_hollowing:
    'Staffing cuts, budget reductions, or unfilled positions that degrade capacity',
  noncompliance_refusal:
    'Ignoring court orders, defying oversight, or refusing information requests',
  routine: 'Normal administrative activity with no erosion signal',
  unclear: 'Insufficient information to classify the erosion mechanism',
};

export function DocumentTable({ documents, category, weekOf }: DocumentTableProps) {
  const [sortField, setSortField] = useState<SortField>('aiFlagged');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);

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
                className="hidden sm:table-cell"
              />
              <SortHeader
                label="AI Flag"
                field="aiFlagged"
                currentField={sortField}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Assessment"
                field="assessment"
                currentField={sortField}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Erosion Type"
                field="erosionType"
                currentField={sortField}
                currentDir={sortDir}
                onSort={handleSort}
                className="hidden sm:table-cell"
              />
              <th className="px-3 py-2 text-left text-[11px] font-medium text-dm-text-secondary uppercase tracking-wider">
                Reasoning
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dm-border/50">
            {sorted.map((doc) => {
              const assessment = getAssessment(doc);
              const reasoning = doc.ai?.reasoning;
              const isExpanded = expandedUrl === doc.url;
              return (
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
                  <td className="px-3 py-2 text-dm-text-secondary hidden sm:table-cell">
                    {doc.documentClass}
                  </td>
                  <td className="px-3 py-2">
                    {doc.ai?.flagged ? (
                      <span className="text-status-capture font-medium">Yes</span>
                    ) : doc.ai ? (
                      <span className="text-dm-text-secondary">No</span>
                    ) : (
                      <span className="text-dm-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {assessment !== '—' ? (
                      <span
                        className={`${ASSESSMENT_COLORS[assessment] ?? 'text-dm-text-primary'} border-b border-dotted border-current cursor-help`}
                        title={ASSESSMENT_TIPS[assessment]}
                      >
                        {ASSESSMENT_LABELS[assessment] ?? assessment.replace(/_/g, ' ')}
                      </span>
                    ) : (
                      <span className="text-dm-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 hidden sm:table-cell">
                    {doc.ai?.erosionType && doc.ai.erosionType !== 'routine' ? (
                      <span
                        className="text-dm-text-secondary border-b border-dotted border-current cursor-help"
                        title={EROSION_TYPE_TIPS[doc.ai.erosionType]}
                      >
                        {EROSION_TYPE_LABELS[doc.ai.erosionType] ??
                          doc.ai.erosionType.replace(/_/g, ' ')}
                      </span>
                    ) : (
                      <span className="text-dm-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-sm">
                    {reasoning ? (
                      <button
                        onClick={() => setExpandedUrl(isExpanded ? null : doc.url)}
                        className="text-left text-dm-text-secondary hover:text-dm-text-primary cursor-pointer"
                      >
                        <span className={isExpanded ? 'whitespace-normal' : 'line-clamp-1'}>
                          {reasoning}
                        </span>
                      </button>
                    ) : (
                      <span className="text-dm-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
