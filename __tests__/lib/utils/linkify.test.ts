import { describe, expect, it } from 'vitest';
import { splitLinkified } from '@/lib/utils/linkify';

describe('splitLinkified', () => {
  it('returns a single text segment when there is no URL', () => {
    expect(splitLinkified('just plain text')).toEqual([{ type: 'text', value: 'just plain text' }]);
  });

  it('splits text around a single URL', () => {
    expect(splitLinkified('see https://example.com now')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', value: 'https://example.com' },
      { type: 'text', value: ' now' },
    ]);
  });

  it('links a URL at the very start and end', () => {
    expect(splitLinkified('https://a.com')).toEqual([{ type: 'link', value: 'https://a.com' }]);
  });

  it('handles multiple URLs', () => {
    const segs = splitLinkified('a https://one.com b http://two.com');
    expect(segs.filter((s) => s.type === 'link').map((s) => s.value)).toEqual([
      'https://one.com',
      'http://two.com',
    ]);
  });

  it('strips trailing sentence punctuation off the link (keeps it as text)', () => {
    expect(splitLinkified('read https://example.com/page.')).toEqual([
      { type: 'text', value: 'read ' },
      { type: 'link', value: 'https://example.com/page' },
      { type: 'text', value: '.' },
    ]);
  });

  it('preserves newlines in surrounding text', () => {
    const segs = splitLinkified('line one\nhttps://x.com\nline three');
    expect(segs).toEqual([
      { type: 'text', value: 'line one\n' },
      { type: 'link', value: 'https://x.com' },
      { type: 'text', value: '\nline three' },
    ]);
  });

  // Security: only http(s) is ever a link.
  it('never links a javascript: scheme', () => {
    const segs = splitLinkified('click javascript:alert(1) here');
    expect(segs.some((s) => s.type === 'link')).toBe(false);
  });

  it('never links a data: scheme', () => {
    const segs = splitLinkified('data:text/html,<script>alert(1)</script>');
    expect(segs.some((s) => s.type === 'link')).toBe(false);
  });

  it('leaves a bare www. host as plain text (no scheme, no link)', () => {
    expect(splitLinkified('visit www.example.com')).toEqual([
      { type: 'text', value: 'visit www.example.com' },
    ]);
  });
});
