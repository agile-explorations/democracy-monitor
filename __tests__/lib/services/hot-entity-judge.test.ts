import { describe, expect, it } from 'vitest';
import {
  buildJudgePrompt,
  MAX_JUDGE_PICKS,
  parseJudgeResponse,
} from '@/lib/services/hot-entity-judge';

describe('buildJudgePrompt', () => {
  it('tells the judge that an era-wide entity does not fit a question that is not about it (#806)', () => {
    const prompt = buildJudgePrompt('q', [
      {
        phrase: 'Public Law 119-21',
        entityClass: 'statute',
        categories: ['fiscal'],
        docFreqTerm: 257,
      },
    ]);
    expect(prompt).toMatch(/would fit most questions about this era/);
    expect(prompt).toMatch(/unless the question is about it/);
  });

  it('labels each candidate with class, categories, and recurrence', () => {
    const prompt = buildJudgePrompt('What documents address X?', [
      {
        phrase: 'J.G.G. v. Trump',
        entityClass: 'caption',
        categories: ['immigrationEnforcement'],
        docFreqTerm: 19,
      },
    ]);
    expect(prompt).toContain('1. "J.G.G. v. Trump" — caption — categories: immigrationEnforcement');
    expect(prompt).toContain('19 mentions this term');
    expect(prompt).toContain('What documents address X?');
  });
});

describe('parseJudgeResponse', () => {
  const shortlist = ['Alien Enemies Act', 'J.G.G. v. Trump', 'One Big Beautiful Bill Act'];

  it('keeps only shortlist members, canonical casing, deduped', () => {
    const picks = parseJudgeResponse(
      '["alien enemies act", "Invented v. Entity", "J.G.G. v. Trump", "J.G.G. v. Trump"]',
      shortlist,
    );
    expect(picks).toEqual(['Alien Enemies Act', 'J.G.G. v. Trump']);
  });

  it('strips markdown fences and caps at MAX_JUDGE_PICKS', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Entity ${i}`);
    const picks = parseJudgeResponse('```json\n' + JSON.stringify(many) + '\n```', many);
    expect(picks).toHaveLength(MAX_JUDGE_PICKS);
  });

  it('returns null on unparseable replies (mechanical fallback)', () => {
    expect(parseJudgeResponse('I would pick the first two.', shortlist)).toBeNull();
  });

  it('an empty array is a legitimate none-fit verdict, not a failure', () => {
    expect(parseJudgeResponse('[]', shortlist)).toEqual([]);
  });
});
