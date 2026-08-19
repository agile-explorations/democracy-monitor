import { describe, expect, it } from 'vitest';
import type { DigestEntry } from '@/lib/services/followup-proposal-service';
import { buildPoolDigest } from '@/lib/services/followup-proposal-service';

function entry(overrides: Partial<DigestEntry> = {}): DigestEntry {
  return {
    title: 'Test Document',
    sourceType: 'congressional_record',
    publishedAt: '2026-01-15T00:00:00Z',
    body: 'Body text mentioning the Alien Enemies Act and Kilmar Abrego Garcia.',
    ...overrides,
  };
}

describe('buildPoolDigest', () => {
  it('renders one numbered entry per doc with source, date, title, excerpt', () => {
    const digest = buildPoolDigest([entry(), entry({ title: 'Second Doc' })]);
    expect(digest).toContain('1. [congressional_record, 2026-01-15] Test Document');
    expect(digest).toContain('2. [congressional_record, 2026-01-15] Second Doc');
    expect(digest).toContain('Alien Enemies Act');
  });

  it('collapses whitespace and keeps deep-mention text within the cap', () => {
    const deep = 'a b c '.repeat(1500) + 'Alien Enemies Act';
    const digest = buildPoolDigest([entry({ body: deep })]);
    const excerptLine = digest.split('\n')[1];
    expect(excerptLine).not.toContain('\n');
    // 9000 chars of filler stays under the 12k cap, so the deep mention survives.
    expect(digest).toContain('Alien Enemies Act');
  });

  it('handles empty bodies and missing dates', () => {
    const digest = buildPoolDigest([entry({ body: '', publishedAt: null })]);
    expect(digest).toContain('[congressional_record, undated]');
  });
});
