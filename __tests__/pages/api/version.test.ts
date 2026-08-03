import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, describe, expect, it } from 'vitest';
import handler from '@/pages/api/version';

function buildRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
      return this;
    },
  };
  return res as unknown as NextApiResponse & {
    statusCode: number;
    body: any;
    headers: Record<string, string>;
  };
}
const req = (method: string) => ({ method, headers: {}, query: {} }) as unknown as NextApiRequest;

describe('/api/version (#664)', () => {
  afterEach(() => {
    delete process.env.RENDER_GIT_COMMIT;
    delete process.env.RENDER_GIT_BRANCH;
  });

  it('returns the running commit from RENDER_GIT_COMMIT, uncached', () => {
    process.env.RENDER_GIT_COMMIT = 'abc123def456';
    process.env.RENDER_GIT_BRANCH = 'main';
    const res = buildRes();
    handler(req('GET'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ commit: 'abc123def456', branch: 'main' });
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it("reports 'unknown' when RENDER_GIT_COMMIT is unset (local/dev)", () => {
    const res = buildRes();
    handler(req('GET'), res);
    expect(res.body).toEqual({ commit: 'unknown', branch: null });
  });

  it('rejects non-GET methods', () => {
    const res = buildRes();
    handler(req('POST'), res);
    expect(res.statusCode).toBe(405);
  });
});
