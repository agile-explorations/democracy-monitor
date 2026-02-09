import { describe, expect, it } from 'vitest';
import {
  DIGEST_MAX_TOKENS,
  DIGEST_SYSTEM_PROMPT,
  buildDailyDigestPrompt,
} from '@/lib/ai/prompts/daily-digest';

const sampleCategoryData = [
  {
    category: 'courts',
    status: 'Warning',
    reason: 'Multiple injunction-related items detected',
    itemCount: 12,
    highlights: ['Federal judge issues TRO against executive order'],
  },
  {
    category: 'civilService',
    status: 'Stable',
    reason: 'No significant signals',
    itemCount: 5,
    highlights: [],
  },
];

const sampleAnomalies = [{ keyword: 'injunction', category: 'courts', ratio: 3.2 }];

describe('buildDailyDigestPrompt', () => {
  it('requests both general and expert reading levels', () => {
    const prompt = buildDailyDigestPrompt('2025-06-15', sampleCategoryData, []);

    expect(prompt).toContain('summaryExpert');
    expect(prompt).toContain('categorySummariesExpert');
    expect(prompt).toContain('general audience');
    expect(prompt).toContain('expert');
  });

  it('includes both general and expert JSON fields in the response format', () => {
    const prompt = buildDailyDigestPrompt('2025-06-15', sampleCategoryData, []);

    // Check that JSON response format includes all expected fields
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"summaryExpert"');
    expect(prompt).toContain('"highlights"');
    expect(prompt).toContain('"categorySummaries"');
    expect(prompt).toContain('"categorySummariesExpert"');
    expect(prompt).toContain('"overallAssessment"');
  });

  it('includes category data in the prompt', () => {
    const prompt = buildDailyDigestPrompt('2025-06-15', sampleCategoryData, []);

    expect(prompt).toContain('courts');
    expect(prompt).toContain('Warning');
    expect(prompt).toContain('Federal judge issues TRO against executive order');
    expect(prompt).toContain('civilService');
  });

  it('includes anomalies when present', () => {
    const prompt = buildDailyDigestPrompt('2025-06-15', sampleCategoryData, sampleAnomalies);

    expect(prompt).toContain('Anomalies Detected');
    expect(prompt).toContain('injunction');
    expect(prompt).toContain('3.2x above baseline');
  });

  it('omits anomaly section when no anomalies', () => {
    const prompt = buildDailyDigestPrompt('2025-06-15', sampleCategoryData, []);

    expect(prompt).not.toContain('Anomalies Detected');
  });
});

describe('DIGEST_SYSTEM_PROMPT', () => {
  it('instructs both general and expert audience output', () => {
    expect(DIGEST_SYSTEM_PROMPT).toContain('General audience');
    expect(DIGEST_SYSTEM_PROMPT).toContain('Expert audience');
  });
});

describe('DIGEST_MAX_TOKENS', () => {
  it('is large enough for dual-level summaries', () => {
    expect(DIGEST_MAX_TOKENS).toBeGreaterThanOrEqual(1000);
  });
});
