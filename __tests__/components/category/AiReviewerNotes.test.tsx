import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AiReviewerNotes } from '@/components/category/AiReviewerNotes';

const baseAiResult = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  status: 'Warning' as const,
  reasoning: 'The keyword matches appear to reflect routine governance activity.',
  confidence: 0.82,
};

describe('AiReviewerNotes', () => {
  it('shows no-review message when aiResult is missing', () => {
    render(<AiReviewerNotes keywordStatus="Warning" readingLevel="summary" />);
    expect(screen.getByText('No AI review available for this assessment.')).toBeDefined();
  });

  it('shows one-liner in summary mode', () => {
    render(
      <AiReviewerNotes aiResult={baseAiResult} keywordStatus="Warning" readingLevel="summary" />,
    );
    const text = screen.getByText(/AI reviewer agrees with/);
    expect(text.textContent).toContain('Warning');
    expect(text.textContent).toContain('82%');
  });

  it('shows "recommends lowering" when AI status differs', () => {
    render(
      <AiReviewerNotes
        aiResult={{ ...baseAiResult, status: 'Stable' }}
        keywordStatus="Warning"
        readingLevel="summary"
      />,
    );
    expect(screen.getByText(/recommends lowering to/)).toBeDefined();
  });

  it('shows full breakdown in detailed mode', () => {
    render(
      <AiReviewerNotes
        aiResult={baseAiResult}
        keywordStatus="Warning"
        readingLevel="detailed"
        keywordReview={[
          { keyword: 'schedule f', assessment: 'genuine_concern', reasoning: 'Direct reference' },
        ]}
        evidenceFor={[{ text: 'Multiple workforce restructuring documents' }]}
        evidenceAgainst={[{ text: 'Standard annual review cycle' }]}
        whatWouldChangeMind="Direct executive order citing Schedule F"
      />,
    );
    expect(screen.getByText('Keyword review')).toBeDefined();
    expect(screen.getByText('schedule f')).toBeDefined();
    expect(screen.getByText('Evidence for concern')).toBeDefined();
    expect(screen.getByText('Evidence against concern')).toBeDefined();
    expect(screen.getByText('What would change our mind')).toBeDefined();
    expect(screen.getByText(/The AI reviewer can confirm or recommend lowering/)).toBeDefined();
  });

  it('shows model name in detailed mode', () => {
    render(
      <AiReviewerNotes aiResult={baseAiResult} keywordStatus="Warning" readingLevel="detailed" />,
    );
    expect(screen.getByText('gpt-4o-mini')).toBeDefined();
  });

  it('shows "Legacy AI Reviewer" heading when legacy is true', () => {
    render(
      <AiReviewerNotes
        aiResult={baseAiResult}
        keywordStatus="Warning"
        readingLevel="summary"
        legacy={true}
      />,
    );
    expect(screen.getByText('Legacy AI Reviewer (Pre-L2)')).toBeDefined();
  });

  it('shows legacy phaseout note in detailed mode when legacy is true', () => {
    render(
      <AiReviewerNotes
        aiResult={baseAiResult}
        keywordStatus="Warning"
        readingLevel="detailed"
        legacy={true}
      />,
    );
    expect(screen.getByText('Legacy AI Reviewer Notes (Pre-L2)')).toBeDefined();
    expect(screen.getByText(/being phased out in favor of the Layer 2/)).toBeDefined();
  });
});
