import { describe, expect, it } from 'vitest';
import { isSameHostHttps } from '@/lib/utils/pagination';

const CL = 'https://www.courtlistener.com';
const GOVINFO = 'https://api.govinfo.gov';

describe('isSameHostHttps', () => {
  it('accepts an https URL on the same host', () => {
    expect(
      isSameHostHttps('https://www.courtlistener.com/api/rest/v4/search/?cursor=abc', CL),
    ).toBe(true);
    expect(
      isSameHostHttps('https://api.govinfo.gov/packages/CREC-2025/granules?offset=100', GOVINFO),
    ).toBe(true);
  });

  it('rejects a different host (the attack it exists to stop)', () => {
    expect(isSameHostHttps('https://evil.example.com/api/rest/v4/search/?cursor=abc', CL)).toBe(
      false,
    );
    // subdomain / sibling host must not pass
    expect(isSameHostHttps('https://api.govinfo.gov.evil.com/granules', GOVINFO)).toBe(false);
    expect(isSameHostHttps('https://courtlistener.com/x', CL)).toBe(false); // apex ≠ www
  });

  it('rejects an http downgrade on the correct host', () => {
    expect(isSameHostHttps('http://www.courtlistener.com/api/rest/v4/search/', CL)).toBe(false);
  });

  it('rejects relative or unparseable URLs', () => {
    expect(isSameHostHttps('/api/rest/v4/search/?cursor=abc', CL)).toBe(false);
    expect(isSameHostHttps('', CL)).toBe(false);
    expect(isSameHostHttps('not a url', CL)).toBe(false);
  });
});
