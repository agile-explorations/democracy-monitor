import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkHelp } from '@/lib/utils/cli-help';

describe('checkHelp', () => {
  const logged: string[] = [];
  let exitCode: number | null = null;

  function captureEffects() {
    logged.length = 0;
    exitCode = null;
    vi.spyOn(console, 'log').mockImplementation((msg) => {
      logged.push(String(msg));
    });
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exitCode = code ?? 0;
    }) as never);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['--help', '-h'])('prints usage and exits 0 on %s', (flag) => {
    captureEffects();
    checkHelp([flag], 'Usage: pnpm example');
    expect(logged).toEqual(['Usage: pnpm example']);
    expect(exitCode).toBe(0);
  });

  it('produces no output and keeps running when no help flag is present', () => {
    captureEffects();
    checkHelp(['--dry-run'], 'usage');
    expect(logged).toEqual([]);
    expect(exitCode).toBeNull();
  });
});
