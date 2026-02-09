import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseJudgeResponse } from '@/lib/services/p2025-matcher';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
  isDbAvailable: vi.fn(),
}));

vi.mock('@/lib/ai/provider', () => ({
  getAvailableProviders: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/services/embedding-service', () => ({
  cosineSimilarity: vi.fn().mockReturnValue(0.8),
  embedText: vi.fn().mockResolvedValue(null),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseJudgeResponse', () => {
  it('parses valid JSON response', () => {
    const response = JSON.stringify({
      classification: 'implements',
      confidence: 0.85,
      reasoning: 'The document directly implements the proposal.',
    });

    const result = parseJudgeResponse(response);

    expect(result.classification).toBe('implements');
    expect(result.confidence).toBe(0.85);
    expect(result.reasoning).toBe('The document directly implements the proposal.');
  });

  it('parses JSON wrapped in markdown code block', () => {
    const response = `Here is my analysis:
\`\`\`json
{
  "classification": "loosely_related",
  "confidence": 0.6,
  "reasoning": "Same topic but different scope"
}
\`\`\``;

    const result = parseJudgeResponse(response);

    expect(result.classification).toBe('loosely_related');
    expect(result.confidence).toBe(0.6);
  });

  it('falls back to not_related for invalid classification', () => {
    const response = JSON.stringify({
      classification: 'invalid_value',
      confidence: 0.5,
      reasoning: 'test',
    });

    const result = parseJudgeResponse(response);

    expect(result.classification).toBe('not_related');
  });

  it('clamps confidence to 0-1 range', () => {
    const response = JSON.stringify({
      classification: 'implements',
      confidence: 1.5,
      reasoning: 'test',
    });

    const result = parseJudgeResponse(response);

    expect(result.confidence).toBe(1);
  });

  it('handles missing confidence field', () => {
    const response = JSON.stringify({
      classification: 'exceeds',
      reasoning: 'Beyond scope',
    });

    const result = parseJudgeResponse(response);

    expect(result.classification).toBe('exceeds');
    expect(result.confidence).toBe(0);
  });

  it('handles missing reasoning field', () => {
    const response = JSON.stringify({
      classification: 'not_related',
      confidence: 0.3,
    });

    const result = parseJudgeResponse(response);

    expect(result.reasoning).toBe('No reasoning provided');
  });

  it('handles completely malformed response', () => {
    const result = parseJudgeResponse('This is not JSON at all');

    expect(result.classification).toBe('not_related');
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toBe('Failed to parse response');
  });

  it('handles empty string', () => {
    const result = parseJudgeResponse('');

    expect(result.classification).toBe('not_related');
    expect(result.confidence).toBe(0);
  });

  it('parses all valid classifications', () => {
    const classifications = ['not_related', 'loosely_related', 'implements', 'exceeds'] as const;

    for (const c of classifications) {
      const response = JSON.stringify({ classification: c, confidence: 0.5, reasoning: 'test' });
      const result = parseJudgeResponse(response);
      expect(result.classification).toBe(c);
    }
  });
});
