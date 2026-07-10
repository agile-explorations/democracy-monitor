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

  it('baseline (no-context) prompt carries the actor framework and schema field', () => {
    const prompt = buildPass2Prompt('Doc', 'text', [], 'unclear', 'Category desc');
    expect(prompt).toContain('Erosion actor framework:');
    expect(prompt).toContain('"erosionActor"');
  });

  it('contextual prompt carries the actor framework and schema field', () => {
    const prompt = buildPass2Prompt('Doc', 'text', [], 'unclear', 'Category desc', CTX);
    expect(prompt).toContain('Erosion actor framework:');
    expect(prompt).toContain('"erosionActor"');
    // attribution must be framed as non-load-bearing
    expect(prompt).toContain('does not change how you assess concern');
  });
});
