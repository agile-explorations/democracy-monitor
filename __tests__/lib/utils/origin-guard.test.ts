import { describe, expect, it } from 'vitest';
import { constantTimeEqual, evaluateOrigin } from '@/lib/utils/origin-guard';
import type { OriginGuardInput } from '@/lib/utils/origin-guard';

const base: OriginGuardInput = {
  isProduction: true,
  secret: 'sekret',
  enforce: true,
  pathname: '/',
  header: 'sekret',
};

describe('constantTimeEqual', () => {
  it('is true for equal, false for different or different-length', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'ab')).toBe(false);
  });
});

describe('evaluateOrigin — fail-open conditions', () => {
  it('allows outside production', () => {
    expect(evaluateOrigin({ ...base, isProduction: false, header: null })).toEqual({
      action: 'allow',
    });
  });

  it('allows when no secret is configured', () => {
    expect(evaluateOrigin({ ...base, secret: undefined, header: null })).toEqual({
      action: 'allow',
    });
  });

  it('allows allowlisted paths without a header (health/cron/csp)', () => {
    for (const p of ['/api/health/live', '/api/cron/dump', '/api/csp-report']) {
      expect(evaluateOrigin({ ...base, pathname: p, header: null })).toEqual({ action: 'allow' });
    }
  });
});

describe('evaluateOrigin — matching header', () => {
  it('allows when the header matches the secret', () => {
    expect(evaluateOrigin({ ...base, header: 'sekret' })).toEqual({ action: 'allow' });
  });
});

describe('evaluateOrigin — log-only mode (enforce=false)', () => {
  it('logs but allows a mismatched header', () => {
    expect(evaluateOrigin({ ...base, enforce: false, header: 'wrong' })).toEqual({
      action: 'log',
      reason: 'mismatch',
    });
  });

  it('logs but allows a missing header', () => {
    expect(evaluateOrigin({ ...base, enforce: false, header: null })).toEqual({
      action: 'log',
      reason: 'missing',
    });
  });
});

describe('evaluateOrigin — enforcing (enforce=true)', () => {
  it('blocks a mismatched header', () => {
    expect(evaluateOrigin({ ...base, header: 'wrong' })).toEqual({ action: 'block' });
  });

  it('blocks a missing header', () => {
    expect(evaluateOrigin({ ...base, header: null })).toEqual({ action: 'block' });
  });
});
