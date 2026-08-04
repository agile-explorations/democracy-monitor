import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstile } from '@/lib/services/turnstile';
import handler from '@/pages/api/feedback';

const { insertReturning, approvedRow } = vi.hoisted(() => ({
  insertReturning: vi.fn(async () => [{ id: 99 }]),
  approvedRow: {
    id: 1,
    type: 'question',
    category: null as string | null,
    message: 'approved one',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
}));

vi.mock('@/lib/utils/api-helpers', () => ({ requireDb: () => true }));
vi.mock('@/lib/utils/rate-limit', () => ({
  RATE_LIMITS: { email: {} },
  enforceRateLimit: vi.fn(async () => true),
  getClientIp: () => '1.2.3.4',
}));
vi.mock('@/lib/services/turnstile', () => ({ verifyTurnstile: vi.fn() }));
vi.mock('@/lib/services/feedback-notify', () => ({
  notifyNewFeedback: vi.fn(async () => undefined),
}));
vi.mock('@/lib/db', () => ({
  getDb: () => ({
    insert: () => ({ values: () => ({ returning: insertReturning }) }),
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: () => ({ limit: async () => [approvedRow] }) }),
      }),
    }),
  }),
}));
vi.mock('@/lib/utils/feedback-responses', () => ({
  attachResponses: async (_db: unknown, rows: unknown[]) =>
    rows.map((r) => ({ ...(r as object), responses: [] })),
}));

function buildRes() {
  const res = {
    statusCode: 0,
    body: undefined as any,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(p: unknown) {
      this.body = p;
      return this;
    },
  };
  return res as unknown as NextApiResponse & { statusCode: number; body: any };
}
const post = (body: unknown) =>
  ({ method: 'POST', headers: {}, query: {}, body }) as unknown as NextApiRequest;
const get = () => ({ method: 'GET', headers: {}, query: {} }) as unknown as NextApiRequest;

const valid = { type: 'question', message: 'Is this real?', turnstileToken: 't' };

describe('POST /api/feedback (moderation + Turnstile)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects with a bot-check error when Turnstile fails', async () => {
    vi.mocked(verifyTurnstile).mockResolvedValueOnce(false);
    const res = buildRes();
    await handler(post(valid), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/bot check/i);
  });

  it('succeeds when Turnstile passes', async () => {
    vi.mocked(verifyTurnstile).mockResolvedValueOnce(true);
    const res = buildRes();
    await handler(post(valid), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('rejects an oversize message with a validation error', async () => {
    vi.mocked(verifyTurnstile).mockResolvedValue(true);
    const res = buildRes();
    await handler(post({ ...valid, message: 'x'.repeat(5001) }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/too long/i);
  });

  it('GET returns the (approved-only) public listing with responses attached', async () => {
    const res = buildRes();
    await handler(get(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ ...approvedRow, responses: [] }]);
  });
});
