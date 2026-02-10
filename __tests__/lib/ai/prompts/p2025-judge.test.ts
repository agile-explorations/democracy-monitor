import { describe, it, expect } from 'vitest';
import { buildP2025JudgePrompt } from '@/lib/ai/prompts/p2025-judge';

describe('buildP2025JudgePrompt', () => {
  const proposal = {
    id: 'p2025-001',
    summary: 'Reclassify federal employees as at-will',
    text: 'Schedule F would reclassify policy-related positions.',
  };

  it('includes proposal details in prompt', () => {
    const prompt = buildP2025JudgePrompt(proposal, {
      title: 'Executive Order on Workforce',
      content: 'Reinstating Schedule F classification.',
    });

    expect(prompt).toContain('p2025-001');
    expect(prompt).toContain('Reclassify federal employees');
    expect(prompt).toContain('Executive Order on Workforce');
    expect(prompt).toContain('Reinstating Schedule F');
  });

  it('handles null document content', () => {
    const prompt = buildP2025JudgePrompt(proposal, {
      title: 'Test Document',
      content: null,
    });

    expect(prompt).toContain('Test Document');
    expect(prompt).toContain('Content: ');
  });

  it('truncates long document content', () => {
    const longContent = 'x'.repeat(5000);
    const prompt = buildP2025JudgePrompt(proposal, {
      title: 'Long Doc',
      content: longContent,
    });

    // Should be truncated to 2000 chars max
    expect(prompt.length).toBeLessThan(longContent.length);
  });

  it('includes classification instructions', () => {
    const prompt = buildP2025JudgePrompt(proposal, {
      title: 'Test',
      content: 'Test content',
    });

    expect(prompt).toContain('not_related');
    expect(prompt).toContain('loosely_related');
    expect(prompt).toContain('implements');
    expect(prompt).toContain('exceeds');
  });
});
