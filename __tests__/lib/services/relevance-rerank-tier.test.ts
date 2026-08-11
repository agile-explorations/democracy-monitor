import { describe, expect, it } from 'vitest';
import { rerankTierBalanced } from '@/lib/services/relevance-rerank';
import type { ResearchDocument } from '@/lib/services/search-service';

function doc(id: number, tier: 'action' | 'discussion'): ResearchDocument {
  return {
    id,
    title: `Doc ${id}`,
    content: null,
    url: `https://example.gov/${id}`,
    publishedAt: '2025-06-01',
    sourceType: tier === 'action' ? 'executive_order' : 'floor_speech',
    tier,
    sourceOrigin: 'crec',
    caseId: null,
    category: 'civilService',
    cosineSimilarity: 0.5,
    finalScore: null,
    documentClass: null,
    p2Assessment: null,
    p2ErosionType: null,
    p2Confidence: null,
    p2Summary: null,
  };
}

// No AI key in the test environment → rankAll falls back to input order,
// making the tier composition deterministic and testable.
describe('rerankTierBalanced (#707)', () => {
  it('cannot wipe a tier out of the kept slots', async () => {
    const docs = [
      ...Array.from({ length: 20 }, (_, i) => doc(i + 1, 'action')),
      ...Array.from({ length: 5 }, (_, i) => doc(100 + i, 'discussion')),
    ];
    const kept = await rerankTierBalanced('q', docs, 10);
    const discussion = kept.filter((d) => d.tier === 'discussion');
    expect(kept).toHaveLength(10);
    // ACTION_TIER_SHARE=0.6 → 6 action + 4 discussion targets.
    expect(discussion).toHaveLength(4);
  });

  it('backfills from the other tier when one runs short', async () => {
    const docs = [
      ...Array.from({ length: 3 }, (_, i) => doc(i + 1, 'action')),
      ...Array.from({ length: 20 }, (_, i) => doc(100 + i, 'discussion')),
    ];
    const kept = await rerankTierBalanced('q', docs, 10);
    expect(kept).toHaveLength(10);
    expect(kept.filter((d) => d.tier === 'action')).toHaveLength(3);
    expect(kept.filter((d) => d.tier === 'discussion')).toHaveLength(7);
  });

  it('applies tier composition even when nothing needs cutting', async () => {
    const docs = [doc(1, 'action'), doc(2, 'discussion'), doc(3, 'action')];
    const kept = await rerankTierBalanced('q', docs, 10);
    expect(kept).toHaveLength(3);
    expect(kept.filter((d) => d.tier === 'discussion')).toHaveLength(1);
  });
});
