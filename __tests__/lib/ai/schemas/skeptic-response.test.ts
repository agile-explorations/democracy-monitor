import { describe, it, expect } from 'vitest';
import { parseSkepticReviewResponse } from '@/lib/ai/schemas/assessment-response';

const VALID_RESPONSE = {
  keywordReview: [
    {
      keyword: 'schedule f',
      assessment: 'false_positive' as const,
      reasoning: 'Mentioned in historical context, not a current action',
    },
  ],
  recommendedStatus: 'Warning',
  downgradeReason: 'Keyword appeared in analytical report, not an active policy change',
  confidence: 0.8,
  evidenceFor: ['Executive order mentions restructuring'],
  evidenceAgainst: ['Document is a GAO analysis of past policies'],
  howWeCouldBeWrong: [
    'The analytical framing could be masking a real policy shift',
    'Additional context not in the document could confirm the alert',
  ],
  whatWouldChangeMind: 'An official memorandum directing Schedule F implementation',
};

describe('parseSkepticReviewResponse', () => {
  it('parses a valid response', () => {
    const raw = JSON.stringify(VALID_RESPONSE);
    const result = parseSkepticReviewResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.recommendedStatus).toBe('Warning');
    expect(result!.keywordReview).toHaveLength(1);
    expect(result!.keywordReview[0].assessment).toBe('false_positive');
    expect(result!.confidence).toBe(0.8);
    expect(result!.evidenceAgainst).toHaveLength(1);
    expect(result!.howWeCouldBeWrong).toHaveLength(2);
    expect(result!.whatWouldChangeMind).toBe(
      'An official memorandum directing Schedule F implementation',
    );
  });

  it('fails when evidenceAgainst is empty', () => {
    const raw = JSON.stringify({ ...VALID_RESPONSE, evidenceAgainst: [] });
    const result = parseSkepticReviewResponse(raw);
    expect(result).toBeNull();
  });

  it('fails when howWeCouldBeWrong has fewer than 2 items', () => {
    const raw = JSON.stringify({
      ...VALID_RESPONSE,
      howWeCouldBeWrong: ['Only one reason'],
    });
    const result = parseSkepticReviewResponse(raw);
    expect(result).toBeNull();
  });

  it('parses markdown-wrapped JSON', () => {
    const raw = `Here is my analysis:\n\`\`\`json\n${JSON.stringify(VALID_RESPONSE)}\n\`\`\``;
    const result = parseSkepticReviewResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.recommendedStatus).toBe('Warning');
  });

  it('returns null for invalid JSON', () => {
    const result = parseSkepticReviewResponse('not valid json at all');
    expect(result).toBeNull();
  });
});
