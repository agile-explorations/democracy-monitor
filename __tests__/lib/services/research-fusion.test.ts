import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runKeyedArms } from '@/lib/services/arm-cache';
import { ARM_MATCH_CEILING, runArmsForAliases } from '@/lib/services/research-fusion';

vi.mock('@/lib/services/arm-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/arm-cache')>();
  return { ...actual, runKeyedArms: vi.fn() };
});
const mockRunKeyedArms = vi.mocked(runKeyedArms);

/** The mock echoes each EXECUTED arm's phrase back as a result row, so an
 *  alias that was never executed is observable as an empty arm in the
 *  output — behavior, not call-argument inspection. */
function echoExecutedArms() {
  mockRunKeyedArms.mockImplementation(async (arms) =>
    arms.map((a, i) => [{ id: 100 + i, source_type: 'Rule', matched_alias: a.phrase }]),
  );
}

describe('runArmsForAliases arm admission ceiling (#782 WO-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    echoExecutedArms();
  });

  it('over-ceiling aliases yield empty arms; output stays input-aligned', async () => {
    const arms = await runArmsForAliases([
      { phrase: 'Schedule F', matches: 273 },
      { phrase: 'Director Comey', matches: ARM_MATCH_CEILING + 1 },
      { phrase: 'EO 13957', matches: 73 },
    ]);
    expect(arms).toHaveLength(3);
    expect(arms[0].items.map((i) => i.matchedAlias)).toEqual(['Schedule F']);
    expect(arms[1].items).toEqual([]);
    expect(arms[2].items.map((i) => i.matchedAlias)).toEqual(['EO 13957']);
  });

  it('an at-ceiling alias still executes (ceiling is inclusive)', async () => {
    const arms = await runArmsForAliases([{ phrase: 'borderline', matches: ARM_MATCH_CEILING }]);
    expect(arms[0].items.map((i) => i.matchedAlias)).toEqual(['borderline']);
  });
});
