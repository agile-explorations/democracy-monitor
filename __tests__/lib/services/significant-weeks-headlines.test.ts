import { describe, it, expect } from 'vitest';
import { buildHeadlinePrompt } from '@/lib/services/significant-weeks-headlines';

describe('buildHeadlinePrompt', () => {
  it('includes week, doc titles with reasoning, and overview excerpt', () => {
    const prompt = buildHeadlinePrompt(
      '2025-04-28',
      [
        { title: 'Strengthening and Unleashing Law Enforcement', reasoning: 'Directs military…' },
        { title: 'Restoring Accountability to Policy Positions', reasoning: null },
      ],
      'This week saw a sweeping law-enforcement order.',
    );
    expect(prompt).toContain('Week of 2025-04-28');
    expect(prompt).toContain('Strengthening and Unleashing Law Enforcement — Directs military…');
    expect(prompt).toContain('- Restoring Accountability to Policy Positions');
    expect(prompt).toContain('This week saw a sweeping law-enforcement order.');
  });

  it('instructs concrete actions and forbids statistics', () => {
    const prompt = buildHeadlinePrompt('2025-04-28', [], 'excerpt');
    expect(prompt).toContain('concrete government');
    expect(prompt).toContain('Do NOT mention category counts, statistics');
    expect(prompt).toContain('max 160 characters');
  });

  it('omits empty sections', () => {
    const prompt = buildHeadlinePrompt('2025-04-28', [], null);
    expect(prompt).not.toContain('Top concerning documents');
    expect(prompt).not.toContain('Weekly summary excerpt');
  });

  it('truncates long reasoning', () => {
    const prompt = buildHeadlinePrompt(
      '2025-04-28',
      [{ title: 'Doc', reasoning: 'x'.repeat(500) }],
      null,
    );
    expect(prompt).toContain('x'.repeat(200));
    expect(prompt).not.toContain('x'.repeat(201));
  });
});
