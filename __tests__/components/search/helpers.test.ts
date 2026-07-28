import { describe, expect, it } from 'vitest';
import { parseStreamingSections } from '@/components/search/helpers';

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
