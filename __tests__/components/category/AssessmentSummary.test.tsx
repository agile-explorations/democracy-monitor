import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AssessmentSummary } from '@/components/category/AssessmentSummary';

describe('AssessmentSummary', () => {
  it('renders the reason text', () => {
    render(
      <AssessmentSummary
        reason="Elevated keyword signals related to workforce changes."
        howWeCouldBeWrong={[]}
        readingLevel="summary"
      />,
    );
    expect(
      screen.getByText('Elevated keyword signals related to workforce changes.'),
    ).toBeDefined();
  });

  it('renders "how we could be wrong" items', () => {
    render(
      <AssessmentSummary
        reason="Test reason"
        howWeCouldBeWrong={['Routine policy update', 'Seasonal fluctuation']}
        readingLevel="summary"
      />,
    );
    expect(screen.getByText('How we could be wrong')).toBeDefined();
    expect(screen.getByText('Routine policy update')).toBeDefined();
    expect(screen.getByText('Seasonal fluctuation')).toBeDefined();
  });

  it('shows "no alternative interpretations" in detailed mode when list is empty', () => {
    render(
      <AssessmentSummary reason="Test reason" howWeCouldBeWrong={[]} readingLevel="detailed" />,
    );
    expect(
      screen.getByText('No alternative interpretations available for this assessment.'),
    ).toBeDefined();
  });

  it('does not show "no alternative interpretations" in summary mode', () => {
    render(
      <AssessmentSummary reason="Test reason" howWeCouldBeWrong={[]} readingLevel="summary" />,
    );
    expect(
      screen.queryByText('No alternative interpretations available for this assessment.'),
    ).toBeNull();
  });
});
