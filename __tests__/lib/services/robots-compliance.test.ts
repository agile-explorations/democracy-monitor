import { describe, expect, it } from 'vitest';
import { isPathAllowed, parseRobotsRules } from '@/lib/services/robots-compliance';

const DHS_STYLE = `
User-agent: *
Disallow: /archive/
Disallow: /search
Allow: /news/
`;

describe('parseRobotsRules', () => {
  it('collects rules from the * group', () => {
    const rules = parseRobotsRules(DHS_STYLE);
    expect(rules).toHaveLength(3);
    expect(rules[0]).toEqual({ allow: false, pattern: '/archive/' });
  });

  it('prefers a group naming our UA token over *', () => {
    const text = `
User-agent: *
Disallow: /

User-agent: democracymonitor
Disallow: /private/
`;
    const rules = parseRobotsRules(text);
    expect(rules).toEqual([{ allow: false, pattern: '/private/' }]);
  });

  it('handles stacked user-agent lines sharing one group body', () => {
    const text = `
User-agent: foo
User-agent: *
Disallow: /blocked/
`;
    expect(parseRobotsRules(text)).toEqual([{ allow: false, pattern: '/blocked/' }]);
  });

  it('strips comments and blank lines', () => {
    const text = `# top comment
User-agent: * # trailing
Disallow: /x/ # note
`;
    expect(parseRobotsRules(text)).toEqual([{ allow: false, pattern: '/x/' }]);
  });
});

describe('isPathAllowed', () => {
  const rules = parseRobotsRules(DHS_STYLE);

  it('blocks paths under a Disallow prefix (the dhs.gov /archive/ case)', () => {
    const verdict = isPathAllowed(rules, '/archive/news/2022/01/01/slug');
    expect(verdict.allowed).toBe(false);
    expect(verdict.matchedRule).toBe('Disallow: /archive/');
  });

  it('allows unmatched paths by default', () => {
    expect(isPathAllowed(rules, '/newsroom').allowed).toBe(true);
  });

  it('longest match wins across Allow/Disallow', () => {
    const r = parseRobotsRules(`
User-agent: *
Disallow: /news/
Allow: /news/public/
`);
    expect(isPathAllowed(r, '/news/private').allowed).toBe(false);
    expect(isPathAllowed(r, '/news/public/x').allowed).toBe(true);
  });

  it('Allow wins a tie of equal specificity', () => {
    const r = parseRobotsRules(`
User-agent: *
Disallow: /p/
Allow: /p/
`);
    expect(isPathAllowed(r, '/p/x').allowed).toBe(true);
  });

  it('supports * wildcards and $ anchors', () => {
    const r = parseRobotsRules(`
User-agent: *
Disallow: /*.json$
Disallow: /tmp*
`);
    expect(isPathAllowed(r, '/data/file.json').allowed).toBe(false);
    expect(isPathAllowed(r, '/data/file.jsonl').allowed).toBe(true);
    expect(isPathAllowed(r, '/tmpfiles/x').allowed).toBe(false);
  });

  it('treats an empty Disallow as allow-all', () => {
    const r = parseRobotsRules(`
User-agent: *
Disallow:
`);
    expect(isPathAllowed(r, '/anything').allowed).toBe(true);
  });
});
