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

const EXPERT_HEADER = '=== EXPERT ANSWER ===';
const PUBLIC_HEADER = '=== PUBLIC ANSWER ===';
const QUESTIONS_HEADER = '=== RELATED QUESTIONS ===';

/** Parse streaming LLM output into expert/public/related sections as they arrive. */
export function parseStreamingSections(text: string): {
  expert: string;
  public: string;
  relatedQuestions: string[];
} {
  // Header matching tolerates minor model deviations (stray characters or
  // spacing inside the fence) — an exact indexOf silently produced an empty
  // answer when the stream opened with ===\u2019EXPERT ANSWER=== (observed
  // in prod 2026-07-28: docs rendered, no answer, no error).
  const find = (label: string) => {
    const m = text.match(new RegExp(`===\\s*\\W{0,3}${label}\\s*===`, 'i'));
    return m?.index !== undefined ? { idx: m.index, len: m[0].length } : null;
  };
  const expertM = find('EXPERT ANSWER');
  const publicM = find('PUBLIC ANSWER');
  const questionsM = find('RELATED QUESTIONS');
  const expertIdx = expertM?.idx ?? -1;
  const publicIdx = publicM?.idx ?? -1;
  const questionsIdx = questionsM?.idx ?? -1;

  let expert = '';
  let pub = '';

  if (expertIdx === -1) {
    // Haven't reached expert section yet
  } else if (publicIdx === -1) {
    expert = text.slice(expertIdx + expertM!.len).trim();
  } else {
    expert = text.slice(expertIdx + expertM!.len, publicIdx).trim();
    const publicEnd = questionsIdx !== -1 ? questionsIdx : text.length;
    pub = text.slice(publicIdx + publicM!.len, publicEnd).trim();
  }

  let relatedQuestions: string[] = [];
  if (questionsIdx !== -1) {
    relatedQuestions = text
      .slice(questionsIdx + questionsM!.len)
      .trim()
      .split('\n')
      .map((line) => line.replace(/^[-·•\d.)\s]+/, '').trim())
      .filter((line) => line.length > 0)
      .slice(0, 3);
  }

  return { expert, public: pub, relatedQuestions };
}
