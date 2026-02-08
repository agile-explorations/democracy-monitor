import { describe, it, expect } from 'vitest';
import { parseAIIntentResponse } from '@/lib/ai/schemas/intent-response';

describe('parseAIIntentResponse', () => {
  const validResponse = {
    overall: 'executive_dominant',
    overallScore: 1.2,
    reasoning: 'Executive power is expanding.',
    items: [
      { index: 1, type: 'rhetoric', area: 'rule_of_law', score: 1.5 },
      { index: 2, type: 'action', area: 'civil_liberties', score: 0.8 },
    ],
  };

  it('parses valid JSON response', () => {
    const result = parseAIIntentResponse(JSON.stringify(validResponse));
    expect(result).not.toBeNull();
    expect(result!.overall).toBe('executive_dominant');
    expect(result!.overallScore).toBe(1.2);
    expect(result!.reasoning).toBe('Executive power is expanding.');
    expect(result!.items).toHaveLength(2);
  });

  it('handles markdown fences around JSON', () => {
    const wrapped = '```json\n' + JSON.stringify(validResponse) + '\n```';
    const result = parseAIIntentResponse(wrapped);
    expect(result).not.toBeNull();
    expect(result!.overall).toBe('executive_dominant');
  });

  it('returns null for invalid governance category', () => {
    const invalid = { ...validResponse, overall: 'totalitarianism' };
    const result = parseAIIntentResponse(JSON.stringify(invalid));
    expect(result).toBeNull();
  });

  it('returns null for missing required fields', () => {
    const missing = { overall: 'liberal_democracy', overallScore: 0 };
    const result = parseAIIntentResponse(JSON.stringify(missing));
    expect(result).toBeNull();
  });

  it('returns null for out-of-range overallScore', () => {
    const outOfRange = { ...validResponse, overallScore: 5 };
    const result = parseAIIntentResponse(JSON.stringify(outOfRange));
    expect(result).toBeNull();
  });

  it('returns null for out-of-range item score', () => {
    const badItem = {
      ...validResponse,
      items: [{ index: 1, type: 'rhetoric', area: 'rule_of_law', score: -3 }],
    };
    const result = parseAIIntentResponse(JSON.stringify(badItem));
    expect(result).toBeNull();
  });

  it('returns null for non-JSON input', () => {
    expect(parseAIIntentResponse('not json at all')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseAIIntentResponse('')).toBeNull();
  });
});
