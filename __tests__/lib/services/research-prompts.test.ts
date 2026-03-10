import { describe, it, expect } from 'vitest';
import {
  buildDraftPrompt,
  buildFeedbackPrompt,
  buildRevisionPrompt,
  computeDateRange,
  formatCorpusStats,
} from '@/lib/services/research-prompts';
import type { CorpusStats } from '@/lib/services/search-research-queries';
import type { ResearchDocument } from '@/lib/services/search-service';

function makeDoc(overrides: Partial<ResearchDocument> = {}): ResearchDocument {
  return {
    id: 1,
    title: 'Test Document',
    content: 'This is test content for the document.',
    url: 'https://example.com/doc',
    publishedAt: '2026-01-15T00:00:00Z',
    sourceType: 'judicial_opinion',
    sourceOrigin: 'courtlistener',
    category: 'civilLiberties',
    cosineSimilarity: 0.55,
    finalScore: 3.2,
    documentClass: 'routine',
    p2Assessment: null,
    p2ErosionType: null,
    p2Confidence: null,
    p2Summary: null,
    ...overrides,
  };
}

function makeStats(overrides: Partial<CorpusStats> = {}): CorpusStats {
  return {
    totalMatching: 150,
    monthlyBreakdown: [
      { month: '2025-06', count: 20 },
      { month: '2025-07', count: 35 },
      { month: '2025-08', count: 45 },
      { month: '2026-01', count: 50 },
    ],
    categoryBreakdown: [
      { category: 'civilLiberties', count: 80 },
      { category: 'lawEnforcement', count: 70 },
    ],
    ...overrides,
  };
}

describe('computeDateRange', () => {
  it('returns earliest and latest dates', () => {
    const docs = [
      makeDoc({ publishedAt: '2026-02-15T00:00:00Z' }),
      makeDoc({ publishedAt: '2025-11-15T00:00:00Z' }),
    ];
    const range = computeDateRange(docs);
    expect(range.earliest).toContain('2025');
    expect(range.latest).toContain('2026');
  });

  it('returns unknown for empty docs', () => {
    expect(computeDateRange([])).toEqual({ earliest: 'unknown', latest: 'unknown' });
  });
});

describe('formatCorpusStats', () => {
  it('includes total count', () => {
    const output = formatCorpusStats(makeStats());
    expect(output).toContain('Total matching documents across full corpus: 150');
  });

  it('includes monthly breakdown', () => {
    const output = formatCorpusStats(makeStats());
    expect(output).toContain('2025-06: 20');
    expect(output).toContain('2026-01: 50');
  });

  it('includes category breakdown', () => {
    const output = formatCorpusStats(makeStats());
    expect(output).toContain('civilLiberties: 80');
    expect(output).toContain('lawEnforcement: 70');
  });
});

