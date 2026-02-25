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
    expect(dots[0].getAttribute('title')).toContain('L1 Structural: elevated');
    expect(dots[1].getAttribute('title')).toContain('L2 AI: normal');
    expect(dots[2].getAttribute('title')).toContain('L3 Thematic: elevated');
  });

  it('renders all dots with no errors when all elevated', () => {
    const { container } = render(
      <ConvergenceIndicator structural={true} ai={true} thematic={true} />,
    );
    const dots = container.querySelectorAll('span.inline-block');
    expect(dots).toHaveLength(3);
  });
});
