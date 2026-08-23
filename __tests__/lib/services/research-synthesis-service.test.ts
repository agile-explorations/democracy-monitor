import { afterEach, describe, expect, it } from 'vitest';
import { ENUMERATION_MAX_TOKENS } from '@/lib/services/question-classifier';
import { synthesisMaxTokens } from '@/lib/services/research-synthesis-service';

describe('synthesisMaxTokens (#763)', () => {
  afterEach(() => {
    delete process.env.ENUMERATION_MODE;
  });

  it('lifts the token budget only for enumeration questions with the flag on', () => {
    process.env.ENUMERATION_MODE = 'on';
    expect(synthesisMaxTokens('What executive orders address workforce reduction?')).toBe(
      ENUMERATION_MAX_TOKENS,
    );
    expect(synthesisMaxTokens('Why did the court rule that way?')).toBe(4096);
  });

  it('keeps the analytical budget byte-identical with the flag off', () => {
    delete process.env.ENUMERATION_MODE;
    expect(synthesisMaxTokens('What executive orders address workforce reduction?')).toBe(4096);
  });
});
