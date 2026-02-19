import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Sparkline } from '@/components/ui/Sparkline';

describe('Sparkline', () => {
  const sampleData = [
    { week: '2026-01-05', score: 1.2 },
    { week: '2026-01-12', score: 2.1 },
    { week: '2026-01-19', score: 0.8 },
    { week: '2026-01-26', score: 1.5 },
  ];

  it('renders an SVG element', () => {
    const { container } = render(
      <Sparkline data={sampleData} baselineAvg={1.0} baselineStdDev={0.5} />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('renders with correct viewBox dimensions', () => {
    const { container } = render(
      <Sparkline
        data={sampleData}
        baselineAvg={1.0}
        baselineStdDev={0.5}
        width={200}
        height={40}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 200 40');
  });

  it('renders baseline band rect', () => {
    const { container } = render(
      <Sparkline data={sampleData} baselineAvg={1.0} baselineStdDev={0.5} />,
    );
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(1);
  });

  it('renders baseline dashed line', () => {
    const { container } = render(
      <Sparkline data={sampleData} baselineAvg={1.0} baselineStdDev={0.5} />,
    );
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBe(1);
    expect(lines[0].getAttribute('stroke-dasharray')).toBe('3,3');
  });

  it('renders data line path and area fill path', () => {
    const { container } = render(
      <Sparkline data={sampleData} baselineAvg={1.0} baselineStdDev={0.5} />,
    );
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(2); // area fill + data line
  });

  it('renders empty SVG for no data', () => {
    const { container } = render(<Sparkline data={[]} baselineAvg={0} baselineStdDev={0} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.querySelector('path')).toBeNull();
  });

  it('includes aria-label with current score', () => {
    const { container } = render(
      <Sparkline data={sampleData} baselineAvg={1.0} baselineStdDev={0.5} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toContain('1.5');
  });
});
