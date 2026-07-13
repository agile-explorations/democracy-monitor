import type { DocumentExplanation } from '@/lib/types/explanation';

export type SortField =
  | 'title'
  | 'documentClass'
  | 'aiFlagged'
  | 'assessment'
  | 'erosionType'
  | 'erosionActor';
export type SortDir = 'asc' | 'desc';

export function getAIFlag(doc: DocumentExplanation): string {
  if (!doc.ai) return '—';
  return doc.ai.flagged ? 'Yes' : 'No';
}

export function getAssessment(doc: DocumentExplanation): string {
  return doc.ai?.assessment ?? '—';
}

export function getErosionType(doc: DocumentExplanation): string {
  return doc.ai?.erosionType ?? '—';
}

export function getErosionActor(doc: DocumentExplanation): string {
  return doc.ai?.erosionActor ?? '—';
}

export function sortDocuments(
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
      case 'erosionActor':
        cmp = getErosionActor(a).localeCompare(getErosionActor(b));
        break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}
