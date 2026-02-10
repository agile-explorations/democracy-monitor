import { describe, it, expect } from 'vitest';
import {
  parseAIAssessmentResponse,
  parseCounterEvidenceResponse,
} from '@/lib/ai/schemas/assessment-response';

describe('parseAIAssessmentResponse', () => {
  it('parses valid assessment JSON', () => {
    const raw = JSON.stringify({
      status: 'Warning',
      confidence: 0.75,
      reasoning: 'Elevated concern based on recent actions',
      evidenceFor: ['Executive order signed'],
      evidenceAgainst: ['Congress pushback'],
      howWeCouldBeWrong: ['Temporary measure', 'Legal challenge pending'],
    });

    const result = parseAIAssessmentResponse(raw);

    expect(result).not.toBeNull();
    expect(result!.status).toBe('Warning');
    expect(result!.confidence).toBe(0.75);
    expect(result!.evidenceFor).toHaveLength(1);
    expect(result!.evidenceAgainst).toHaveLength(1);
    expect(result!.howWeCouldBeWrong).toHaveLength(2);
  });

  it('parses assessment wrapped in markdown code block', () => {
    const raw = `Here is my analysis:
\`\`\`json
{
  "status": "Drift",
  "confidence": 0.85,
  "reasoning": "Pattern of escalation",
  "evidenceFor": ["IG removal"],
  "evidenceAgainst": [],
  "howWeCouldBeWrong": ["Precedent exists"]
}
\`\`\``;

    const result = parseAIAssessmentResponse(raw);

    expect(result).not.toBeNull();
    expect(result!.status).toBe('Drift');
    expect(result!.confidence).toBe(0.85);
  });

  it('returns null for invalid status value', () => {
    const raw = JSON.stringify({
      status: 'InvalidStatus',
      confidence: 0.5,
      reasoning: 'test',
      evidenceFor: [],
      evidenceAgainst: [],
      howWeCouldBeWrong: [],
    });

    expect(parseAIAssessmentResponse(raw)).toBeNull();
  });

  it('returns null for missing required fields', () => {
    const raw = JSON.stringify({ status: 'Stable' });
    expect(parseAIAssessmentResponse(raw)).toBeNull();
  });

  it('returns null for non-JSON input', () => {
    expect(parseAIAssessmentResponse('Not JSON at all')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseAIAssessmentResponse('')).toBeNull();
  });

  it('rejects confidence outside 0-1 range', () => {
    const raw = JSON.stringify({
      status: 'Stable',
      confidence: 1.5,
      reasoning: 'test',
      evidenceFor: [],
      evidenceAgainst: [],
      howWeCouldBeWrong: [],
    });

    expect(parseAIAssessmentResponse(raw)).toBeNull();
  });
});

describe('parseCounterEvidenceResponse', () => {
  it('parses valid counter-evidence JSON', () => {
    const raw = JSON.stringify({
      counterPoints: ['Courts have blocked similar orders', 'Congress may intervene'],
    });

    const result = parseCounterEvidenceResponse(raw);

    expect(result).not.toBeNull();
    expect(result!.counterPoints).toHaveLength(2);
    expect(result!.counterPoints[0]).toContain('Courts');
  });

  it('parses response wrapped in code block', () => {
    const raw = `\`\`\`json
{"counterPoints": ["Point one"]}
\`\`\``;

    const result = parseCounterEvidenceResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.counterPoints).toEqual(['Point one']);
  });

  it('returns null for missing counterPoints field', () => {
    const raw = JSON.stringify({ points: ['not the right field'] });
    expect(parseCounterEvidenceResponse(raw)).toBeNull();
  });

  it('returns null for non-JSON input', () => {
    expect(parseCounterEvidenceResponse('invalid')).toBeNull();
  });

  it('accepts empty counterPoints array', () => {
    const raw = JSON.stringify({ counterPoints: [] });
    const result = parseCounterEvidenceResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.counterPoints).toEqual([]);
  });
});
