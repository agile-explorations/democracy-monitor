import { describe, expect, it } from 'vitest';
import { suggestTierFromQuestion } from '@/lib/services/tier-hint';

describe('suggestTierFromQuestion (#596)', () => {
  it('suggests discussion for floor-speech questions', () => {
    expect(
      suggestTierFromQuestion(
        'What congressional floor speeches have addressed the expansion of 287(g) agreements since 2025?',
      ),
    ).toMatchObject({ tier: 'discussion' });
    expect(
      suggestTierFromQuestion(
        'Which members of Congress have spoken about reclassification on the floor?',
      ),
    ).toMatchObject({ tier: 'discussion' });
  });

  it('suggests action for document-kind questions', () => {
    expect(
      suggestTierFromQuestion(
        'What executive orders have modified agency independence since 2017?',
      ),
    ).toEqual({ tier: 'action', phrase: 'executive orders' });
    expect(suggestTierFromQuestion('What press releases discuss enforcement?')).toMatchObject({
      tier: 'action',
    });
  });

  it('stays silent on ambiguous questions', () => {
    expect(suggestTierFromQuestion('What congressional responses have there been?')).toBeNull();
    expect(
      suggestTierFromQuestion(
        'What government documents reference both enforcement and due process?',
      ),
    ).toBeNull();
  });
});
