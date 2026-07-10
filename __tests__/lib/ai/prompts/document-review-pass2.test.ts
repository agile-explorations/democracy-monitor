import { describe, expect, it } from 'vitest';
import { buildActorFramework, buildPass2Prompt } from '@/lib/ai/prompts/document-review-pass2';
import type { Pass2WeekContext } from '@/lib/ai/prompts/document-review-pass2';
import { EROSION_ACTORS } from '@/lib/types/structural';

const CTX: Pass2WeekContext = {
  categoryTitle: 'Civil Liberties',
  expertDescription: 'Government actions that reduce civil liberties.',
  totalDocs: 10,
  flaggedDocs: 2,
  flagRate: 0.2,
  baselineAvgFlagRate: 0.05,
  flaggedPeers: [],
  priorWeekTotalDocs: 8,
  priorWeekFlaggedDocs: 1,
  priorWeekFlagRate: 0.125,
  priorWeekPeers: [],
  trajectory: 'rising',
};

describe('actor framework in P2 prompts (#537)', () => {
  it('every actor value appears in the framework text', () => {
    const framework = buildActorFramework();
    for (const actor of EROSION_ACTORS) {
      expect(framework).toContain(actor);
    }
  });

  it('live P2 prompts do NOT carry the actor framework (decoupled by decision, #537)', () => {
    // A 3-arm A/B measured 11.1pp prompt-attributable assessment drift, so
    // attribution runs as a separate light pass. If this test fails, someone
    // re-coupled attribution into P2 — re-run the calibration gate first.
    for (const prompt of [
      buildPass2Prompt('Doc', 'text', [], 'unclear', 'Category desc'),
      buildPass2Prompt('Doc', 'text', [], 'unclear', 'Category desc', CTX),
    ]) {
      expect(prompt).not.toContain('Erosion actor framework');
      expect(prompt).not.toContain('"erosionActor"');
    }
  });
});
