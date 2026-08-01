import { describe, expect, it } from 'vitest';
import { resolveDbSsl } from '@/lib/db/ssl';

describe('resolveDbSsl', () => {
  it('verifies external Render Postgres endpoints (cert + hostname)', () => {
    expect(resolveDbSsl('postgres://u:p@dpg-abc123-a.oregon-postgres.render.com:5432/db')).toEqual({
      rejectUnauthorized: true,
    });
    // sslmode in the URL must not weaken the explicit verification
    expect(
      resolveDbSsl('postgres://u:p@dpg-abc123-a.virginia-postgres.render.com/db?sslmode=require'),
    ).toEqual({ rejectUnauthorized: true });
  });

  it('leaves internal Render (bare private hostname) untouched', () => {
    expect(resolveDbSsl('postgres://u:p@dpg-abc123-a/db')).toBeUndefined();
  });

  it('leaves local dev untouched', () => {
    expect(resolveDbSsl('postgres://u:p@localhost:5432/democracy_monitor')).toBeUndefined();
    expect(resolveDbSsl('postgres://u:p@127.0.0.1:5432/db')).toBeUndefined();
  });

  it('returns undefined for an unparseable connection string', () => {
    expect(resolveDbSsl('not-a-connection-string')).toBeUndefined();
    expect(resolveDbSsl('')).toBeUndefined();
  });
});
