import type { NextApiRequest, NextApiResponse } from 'next';
import { describe, it, expect, vi } from 'vitest';
import type { StoredNarrative } from '@/lib/types';
import {
  formatError,
  parseBooleanParam,
  requireWeekOf,
  tryStoredResponse,
  sendCached,
} from '@/lib/utils/api-helpers';

function mockReq(query: Record<string, string | undefined> = {}): NextApiRequest {
  return { query } as unknown as NextApiRequest;
}

function mockRes(): NextApiResponse & {
  _status: number;
  _body: unknown;
  _headers: Record<string, string>;
} {
  const res = {
    _status: 0,
    _body: undefined,
    _headers: {} as Record<string, string>,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._body = body;
      return res;
    },
    setHeader(key: string, value: string) {
      res._headers[key] = value;
      return res;
    },
  };
  return res as unknown as NextApiResponse & typeof res;
}

describe('formatError', () => {
  it('extracts message from Error instances', () => {
    expect(formatError(new Error('boom'))).toBe('boom');
  });

  it('stringifies non-Error values', () => {
    expect(formatError('oops')).toBe('oops');
    expect(formatError(42)).toBe('42');
  });
});

describe('requireWeekOf', () => {
  it('returns weekOf when valid', () => {
    const res = mockRes();
    expect(requireWeekOf(mockReq({ weekOf: '2025-01-20' }), res)).toBe('2025-01-20');
  });

  it('returns null and sends 400 when missing', () => {
    const res = mockRes();
    expect(requireWeekOf(mockReq(), res)).toBeNull();
    expect(res._status).toBe(400);
    expect(res._body).toEqual({ error: 'Missing required query parameter: weekOf' });
  });

  it('returns null and sends 400 for invalid format', () => {
    const res = mockRes();
    expect(requireWeekOf(mockReq({ weekOf: 'not-a-date' }), res)).toBeNull();
    expect(res._status).toBe(400);
    expect(res._body).toEqual({ error: 'Invalid weekOf format. Expected YYYY-MM-DD.' });
  });
});

describe('tryStoredResponse', () => {
  const expert: StoredNarrative = {
    content: 'Expert text',
    model: 'test',
    generatedAt: '2025-01-01',
  };
  const pub: StoredNarrative = { content: 'Public text', model: 'test', generatedAt: '2025-01-01' };

  it('returns both versions plus generatedAt when no version filter', () => {
    expect(tryStoredResponse({ expert, public: pub })).toEqual({
      expert: 'Expert text',
      public: 'Public text',
      generatedAt: '2025-01-01',
    });
  });

  it('returns single version plus generatedAt when filtered', () => {
    expect(tryStoredResponse({ expert, public: pub }, 'expert')).toEqual({
      expert: 'Expert text',
      generatedAt: '2025-01-01',
    });
    expect(tryStoredResponse({ expert, public: pub }, 'public')).toEqual({
      public: 'Public text',
      generatedAt: '2025-01-01',
    });
  });

  it('returns null when requested version is missing', () => {
    expect(tryStoredResponse({ expert: null, public: pub }, 'expert')).toBeNull();
  });

  it('returns null when either version missing and no filter', () => {
    expect(tryStoredResponse({ expert, public: null })).toBeNull();
    expect(tryStoredResponse({ expert: null, public: pub })).toBeNull();
  });
});

describe('sendCached', () => {
  it('sets cache header and sends 200 JSON', () => {
    const res = mockRes();
    sendCached(res, { data: 'ok' });
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ data: 'ok' });
    expect(res._headers['Cache-Control']).toBe('public, s-maxage=3600');
  });
});

describe('parseBooleanParam (#732)', () => {
  it('accepts the common truthy and falsy spellings case-insensitively', () => {
    for (const v of ['true', '1', 'yes', 'TRUE', 'Yes']) {
      expect(parseBooleanParam(v)).toBe(true);
    }
    for (const v of ['false', '0', 'no', '', 'FALSE']) {
      expect(parseBooleanParam(v)).toBe(false);
    }
  });

  it('treats an absent parameter as false', () => {
    expect(parseBooleanParam(undefined)).toBe(false);
  });

  it('returns null on unrecognized values so callers can reject them', () => {
    expect(parseBooleanParam('maybe')).toBeNull();
    expect(parseBooleanParam('2')).toBeNull();
  });

  it('uses the last value when the parameter repeats', () => {
    expect(parseBooleanParam(['false', 'true'])).toBe(true);
  });
});
