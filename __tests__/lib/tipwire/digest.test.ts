import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COOLDOWN_WEEKS,
  cadenceLabel,
  isInCooldown,
  needsReplyReminder,
} from '@/lib/tipwire/cadence';
import type { SentRow } from '@/lib/tipwire/cadence';
import {
  buildDigestLines,
  digestSubject,
  groupDuplicateDocs,
  orderCandidates,
} from '@/lib/tipwire/digest';
import type { DigestCandidate } from '@/lib/tipwire/digest';

const NOW = new Date('2026-09-07T20:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe('tipwire cadence guard (#858)', () => {
  it('holds a reporter for three weeks after an unreplied send, lifts on reply, never on dismissal', () => {
    const unreplied: SentRow[] = [{ reporterId: 'katz', sentAt: daysAgo(20), repliedAt: null }];
    expect(isInCooldown('katz', unreplied, NOW)).toBe(true);
    expect(isInCooldown('wagner', unreplied, NOW)).toBe(false);
    const old: SentRow[] = [{ reporterId: 'katz', sentAt: daysAgo(22), repliedAt: null }];
    expect(isInCooldown('katz', old, NOW)).toBe(false);
    const replied: SentRow[] = [{ reporterId: 'katz', sentAt: daysAgo(2), repliedAt: daysAgo(1) }];
    expect(isInCooldown('katz', replied, NOW)).toBe(false);
    expect(COOLDOWN_WEEKS).toBe(3);
  });

  it('labels cadence for the digest and flags unreplied sends older than a week', () => {
    expect(cadenceLabel('katz', [], NOW)).toBe('never tipped');
    expect(
      cadenceLabel('katz', [{ reporterId: 'katz', sentAt: daysAgo(5), repliedAt: null }], NOW),
    ).toContain('in 3-week cooldown');
    expect(
      cadenceLabel(
        'katz',
        [{ reporterId: 'katz', sentAt: daysAgo(5), repliedAt: daysAgo(4) }],
        NOW,
      ),
    ).toContain('replied');
    expect(needsReplyReminder({ reporterId: 'k', sentAt: daysAgo(8), repliedAt: null }, NOW)).toBe(
      true,
    );
    expect(needsReplyReminder({ reporterId: 'k', sentAt: daysAgo(3), repliedAt: null }, NOW)).toBe(
      false,
    );
  });
});

function cand(id: number, extra: Partial<DigestCandidate> = {}): DigestCandidate {
  return {
    id,
    reporterId: 'wagner',
    reporterName: 'Erich Wagner',
    outlet: 'Government Executive',
    title: `Article ${id}`,
    url: `https://g/${id}`,
    publishedAt: daysAgo(1),
    ledeSource: 'rss',
    coauthorCount: 0,
    reactive: false,
    kind: 'forward',
    coverage: null,
    tip: {
      sentences: ['One.', 'Two.', 'Three.'],
      specificClaim: 'claim',
      whyUnreportedAppears: 'why',
      confidence: 'medium',
    },
    tipDocumentId: 9,
    docTitle: 'Doc nine',
    docUrl: 'https://d/9',
    cadence: 'never tipped',
    createdAt: daysAgo(0.1 * id),
    ...extra,
  };
}

describe('tipwire digest (#858)', () => {
  it('orders reactive first, renders commands per candidate, cross-references duplicate documents, and isolates title-only matches', () => {
    const cands = [
      cand(1),
      cand(2, { reactive: true }),
      cand(3, { ledeSource: 'none', tipDocumentId: 7 }),
    ];
    expect(orderCandidates(cands).map((c) => c.id)).toEqual([2, 1, 3]);
    expect([...groupDuplicateDocs(cands).entries()]).toEqual([[9, [1, 2]]]);
    const lines = buildDigestLines(cands, [], []);
    const text = lines.join('\n\n');
    expect(text.indexOf('⚡ REACTIVE')).toBeLessThan(text.indexOf('#1 ·'));
    expect(text).toContain('pnpm tips:sent --candidate 2 --replied');
    expect(text).toContain('Since their piece: Article 2');
    const contra = buildDigestLines([cand(4, { kind: 'contradiction' })], [], []).join('\n');
    expect(contra).toContain('CONTRADICTION CHECK');
    expect(contra).toContain('Article: Article 4');
    expect(text).toContain('Also proposed for candidate(s) #2 — same document; send one.');
    expect(text.indexOf('TITLE-ONLY MATCHES (1)')).toBeGreaterThan(text.indexOf('#1 ·'));
    expect(text).toContain('read the piece before sending');
    expect(digestSubject(cands)).toBe('[tipwire] 3 tip candidates (1 reactive)');
  });

  it('renders the coverage line with URLs and sorts likely-covered candidates after the rest', () => {
    const covered = cand(5, {
      coverage: {
        checkedAt: '2026-09-08T00:00:00Z',
        windowDays: 30,
        keys: [{ key: '2026-18061', hits: 4, sampleUrls: ['https://www.nytimes.com/x'] }],
        label: 'likely-covered',
      },
    });
    const zero = cand(6, {
      coverage: {
        checkedAt: '2026-09-08T00:00:00Z',
        windowDays: 30,
        keys: [{ key: 'EO 14410', hits: 0, sampleUrls: [] }],
        label: 'checkable-zero',
      },
    });
    expect(orderCandidates([covered, zero, cand(7)]).map((c) => c.id)).toEqual([6, 7, 5]);
    const text = buildDigestLines([covered, zero, cand(7)], [], []).join('\n');
    expect(text).toContain('Coverage: 4 hit(s) in 30d — likely covered, read before sending');
    expect(text).toContain('  · "2026-18061": https://www.nytimes.com/x');
    expect(text).toContain('Coverage: 0 hits in 30d (checkable claim)');
    expect(text).toContain('Coverage: not yet checked');
  });

  it('adds the unreplied reminder and the cadence-skip footer; empty digest says so', () => {
    const lines = buildDigestLines(
      [],
      [{ candidateId: 4, reporterName: 'Eric Katz', title: 'Old piece', sentAt: daysAgo(9) }],
      ['katz'],
    );
    expect(lines[0]).toBe('No open tip candidates.');
    expect(lines.join('\n')).toContain('SENT BUT UNREPLIED FOR ≥ 7 DAYS');
    expect(lines.join('\n')).toContain('pnpm tips:sent --candidate 4 --replied');
    expect(lines.join('\n')).toContain('pnpm tips:poll --ignore-cadence');
  });
});

describe('tipwire corpus boundary (no-news-in-documents)', () => {
  it('no tipwire module inserts into or updates the documents table', () => {
    const dir = path.join(process.cwd(), 'lib', 'tipwire');
    for (const f of readdirSync(dir)) {
      const src = readFileSync(path.join(dir, f), 'utf8');
      expect(src, f).not.toMatch(
        /insert\(\s*documents\s*\)|update\(\s*documents\s*\)|delete\(\s*documents\s*\)/,
      );
      expect(src, f).not.toMatch(/INSERT INTO documents|UPDATE documents|DELETE FROM documents/i);
    }
  });
});
