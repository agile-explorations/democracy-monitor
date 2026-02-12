import { describe, it, expect } from 'vitest';
import { CATEGORIES } from '@/lib/data/categories';
import { SEED_PROPOSALS } from '@/lib/data/p2025/seed-proposals';

const VALID_CATEGORIES = CATEGORIES.map((c) => c.key);
const VALID_SEVERITIES = ['low', 'medium', 'high', 'extreme'];
const VALID_STATUSES = ['not_started', 'in_progress', 'implemented', 'exceeded', 'abandoned'];
const VALID_POLICY_AREAS = [
  'rule_of_law',
  'civil_liberties',
  'elections',
  'media_freedom',
  'institutional_independence',
];

describe('SEED_PROPOSALS', () => {
  it('has at least 10 proposals', () => {
    expect(SEED_PROPOSALS.length).toBeGreaterThanOrEqual(10);
  });

  it('all proposals have required fields', () => {
    for (const p of SEED_PROPOSALS) {
      expect(p.id).toBeTruthy();
      expect(p.chapter).toBeTruthy();
      expect(p.severity).toBeTruthy();
      expect(p.text).toBeTruthy();
      expect(p.summary).toBeTruthy();
      expect(p.status).toBeTruthy();
    }
  });

  it('all IDs are unique', () => {
    const ids = SEED_PROPOSALS.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all IDs follow naming convention', () => {
    for (const p of SEED_PROPOSALS) {
      expect(p.id).toMatch(/^p2025-[a-zA-Z]+-\d{3}$/);
    }
  });

  it('dashboardCategory values exist in CATEGORIES', () => {
    for (const p of SEED_PROPOSALS) {
      if (p.dashboardCategory) {
        expect(VALID_CATEGORIES).toContain(p.dashboardCategory);
      }
    }
  });

  it('severity values are valid', () => {
    for (const p of SEED_PROPOSALS) {
      expect(VALID_SEVERITIES).toContain(p.severity);
    }
  });

  it('status values are valid', () => {
    for (const p of SEED_PROPOSALS) {
      expect(VALID_STATUSES).toContain(p.status);
    }
  });

  it('policyArea values are valid when present', () => {
    for (const p of SEED_PROPOSALS) {
      if (p.policyArea) {
        expect(VALID_POLICY_AREAS).toContain(p.policyArea);
      }
    }
  });

  it('spans multiple categories', () => {
    const categories = new Set(SEED_PROPOSALS.map((p) => p.dashboardCategory).filter(Boolean));
    expect(categories.size).toBeGreaterThanOrEqual(5);
  });

  it('includes multiple severity levels', () => {
    const severities = new Set(SEED_PROPOSALS.map((p) => p.severity));
    expect(severities.size).toBeGreaterThanOrEqual(2);
  });

  it('summaries are reasonably short', () => {
    for (const p of SEED_PROPOSALS) {
      expect(p.summary.length).toBeLessThan(200);
    }
  });
});
