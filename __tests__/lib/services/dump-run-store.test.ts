import { describe, expect, it } from 'vitest';
import { summarizeDumpRun } from '@/lib/services/dump-run-store';

const base = {
  startedAt: new Date('2026-08-31T05:00:00Z'),
  durationS: 1200,
  error: null,
};

describe('summarizeDumpRun (#828) — dump_runs → health vocabulary', () => {
  it('maps a completed run to success', () => {
    const s = summarizeDumpRun({
      ...base,
      status: 'complete',
      heartbeatAt: new Date('2026-08-31T05:20:00Z'),
    });
    expect(s).toMatchObject({ status: 'success', stale: false, durationMs: 1_200_000 });
  });

  it('maps a failed run with its error', () => {
    const s = summarizeDumpRun({
      ...base,
      status: 'failed',
      error: 'pg_dump exited 1',
      heartbeatAt: new Date('2026-08-31T05:20:00Z'),
    });
    expect(s).toMatchObject({ status: 'failed', errors: ['pg_dump exited 1'] });
  });

  it('treats a fresh-heartbeat running row as in progress', () => {
    const s = summarizeDumpRun({
      ...base,
      status: 'running',
      durationS: null,
      heartbeatAt: new Date(),
    });
    expect(s).toMatchObject({ status: 'running', stale: false, durationMs: null });
  });

  it('treats a silent-heartbeat running row as a dead runner', () => {
    const s = summarizeDumpRun({
      ...base,
      status: 'running',
      heartbeatAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    expect(s).toMatchObject({ status: 'failed', stale: true });
    expect(s.errors).toEqual(['runner died (stale heartbeat)']);
  });
});
