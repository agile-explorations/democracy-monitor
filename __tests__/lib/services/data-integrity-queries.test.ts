import { describe, expect, it } from 'vitest';
import { buildOrphanCheck } from '@/lib/services/data-integrity-queries';

describe('buildOrphanCheck', () => {
  it('flags a genuinely unknown category', () => {
    const check = buildOrphanCheck('documents', [
      { category: 'civilLiberties' },
      { category: 'bogus' },
    ]);
    expect(check.pass).toBe(false);
    expect(check.count).toBe(1);
    expect(check.detail).toBe('bogus');
  });

  it('does NOT flag the presidential-intent pseudo-category (#641 follow-up)', () => {
    const check = buildOrphanCheck('documents', [
      { category: 'intent' },
      { category: 'elections' },
    ]);
    expect(check.pass).toBe(true);
    expect(check.count).toBe(0);
    expect(check.detail).toBeUndefined();
  });

  it('passes cleanly when every category is a valid detection key', () => {
    const check = buildOrphanCheck('document_scores', [
      { category: 'civilLiberties' },
      { category: 'elections' },
    ]);
    expect(check.pass).toBe(true);
    expect(check.count).toBe(0);
  });
});
