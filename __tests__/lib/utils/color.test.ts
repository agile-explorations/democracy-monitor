import { describe, it, expect } from 'vitest';
import { lerpColor, divergingZScoreColor, sequentialScaleColor } from '@/lib/utils/color';

describe('lerpColor', () => {
  it('returns first color at t=0', () => {
    expect(lerpColor('#000000', '#ffffff', 0)).toBe('#000000');
  });

  it('returns second color at t=1', () => {
    expect(lerpColor('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('returns midpoint at t=0.5', () => {
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('clamps t below 0', () => {
    expect(lerpColor('#000000', '#ffffff', -1)).toBe('#000000');
  });

  it('clamps t above 1', () => {
    expect(lerpColor('#000000', '#ffffff', 2)).toBe('#ffffff');
  });

  it('interpolates non-trivial colors', () => {
    // Red to blue at midpoint → purple-ish
    const result = lerpColor('#ff0000', '#0000ff', 0.5);
    expect(result).toBe('#800080');
  });
});

describe('divergingZScoreColor', () => {
  it('returns null for null z-score', () => {
    expect(divergingZScoreColor(null, 'light')).toBeNull();
    expect(divergingZScoreColor(null, 'dark')).toBeNull();
  });

  it('returns neutral color at z-score 0', () => {
    const light = divergingZScoreColor(0, 'light');
    expect(light).toBe('#f1f5f9'); // light neutral
    const dark = divergingZScoreColor(0, 'dark');
    expect(dark).toBe('#1e293b'); // dark neutral
  });

  it('returns blue-ish at negative z-scores', () => {
    const color = divergingZScoreColor(-4, 'light');
    expect(color).toBe('#2563eb'); // full blue
  });

  it('returns red-ish at positive z-scores', () => {
    const color = divergingZScoreColor(4, 'light');
    expect(color).toBe('#dc2626'); // full red
  });

  it('clamps z-scores beyond [-4, 4]', () => {
    expect(divergingZScoreColor(-10, 'light')).toBe(divergingZScoreColor(-4, 'light'));
    expect(divergingZScoreColor(10, 'light')).toBe(divergingZScoreColor(4, 'light'));
  });

  it('produces different colors for light and dark modes', () => {
    const light = divergingZScoreColor(2, 'light');
    const dark = divergingZScoreColor(2, 'dark');
    expect(light).not.toBe(dark);
  });

  it('produces colors between neutral and extreme at moderate z-scores', () => {
    const atZero = divergingZScoreColor(0, 'light');
    const atTwo = divergingZScoreColor(2, 'light');
    const atFour = divergingZScoreColor(4, 'light');
    // All should be different
    expect(atZero).not.toBe(atTwo);
    expect(atTwo).not.toBe(atFour);
  });
});

describe('sequentialScaleColor', () => {
  it('returns null for null value', () => {
    expect(sequentialScaleColor(null, 1, 'light')).toBeNull();
  });

  it('returns null for max <= 0', () => {
    expect(sequentialScaleColor(0.5, 0, 'light')).toBeNull();
    expect(sequentialScaleColor(0.5, -1, 'light')).toBeNull();
  });

  it('returns low color at value 0', () => {
    const color = sequentialScaleColor(0, 1, 'light');
    expect(color).toBe('#f1f5f9');
  });

  it('returns high color at value = max', () => {
    const color = sequentialScaleColor(1, 1, 'light');
    expect(color).toBe('#dc2626');
  });

  it('clamps values above max', () => {
    expect(sequentialScaleColor(2, 1, 'light')).toBe(sequentialScaleColor(1, 1, 'light'));
  });

  it('clamps values below 0', () => {
    expect(sequentialScaleColor(-1, 1, 'light')).toBe(sequentialScaleColor(0, 1, 'light'));
  });

  it('produces different colors for light and dark modes', () => {
    const light = sequentialScaleColor(0.5, 1, 'light');
    const dark = sequentialScaleColor(0.5, 1, 'dark');
    expect(light).not.toBe(dark);
  });

  it('produces colors between low and high at midpoint', () => {
    const atZero = sequentialScaleColor(0, 1, 'light');
    const atHalf = sequentialScaleColor(0.5, 1, 'light');
    const atOne = sequentialScaleColor(1, 1, 'light');
    expect(atZero).not.toBe(atHalf);
    expect(atHalf).not.toBe(atOne);
  });
});
