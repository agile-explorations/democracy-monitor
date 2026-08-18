import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AIAssessmentPanel } from '@/components/category/AIAssessmentPanel';
import type { AIAssessmentSummary } from '@/lib/types/structural';

function makeSummary(overrides: Partial<AIAssessmentSummary> = {}): AIAssessmentSummary {
  return {
    flagCount: 5,
    totalDocuments: 100,
    flagRate: 0.05,
    baselineFlagRate: 0.03,
    flagRateZScore: 1.2,
    concernDistribution: {
      routine: 60,
      novelNotConcerning: 25,
      potentiallyConcerning: 10,
      clearlyConcerning: 5,
    },
    concernRate: 0.15,
    auditSample: { sampled: 3, falseNegatives: 0, falseNegativeRate: 0 },
    pass1Model: 'gpt-4o-mini',
    pass2Model: 'claude-sonnet-4-5-20250929',
    ...overrides,
  };
}

describe('AIAssessmentPanel', () => {
  it('shows "no AI assessment data" when summary is null', () => {
    render(<AIAssessmentPanel summary={null} readingLevel="summary" />);
    expect(screen.getByText('No AI assessment data available.')).toBeDefined();
  });

  it('shows flag rate and concern rate in summary mode', () => {
    render(<AIAssessmentPanel summary={makeSummary()} readingLevel="summary" />);
    expect(screen.getByText('5.0%')).toBeDefined(); // flag rate
    expect(screen.getByText('15.0%')).toBeDefined(); // concern rate
  });

  it('renders the actor-mix line when actorConfirmations present (#537)', () => {
    const summary = makeSummary({
      actorConfirmations: {
        federal_executive: { potentiallyConcerning: 1, clearlyConcerning: 3 },
        congress: { potentiallyConcerning: 0, clearlyConcerning: 1 },
        judiciary: { potentiallyConcerning: 0, clearlyConcerning: 0 },
        state_local: { potentiallyConcerning: 0, clearlyConcerning: 0 },
        other_unclear: { potentiallyConcerning: 0, clearlyConcerning: 0 },
        unattributed: { potentiallyConcerning: 0, clearlyConcerning: 0 },
      },
    });
    render(<AIAssessmentPanel summary={summary} readingLevel="detailed" />);
    expect(screen.getByText('Departures by Actor')).toBeDefined();
    expect(screen.getByText(/4 federal executive/)).toBeDefined();
    expect(screen.getByText(/1 Congress/)).toBeDefined();
  });

  it('renders no actor-mix line for legacy ai_detail without actorConfirmations (#537)', () => {
    render(<AIAssessmentPanel summary={makeSummary()} readingLevel="detailed" />);
    expect(screen.queryByText('Departures by Actor')).toBeNull();
  });

  it('highlights concern rate when above threshold', () => {
    render(
      <AIAssessmentPanel summary={makeSummary({ concernRate: 0.25 })} readingLevel="detailed" />,
    );
    expect(screen.getByText(/25\.0%/)).toBeDefined();
    expect(screen.getByText(/elevated/)).toBeDefined();
  });

  it('shows full breakdown in detailed mode', () => {
    render(<AIAssessmentPanel summary={makeSummary()} readingLevel="detailed" />);
    expect(screen.getByText('Flag Rate')).toBeDefined();
    expect(screen.getByText('Baseline Flag Rate')).toBeDefined();
    expect(screen.getByText('Flag Rate Z-Score')).toBeDefined();
    const body = document.body.textContent ?? '';
    expect(body).toContain('gpt-4o-mini');
  });

  it('shows audit info in detailed mode', () => {
    render(<AIAssessmentPanel summary={makeSummary()} readingLevel="detailed" />);
    const body = document.body.textContent ?? '';
    expect(body).toContain('3 sampled');
    expect(body).toContain('0 false negatives');
  });

  it('shows concern distribution labels', () => {
    render(<AIAssessmentPanel summary={makeSummary()} readingLevel="detailed" />);
    expect(screen.getByText(/Routine/)).toBeDefined();
  });
});
