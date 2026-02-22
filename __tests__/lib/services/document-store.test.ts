import { describe, it, expect } from 'vitest';
import { buildMetadata } from '@/lib/services/document-store';

describe('buildMetadata', () => {
  it('returns null when no metadata fields are present', () => {
    expect(buildMetadata({ title: 'Test' })).toBeNull();
  });

  it('includes agency when present', () => {
    const meta = buildMetadata({ agency: 'EPA' });
    expect(meta).toEqual({ agency: 'EPA' });
  });

  it('includes action when present', () => {
    const meta = buildMetadata({ action: 'Final rule.' });
    expect(meta).toEqual({ action: 'Final rule.' });
  });

  it('includes subtype when present', () => {
    const meta = buildMetadata({ subtype: 'Executive Order' });
    expect(meta).toEqual({ subtype: 'Executive Order' });
  });

  it('includes all three fields when all present', () => {
    const meta = buildMetadata({
      agency: 'OPM',
      action: 'Notice.',
      subtype: 'Proclamation',
    });
    expect(meta).toEqual({
      agency: 'OPM',
      action: 'Notice.',
      subtype: 'Proclamation',
    });
  });

  it('omits undefined fields without including them', () => {
    const meta = buildMetadata({ agency: 'EPA', action: undefined });
    expect(meta).toEqual({ agency: 'EPA' });
    expect(meta).not.toHaveProperty('action');
  });
});
