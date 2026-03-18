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
  const expertIdx = text.indexOf(EXPERT_HEADER);
  const publicIdx = text.indexOf(PUBLIC_HEADER);
  const questionsIdx = text.indexOf(QUESTIONS_HEADER);

  let expert = '';
  let pub = '';

  if (expertIdx === -1) {
    // Haven't reached expert section yet
  } else if (publicIdx === -1) {
    expert = text.slice(expertIdx + EXPERT_HEADER.length).trim();
  } else {
    expert = text.slice(expertIdx + EXPERT_HEADER.length, publicIdx).trim();
    const publicEnd = questionsIdx !== -1 ? questionsIdx : text.length;
    pub = text.slice(publicIdx + PUBLIC_HEADER.length, publicEnd).trim();
  }

  let relatedQuestions: string[] = [];
  if (questionsIdx !== -1) {
    relatedQuestions = text
      .slice(questionsIdx + QUESTIONS_HEADER.length)
      .trim()
      .split('\n')
      .map((line) => line.replace(/^[-·•\d.)\s]+/, '').trim())
      .filter((line) => line.length > 0)
      .slice(0, 3);
  }

  return { expert, public: pub, relatedQuestions };
}
