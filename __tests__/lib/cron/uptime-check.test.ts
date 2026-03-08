import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runUptimeCheck } from '@/lib/cron/uptime-check';
import { checkAllSites, recordResults } from '@/lib/services/uptime-service';
import type { UptimeResult } from '@/lib/types/resilience';

vi.mock('@/lib/services/uptime-service', () => ({
  checkAllSites: vi.fn(),
  recordResults: vi.fn(),
}));

const mockCheckAllSites = vi.mocked(checkAllSites);
const mockRecordResults = vi.mocked(recordResults);

function makeResult(hostname: string, isUp: boolean): UptimeResult {
  return {
    hostname,
    status: isUp ? 200 : 0,
    responseTimeMs: isUp ? 150 : null,
    isUp,
    checkedAt: new Date().toISOString(),
    error: isUp ? undefined : 'Connection refused',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runUptimeCheck', () => {
  it('completes successfully when all sites are up', async () => {
    mockCheckAllSites.mockResolvedValue([makeResult('example.com', true)]);
    mockRecordResults.mockResolvedValue(undefined);

    await expect(runUptimeCheck()).resolves.toBeUndefined();
    expect(mockCheckAllSites).toHaveBeenCalledOnce();
    expect(mockRecordResults).toHaveBeenCalledOnce();
  });

  it('propagates errors from checkAllSites', async () => {
    mockCheckAllSites.mockRejectedValue(new Error('Network failure'));

    await expect(runUptimeCheck()).rejects.toThrow('Network failure');
  });

  it('propagates errors from recordResults', async () => {
    mockCheckAllSites.mockResolvedValue([makeResult('example.com', true)]);
    mockRecordResults.mockRejectedValue(new Error('DB write failed'));

    await expect(runUptimeCheck()).rejects.toThrow('DB write failed');
  });

  it('completes successfully with mix of up and down sites', async () => {
    const results = [
      makeResult('example.com', true),
      makeResult('down.example.com', false),
      makeResult('also-up.example.com', true),
    ];
    mockCheckAllSites.mockResolvedValue(results);
    mockRecordResults.mockResolvedValue(undefined);

    await expect(runUptimeCheck()).resolves.toBeUndefined();
  });

  it('completes successfully with empty results', async () => {
    mockCheckAllSites.mockResolvedValue([]);
    mockRecordResults.mockResolvedValue(undefined);

    await expect(runUptimeCheck()).resolves.toBeUndefined();
  });

  it('completes when down site has no error message', async () => {
    const downWithStatus: UptimeResult = {
      hostname: 'noerror.example.com',
      status: 503,
      responseTimeMs: null,
      isUp: false,
      checkedAt: new Date().toISOString(),
      // No error property — exercises the "status 503" fallback branch
    };
    mockCheckAllSites.mockResolvedValue([downWithStatus]);
    mockRecordResults.mockResolvedValue(undefined);

    // Should complete without error even when error field is missing
    await expect(runUptimeCheck()).resolves.toBeUndefined();
  });
});
