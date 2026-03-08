import { CATEGORIES } from '@/lib/data/categories';

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.title ?? key;
}

export function similarityBar(similarity: number | null): string {
  if (similarity == null) return '';
  return '\u2588'.repeat(Math.max(1, Math.round(similarity * 5)));
}
