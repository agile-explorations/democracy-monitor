import { describe, expect, it } from 'vitest';
import {
  parsePass1Response,
  parsePass2Response,
  Pass1ResponseSchema,
  Pass2ResponseSchema,
} from '@/lib/ai/schemas/document-review-response';

describe('Pass1ResponseSchema', () => {
  it('validates a correct response', () => {
    const input = {
      relevant: true,
      confidence: 0.85,
      signals: ['mass layoffs at agency', 'restructuring language'],
      erosionType: 'operational_hollowing',
    };
    expect(Pass1ResponseSchema.safeParse(input).success).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(Pass1ResponseSchema.safeParse({ relevant: true }).success).toBe(false);
    expect(Pass1ResponseSchema.safeParse({}).success).toBe(false);
  });

  it('rejects invalid erosion type', () => {
    const input = {
      relevant: true,
      confidence: 0.5,
      signals: [],
      erosionType: 'coup',
    };
    expect(Pass1ResponseSchema.safeParse(input).success).toBe(false);
  });

  it('rejects confidence out of range', () => {
    const input = {
      relevant: true,
      confidence: 1.5,
      signals: [],
      erosionType: 'routine',
    };
    expect(Pass1ResponseSchema.safeParse(input).success).toBe(false);
  });
});

describe('Pass2ResponseSchema', () => {
  it('validates a correct response', () => {
    const input = {
      assessment: 'potentially_concerning',
      confidence: 0.7,
      reasoning: 'The document describes removal of oversight mechanisms.',
      comparativeContext: 'This exceeds typical administrative reorganization.',
      citedPassages: ['all positions previously covered by merit protection'],
      erosionType: 'formal_override',
      counterArguments: ['Could be routine workforce planning'],
    };
    expect(Pass2ResponseSchema.safeParse(input).success).toBe(true);
  });

  it('rejects invalid assessment value', () => {
    const input = {
      assessment: 'scary',
      confidence: 0.5,
      reasoning: 'test',
      comparativeContext: 'test',
      citedPassages: [],
      erosionType: 'routine',
      counterArguments: [],
    };
    expect(Pass2ResponseSchema.safeParse(input).success).toBe(false);
  });
});

describe('parsePass1Response', () => {
  it('parses valid JSON', () => {
    const raw = JSON.stringify({
      relevant: false,
      confidence: 0.9,
      signals: [],
      erosionType: 'routine',
    });
    const result = parsePass1Response(raw);
    expect(result).toEqual({
      relevant: false,
      confidence: 0.9,
      signals: [],
      erosionType: 'routine',
    });
  });

  it('handles markdown fences from LLM', () => {
    const raw =
      '```json\n{"relevant": true, "confidence": 0.8, "signals": ["test"], "erosionType": "unclear"}\n```';
    const result = parsePass1Response(raw);
    expect(result).not.toBeNull();
    expect(result!.relevant).toBe(true);
  });

  it('returns null for invalid JSON', () => {
    expect(parsePass1Response('not json')).toBeNull();
  });

  it('returns null for valid JSON with wrong schema', () => {
    expect(parsePass1Response('{"foo": "bar"}')).toBeNull();
  });
});

describe('parsePass2Response', () => {
  it('parses valid JSON', () => {
    const raw = JSON.stringify({
      assessment: 'routine',
      confidence: 0.95,
      reasoning: 'Normal activity.',
      comparativeContext: 'Consistent with past practice.',
      citedPassages: [],
      erosionType: 'routine',
      counterArguments: ['Standard process'],
    });
    const result = parsePass2Response(raw);
    expect(result).not.toBeNull();
    expect(result!.assessment).toBe('routine');
  });

  it('returns null for invalid response', () => {
    expect(parsePass2Response('garbage')).toBeNull();
  });
});
