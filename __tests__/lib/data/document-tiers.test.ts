import { describe, it, expect } from 'vitest';
import {
  ACTION_TIER_SHARE,
  composeTieredResults,
  labelForSourceType,
  tierForSourceType,
} from '@/lib/data/document-tiers';

describe('tierForSourceType', () => {
  it('classifies debate and rhetoric as discussion', () => {
    expect(tierForSourceType('floor_speech')).toBe('discussion');
    expect(tierForSourceType('nomination')).toBe('discussion');
    expect(tierForSourceType('presidential_remarks')).toBe('discussion');
    expect(tierForSourceType('presidential_interview')).toBe('discussion');
  });

  it('classifies formal instruments as action', () => {
    expect(tierForSourceType('judicial_opinion')).toBe('action');
    expect(tierForSourceType('executive_order')).toBe('action');
    expect(tierForSourceType('Rule')).toBe('action');
    expect(tierForSourceType('bill')).toBe('action');
    expect(tierForSourceType('ig_report')).toBe('action');
    expect(tierForSourceType('presidential_statement')).toBe('action');
  });

  it('defaults unknown and missing source types to action', () => {
    expect(tierForSourceType('brand_new_type')).toBe('action');
    expect(tierForSourceType(null)).toBe('action');
    expect(tierForSourceType(undefined)).toBe('action');
  });
});

describe('composeTieredResults', () => {
  const docs = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

  it('composes the 60/40 split when both tiers are plentiful', () => {
    const out = composeTieredResults(docs(30, 'a'), docs(30, 'd'), 30);
    expect(out).toHaveLength(30);
    expect(out.filter((x) => x.startsWith('a'))).toHaveLength(18);
    expect(out.filter((x) => x.startsWith('d'))).toHaveLength(12);
    expect(out[0]).toBe('a0'); // actions lead
    expect(out[18]).toBe('d0');
  });

  it('backfills from discussions when actions are short', () => {
    const out = composeTieredResults(docs(5, 'a'), docs(30, 'd'), 30);
    expect(out).toHaveLength(30);
    expect(out.filter((x) => x.startsWith('a'))).toHaveLength(5);
    expect(out.filter((x) => x.startsWith('d'))).toHaveLength(25);
  });

  it('backfills from actions when discussions are short', () => {
    const out = composeTieredResults(docs(30, 'a'), docs(3, 'd'), 30);
    expect(out).toHaveLength(30);
    expect(out.filter((x) => x.startsWith('a'))).toHaveLength(27);
    expect(out.filter((x) => x.startsWith('d'))).toHaveLength(3);
  });

  it('returns everything when both tiers are short', () => {
    const out = composeTieredResults(docs(4, 'a'), docs(3, 'd'), 30);
    expect(out).toHaveLength(7);
  });

  it('preserves within-tier ordering', () => {
    const out = composeTieredResults(['a0', 'a1'], ['d0', 'd1'], 4);
    expect(out).toEqual(['a0', 'a1', 'd0', 'd1']);
  });

  it('uses the documented action share', () => {
    expect(ACTION_TIER_SHARE).toBe(0.6);
  });
});

describe('labelForSourceType', () => {
  it('maps known types to human labels', () => {
    expect(labelForSourceType('judicial_opinion')).toBe('Opinion');
    expect(labelForSourceType('executive_order')).toBe('Executive Order');
    expect(labelForSourceType('floor_speech')).toBe('Floor Speech');
  });

  it('humanizes unknown types and handles missing values', () => {
    expect(labelForSourceType('some_new_type')).toBe('some new type');
    expect(labelForSourceType(null)).toBe('Document');
  });
});
