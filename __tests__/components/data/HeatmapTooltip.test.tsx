import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeatmapTooltip } from '@/components/data/HeatmapTooltip';

describe('HeatmapTooltip positioning (#584 feedback)', () => {
  it('renders fixed below the cell at top z-order', () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as any;
    render(
      <HeatmapTooltip category="military" week="2026-01-05" tooltipText="Metrics here">
        <div data-testid="cell" />
      </HeatmapTooltip>,
    );
    const wrapper = screen.getByTestId('cell').parentElement!;
    wrapper.getBoundingClientRect = () =>
      ({ left: 100, right: 120, top: 50, bottom: 74, width: 20, height: 24 }) as DOMRect;
    fireEvent.mouseEnter(wrapper);
    const tip = screen.getByText('Metrics here');
    expect(tip.className).toContain('fixed');
    expect(tip.className).toContain('z-[9999]');
    // below the cell (bottom + 6), horizontally clamped to viewport
    expect(tip.style.top).toBe('80px');
    expect(parseFloat(tip.style.left)).toBeGreaterThanOrEqual(148); // half-width + margin
  });

  it('clamps near the right viewport edge so the tooltip stays on screen', () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as any;
    render(
      <HeatmapTooltip category="military" week="2026-01-05" tooltipText="Edge cell">
        <div data-testid="cell2" />
      </HeatmapTooltip>,
    );
    const wrapper = screen.getByTestId('cell2').parentElement!;
    const rightEdge = window.innerWidth - 4;
    wrapper.getBoundingClientRect = () =>
      ({
        left: rightEdge - 20,
        right: rightEdge,
        top: 50,
        bottom: 74,
        width: 20,
        height: 24,
      }) as DOMRect;
    fireEvent.mouseEnter(wrapper);
    const tip = screen.getByText('Edge cell');
    expect(parseFloat(tip.style.left)).toBeLessThanOrEqual(window.innerWidth - 148);
  });
});
