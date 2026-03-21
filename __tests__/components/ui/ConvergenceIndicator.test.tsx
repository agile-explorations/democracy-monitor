import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConvergenceIndicator } from '@/components/ui/ConvergenceIndicator';

describe('ConvergenceIndicator', () => {
  it('renders three dots', () => {
    const { container } = render(
      <ConvergenceIndicator structural={false} ai={false} thematic={false} />,
    );
    const dots = container.querySelectorAll('span.inline-block');
    expect(dots).toHaveLength(3);
  });

  it('renders group with aria-label', () => {
    const { container } = render(
      <ConvergenceIndicator structural={true} ai={false} thematic={true} />,
    );
    const group = container.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Layer elevation status');
  });

  it('sets title attributes for each dot', () => {
    const { container } = render(
      <ConvergenceIndicator structural={true} ai={false} thematic={true} />,
    );
    const dots = container.querySelectorAll('span.inline-block');
    expect(dots[0].getAttribute('title')).toContain('L1 Structural (context): elevated');
    expect(dots[1].getAttribute('title')).toContain('L2 AI (active): normal');
    expect(dots[2].getAttribute('title')).toContain('L3 Thematic (context): elevated');
  });

  it('renders all dots with no errors when all elevated', () => {
    const { container } = render(
      <ConvergenceIndicator structural={true} ai={true} thematic={true} />,
    );
    const dots = container.querySelectorAll('span.inline-block');
    expect(dots).toHaveLength(3);
  });

  it('includes numeric scores in title attributes when provided', () => {
    const { container } = render(
      <ConvergenceIndicator
        structural={true}
        ai={false}
        thematic={true}
        scores={{ structural: 3.2, ai: 0.8, thematic: 4.1 }}
      />,
    );
    const dots = container.querySelectorAll('span.inline-block');
    expect(dots[0].getAttribute('title')).toContain('L1 Structural (context): elevated (3.2)');
    expect(dots[1].getAttribute('title')).toContain('L2 AI (active): normal (0.8)');
    expect(dots[2].getAttribute('title')).toContain('L3 Thematic (context): elevated (4.1)');
  });

  it('omits score suffix when scores are null', () => {
    const { container } = render(
      <ConvergenceIndicator
        structural={false}
        ai={false}
        thematic={false}
        scores={{ structural: null, ai: null, thematic: null }}
      />,
    );
    const dots = container.querySelectorAll('span.inline-block');
    expect(dots[0].getAttribute('title')).toContain('L1 Structural (context): normal');
    expect(dots[1].getAttribute('title')).toContain('L2 AI (active): normal');
    expect(dots[2].getAttribute('title')).toContain('L3 Thematic (context): normal');
  });
});
