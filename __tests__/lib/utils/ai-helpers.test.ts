import { describe, it, expect } from 'vitest';
import type { AIProvider } from '@/lib/types';
import { extractJsonFromLlm, selectProvider } from '@/lib/utils/ai-helpers';

describe('extractJsonFromLlm', () => {
  it('extracts plain JSON from a string', () => {
    const input = '{"status": "ok", "score": 42}';
    expect(extractJsonFromLlm(input)).toEqual({ status: 'ok', score: 42 });
  });

  it('extracts JSON from markdown code fences', () => {
    const input = 'Here is the result:\n```json\n{"level": "warning"}\n```\nDone.';
    expect(extractJsonFromLlm(input)).toEqual({ level: 'warning' });
  });

  it('extracts JSON from code fences without language tag', () => {
    const input = '```\n{"a": 1}\n```';
    expect(extractJsonFromLlm(input)).toEqual({ a: 1 });
  });

  it('extracts nested JSON objects', () => {
    const input = '{"outer": {"inner": {"deep": true}}}';
    expect(extractJsonFromLlm(input)).toEqual({ outer: { inner: { deep: true } } });
  });

  it('returns null for malformed JSON', () => {
    const input = '{"broken": }';
    expect(extractJsonFromLlm(input)).toBeNull();
  });

  it('returns null when no JSON present', () => {
    expect(extractJsonFromLlm('No JSON here at all')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractJsonFromLlm('')).toBeNull();
  });

  it('extracts JSON surrounded by prose', () => {
    const input = 'The analysis yielded: {"result": "drift"} which indicates concern.';
    expect(extractJsonFromLlm(input)).toEqual({ result: 'drift' });
  });
});

describe('selectProvider', () => {
  const anthropic: AIProvider = {
    name: 'anthropic',
    complete: async () => ({
      content: '',
      model: '',
      tokensUsed: { input: 0, output: 0 },
      latencyMs: 0,
    }),
    isAvailable: () => true,
  };

  const openai: AIProvider = {
    name: 'openai',
    complete: async () => ({
      content: '',
      model: '',
      tokensUsed: { input: 0, output: 0 },
      latencyMs: 0,
    }),
    isAvailable: () => true,
  };

  it('prefers anthropic when available', () => {
    expect(selectProvider([openai, anthropic])).toBe(anthropic);
  });

  it('prefers anthropic regardless of order', () => {
    expect(selectProvider([anthropic, openai])).toBe(anthropic);
  });

  it('falls back to first provider when anthropic is absent', () => {
    expect(selectProvider([openai])).toBe(openai);
  });

  it('returns null for empty array', () => {
    expect(selectProvider([])).toBeNull();
  });
});
