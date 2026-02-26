import { describe, it, expect } from 'vitest';
import { buildMetadata, inferSourceOrigin } from '@/lib/services/document-store';

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

describe('inferSourceOrigin', () => {
  it('returns federal_register for Notice type', () => {
    expect(inferSourceOrigin({ type: 'Notice' })).toBe('federal_register');
  });

  it('returns federal_register for Rule type', () => {
    expect(inferSourceOrigin({ type: 'Rule' })).toBe('federal_register');
  });

  it('returns federal_register for executive_order type', () => {
    expect(inferSourceOrigin({ type: 'executive_order' })).toBe('federal_register');
  });

  it('returns doj for press_release type', () => {
    expect(inferSourceOrigin({ type: 'press_release' })).toBe('doj');
  });

  it('returns courtlistener for court_opinion type', () => {
    expect(inferSourceOrigin({ type: 'court_opinion' })).toBe('courtlistener');
  });

  it('returns courtlistener for docket_entry type', () => {
    expect(inferSourceOrigin({ type: 'docket_entry' })).toBe('courtlistener');
  });

  it('returns null for rhetoric type (ambiguous)', () => {
    expect(inferSourceOrigin({ type: 'rhetoric' })).toBeNull();
  });

  it('returns null for unknown types', () => {
    expect(inferSourceOrigin({ type: 'something_else' })).toBeNull();
  });

  it('returns null for empty item', () => {
    expect(inferSourceOrigin({})).toBeNull();
  });
});