describe('buildDraftPrompt', () => {
  it('includes user question', () => {
    const prompt = buildDraftPrompt('test question', [makeDoc()]);
    expect(prompt).toContain('test question');
  });

  it('includes document context with Doc 1 citation', () => {
    const prompt = buildDraftPrompt('q', [makeDoc({ title: 'Important Case' })]);
    expect(prompt).toContain('[Doc 1] Important Case');
  });

  it('includes "why this might matter" instruction (rule 8)', () => {
    const prompt = buildDraftPrompt('q', [makeDoc()]);
    expect(prompt).toContain('institutional checks and balances');
    expect(prompt).toContain('conditional language');
  });

  it('includes date range transparency instruction (rule 9)', () => {
    const prompt = buildDraftPrompt('q', [makeDoc()]);
    expect(prompt).toContain('weighted toward recent publications');
    expect(prompt).toContain('corpus statistics');
  });

  it('includes recency note in coverage section', () => {
    const prompt = buildDraftPrompt('q', [makeDoc()]);
    expect(prompt).toContain('recency boost');
    expect(prompt).toContain('Older relevant documents');
  });

  it('includes P2 rule when documents have assessments', () => {
    const doc = makeDoc({ p2Assessment: 'concerning', p2ErosionType: 'formal_override' });
    const prompt = buildDraftPrompt('q', [doc]);
    expect(prompt).toContain('1 of 1 documents include prior AI assessments');
  });

  it('omits P2 rule when no documents have assessments', () => {
    const prompt = buildDraftPrompt('q', [makeDoc()]);
    expect(prompt).not.toContain('prior AI assessments');
  });

  it('includes corpus stats when provided', () => {
    const prompt = buildDraftPrompt('q', [makeDoc()], makeStats());
    expect(prompt).toContain('CORPUS STATISTICS');
    expect(prompt).toContain('Total matching documents across full corpus: 150');
  });

  it('omits corpus stats section when not provided', () => {
    const prompt = buildDraftPrompt('q', [makeDoc()]);
    expect(prompt).not.toContain('CORPUS STATISTICS');
  });

  it('includes P2 assessment in document context', () => {
    const doc = makeDoc({
      p2Assessment: 'concerning',
      p2ErosionType: 'due_process_violation',
      p2Confidence: 0.85,
      p2Summary: 'This case shows erosion patterns.',
    });
    const prompt = buildDraftPrompt('q', [doc]);
    expect(prompt).toContain('AI Assessment: concerning (erosion: due_process_violation)');
    expect(prompt).toContain('confidence: 0.85');
    expect(prompt).toContain('AI Summary: This case shows erosion patterns.');
  });

  it('includes institutional implications in expert output format', () => {
    const prompt = buildDraftPrompt('q', [makeDoc()]);
    expect(prompt).toContain('institutional implications');
  });
});

describe('buildFeedbackPrompt', () => {
  it('includes all six review criteria', () => {
    const prompt = buildFeedbackPrompt('expert', 'public', 'q', [makeDoc()]);
    expect(prompt).toContain('FACTUAL ACCURACY');
    expect(prompt).toContain('CITATION ACCURACY');
    expect(prompt).toContain('CONFIDENCE CALIBRATION');
    expect(prompt).toContain('MISSING COUNTER-ARGUMENTS');
    expect(prompt).toContain('BALANCE');
    expect(prompt).toContain('COVERAGE GAPS');
  });

  it('adds corpus statistics criterion when stats provided', () => {
    const prompt = buildFeedbackPrompt('expert', 'public', 'q', [makeDoc()], makeStats());
    expect(prompt).toContain('(g) CORPUS STATISTICS');
    expect(prompt).toContain('retrieved sample vs the full corpus');
  });

  it('omits criterion (g) when no stats', () => {
    const prompt = buildFeedbackPrompt('expert', 'public', 'q', [makeDoc()]);
    expect(prompt).not.toContain('(g) CORPUS STATISTICS');
  });
});

describe('buildRevisionPrompt', () => {
  it('references a through f without corpus stats', () => {
    const prompt = buildRevisionPrompt('expert', 'public', 'feedback', 'q', [makeDoc()]);
    expect(prompt).toContain('a through f');
  });

  it('references a through g with corpus stats', () => {
    const prompt = buildRevisionPrompt(
      'expert',
      'public',
      'feedback',
      'q',
      [makeDoc()],
      makeStats(),
    );
    expect(prompt).toContain('a through g');
  });

  it('includes corpus stats scoping instruction when stats provided', () => {
    const prompt = buildRevisionPrompt(
      'expert',
      'public',
      'feedback',
      'q',
      [makeDoc()],
      makeStats(),
    );
    expect(prompt).toContain('corpus-wide statistics are properly distinguished');
  });

  it('omits corpus stats scoping instruction without stats', () => {
    const prompt = buildRevisionPrompt('expert', 'public', 'feedback', 'q', [makeDoc()]);
    expect(prompt).not.toContain('corpus-wide statistics');
  });

  it('includes corpus stats data block when provided', () => {
    const prompt = buildRevisionPrompt(
      'expert',
      'public',
      'feedback',
      'q',
      [makeDoc()],
      makeStats(),
    );
    expect(prompt).toContain('CORPUS STATISTICS');
    expect(prompt).toContain('Total matching documents across full corpus: 150');
  });
});
