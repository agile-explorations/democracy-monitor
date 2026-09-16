import { describe, expect, it } from 'vitest';
import {
  categoryLabel,
  documentCategoryLabel,
  parseStreamingSections,
  UNROUTED_LABEL,
} from '@/components/search/helpers';
import { CORPUS_CATEGORY } from '@/lib/db/document-filters';

describe('parseStreamingSections header tolerance (#silent-empty-answer)', () => {
  it('parses exact headers', () => {
    const r = parseStreamingSections(
      '=== EXPERT ANSWER ===\nexpert text\n=== PUBLIC ANSWER ===\npublic text\n=== RELATED QUESTIONS ===\n- q1?',
    );
    expect(r.expert).toBe('expert text');
    expect(r.public).toBe('public text');
    expect(r.relatedQuestions).toEqual(['q1?']);
  });

  it('tolerates stray characters and spacing inside the fence (observed in prod)', () => {
    const r = parseStreamingSections(
      '===’EXPERT ANSWER ===\nexpert text\n===PUBLIC ANSWER===\npublic text',
    );
    expect(r.expert).toBe('expert text');
    expect(r.public).toBe('public text');
  });

  it('tolerates lowercase and extra whitespace', () => {
    const r = parseStreamingSections('===  expert answer  ===\nbody');
    expect(r.expert).toBe('body');
  });

  it('returns empty sections while headers have not streamed yet', () => {
    const r = parseStreamingSections('preamble with no headers');
    expect(r.expert).toBe('');
    expect(r.public).toBe('');
  });
});

describe('documentCategoryLabel (#895)', () => {
  it('renders the category title for routed rows', () => {
    expect(documentCategoryLabel({ category: 'mediaFreedom', routed: true })).toBe(
      categoryLabel('mediaFreedom'),
    );
    expect(documentCategoryLabel({ category: 'mediaFreedom', routed: true })).not.toBe(
      'mediaFreedom',
    );
  });

  it('labels off-topic rows "Not routed to a category" even under a real category', () => {
    expect(documentCategoryLabel({ category: 'mediaFreedom', routed: false })).toBe(UNROUTED_LABEL);
    expect(UNROUTED_LABEL).toBe('Not routed to a category');
  });

  it('labels corpus rows unrouted regardless of the flag', () => {
    expect(documentCategoryLabel({ category: CORPUS_CATEGORY, routed: true })).toBe(UNROUTED_LABEL);
    expect(documentCategoryLabel({ category: CORPUS_CATEGORY })).toBe(UNROUTED_LABEL);
  });

  it('treats a missing flag (cached payloads) as routed', () => {
    expect(documentCategoryLabel({ category: 'elections' })).toBe(categoryLabel('elections'));
  });
});
