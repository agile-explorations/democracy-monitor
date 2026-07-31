import { describe, expect, it } from 'vitest';
import { serializeJsonLd } from '@/lib/utils/json-ld';

describe('serializeJsonLd', () => {
  it('escapes </script> so an injected title cannot break out of the ld+json tag', () => {
    const out = serializeJsonLd({ headline: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<');
    expect(out).toContain('\\u003c');
  });

  it('escapes > and & as defense-in-depth', () => {
    const out = serializeJsonLd({ v: 'a > b & c' });
    expect(out).not.toContain('>');
    expect(out).not.toContain('&');
    expect(out).toContain('\\u003e');
    expect(out).toContain('\\u0026');
  });

  it('round-trips: the escaped output parses back to the original data (SEO intact)', () => {
    const data = { a: '</script>', b: 'x & y > z', nested: { c: [1, '<b>hi</b>'] } };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});
