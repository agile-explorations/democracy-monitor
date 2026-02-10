import { describe, it, expect } from 'vitest';
import { buildIntentClassificationPrompt } from '@/lib/ai/prompts/intent-classification';

describe('buildIntentClassificationPrompt', () => {
  const baseStatements = [
    { text: 'We will restore accountability', source: 'White House', date: '2026-01-15' },
    { text: 'Executive order on workforce reform', source: 'Federal Register', date: '2026-01-16' },
  ];

  it('includes all statements in the prompt', () => {
    const prompt = buildIntentClassificationPrompt(baseStatements);

    expect(prompt).toContain('We will restore accountability');
    expect(prompt).toContain('Executive order on workforce reform');
    expect(prompt).toContain('White House');
    expect(prompt).toContain('2026-01-15');
  });

  it('numbers statements sequentially', () => {
    const prompt = buildIntentClassificationPrompt(baseStatements);

    expect(prompt).toContain('1. "We will restore accountability"');
    expect(prompt).toContain('2. "Executive order on workforce reform"');
  });

  it('truncates statements to 15 items', () => {
    const manyStatements = Array.from({ length: 20 }, (_, i) => ({
      text: `Statement ${i + 1}`,
      source: 'Source',
      date: '2026-01-01',
    }));

    const prompt = buildIntentClassificationPrompt(manyStatements);

    expect(prompt).toContain('Statement 15');
    expect(prompt).not.toContain('Statement 16');
  });

  it('includes historical context when retrievedDocs are provided', () => {
    const docs = [
      {
        title: 'Past Executive Order',
        content: 'Historical precedent for action',
        similarity: 0.9,
      },
      { title: 'Analysis Report', content: 'Scholarly analysis of trend', similarity: 0.8 },
    ];

    const prompt = buildIntentClassificationPrompt(baseStatements, docs);

    expect(prompt).toContain('HISTORICAL CONTEXT');
    expect(prompt).toContain('Past Executive Order');
    expect(prompt).toContain('Analysis Report');
  });

  it('excludes historical context when retrievedDocs is empty', () => {
    const prompt = buildIntentClassificationPrompt(baseStatements, []);
    expect(prompt).not.toContain('HISTORICAL CONTEXT');
  });

  it('excludes historical context when retrievedDocs is undefined', () => {
    const prompt = buildIntentClassificationPrompt(baseStatements);
    expect(prompt).not.toContain('HISTORICAL CONTEXT');
  });

  it('truncates retrievedDocs to 5 items', () => {
    const docs = Array.from({ length: 8 }, (_, i) => ({
      title: `Doc ${i + 1}`,
      content: `Content ${i + 1}`,
      similarity: 0.9 - i * 0.05,
    }));

    const prompt = buildIntentClassificationPrompt(baseStatements, docs);

    expect(prompt).toContain('Doc 5');
    expect(prompt).not.toContain('Doc 6');
  });

  it('handles null content in retrieved docs', () => {
    const docs = [{ title: 'Null Content Doc', content: null, similarity: 0.85 }];

    const prompt = buildIntentClassificationPrompt(baseStatements, docs);

    expect(prompt).toContain('Null Content Doc');
  });

  it('includes the classification instructions', () => {
    const prompt = buildIntentClassificationPrompt(baseStatements);

    expect(prompt).toContain('liberal_democracy');
    expect(prompt).toContain('competitive_authoritarian');
    expect(prompt).toContain('RHETORIC');
    expect(prompt).toContain('ACTION');
  });
});
