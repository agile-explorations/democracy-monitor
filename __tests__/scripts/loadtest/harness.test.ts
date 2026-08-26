import { describe, expect, it } from 'vitest';
import { hashQuery as serverHash } from '@/lib/services/search-docs-response';
import { hashQuery as clientHash } from '@/scripts/loadtest/client';
import { pct } from '@/scripts/loadtest/collect';

describe('loadtest harness (#781)', () => {
  it('client hashQuery matches the server implementation exactly', () => {
    for (const q of ['A Question ', 'what happened?', '  MIXED case  ']) {
      expect(clientHash(q)).toBe(serverHash(q));
    }
  });

  it('pct computes stable percentiles', () => {
    expect(pct([], 50)).toBeNull();
    expect(pct([10], 50)).toBe(10);
    expect(pct([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(6);
    expect(pct([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
  });

  it('question bank has no collisions with eval or prewarm questions', () => {
    const { readFileSync } = require('fs') as typeof import('fs');
    const bank = JSON.parse(readFileSync('scripts/loadtest/questions.json', 'utf8')) as Array<{
      q: string;
    }>;
    const reserved = new Set<string>();
    const checklists = JSON.parse(readFileSync('scripts/completeness-checklists.json', 'utf8')) as {
      questions: Array<{ q: string }>;
    };
    checklists.questions.forEach((q) => reserved.add(serverHash(q.q)));
    const prewarm = JSON.parse(readFileSync('scripts/prewarm-questions.json', 'utf8')) as Array<{
      url: string;
    }>;
    prewarm.forEach((p) => {
      const q = new URL(p.url).searchParams.get('q');
      if (q) reserved.add(serverHash(q));
    });
    expect(bank.length).toBeGreaterThanOrEqual(90);
    expect(bank.filter((b) => reserved.has(serverHash(b.q)))).toEqual([]);
  });
});
