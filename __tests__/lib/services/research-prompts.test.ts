import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import {
  ACTION_EXCERPT_CHARS,
  buildDraftPrompt,
  buildFeedbackPrompt,
  buildRevisionPrompt,
  computeDateRange,
  formatCorpusStats,
  buildSinglePassPrompt,
} from '@/lib/services/research-prompts';
import { RESEARCH_CONTENT_FETCH_CHARS } from '@/lib/services/research-retrieval';
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
    tier: 'action',
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
    expect(prompt).toContain('[Doc 1 | ACTION] Important Case');
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
    expect(prompt).toContain("1 of 1 documents include classifications from Democracy Monitor's");
  });

  it('omits P2 rule when no documents have assessments', () => {
    const prompt = buildDraftPrompt('q', [makeDoc()]);
    expect(prompt).not.toContain('automated document review');
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
    expect(prompt).toContain(
      'AI Assessment (annotation): concerning (erosion: due_process_violation)',
    );
    expect(prompt).toContain('confidence: 0.85');
    expect(prompt).toContain(
      'AI Review Note (annotation — NOT document text): This case shows erosion patterns.',
    );
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
    expect(prompt).toContain('corpus-wide statistics from retrieved sample');
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

describe('buildSinglePassPrompt (#552 tier contract)', () => {
  it('tags docs with their tier and applies per-tier excerpt budgets', () => {
    const longText = 'Z'.repeat(ACTION_EXCERPT_CHARS + 500);
    const action = makeDoc({ id: 1, title: 'An Opinion', content: longText });
    const discussion = makeDoc({
      id: 2,
      title: 'A Speech',
      sourceType: 'floor_speech',
      tier: 'discussion',
      content: longText,
    });
    const prompt = buildSinglePassPrompt('q', [action, discussion]);

    expect(prompt).toContain('[Doc 1 | ACTION] An Opinion');
    expect(prompt).toContain('[Doc 2 | DISCUSSION] A Speech');

    // Per-tier budgets: action excerpt cut at ACTION_EXCERPT_CHARS, discussion at 1200
    const actionExcerpt = prompt.split('[Doc 1 | ACTION]')[1].split('[Doc 2')[0];
    const discussionExcerpt = prompt.split('[Doc 2 | DISCUSSION]')[1];
    expect((actionExcerpt.match(/Z/g) ?? []).length).toBe(ACTION_EXCERPT_CHARS);
    expect((discussionExcerpt.match(/Z/g) ?? []).length).toBe(1200);
  });

  it('includes the tier grounding rule and checklist item', () => {
    const prompt = buildSinglePassPrompt('q', [makeDoc()]);
    expect(prompt).toContain('Ground claims about government actions in ACTION documents');
    expect(prompt).toContain('TIER GROUNDING');
  });

  it('keeps the streaming section headers the client parser depends on', () => {
    const prompt = buildSinglePassPrompt('q', [makeDoc()]);
    expect(prompt).toContain('=== EXPERT');
    expect(prompt).toContain('=== PUBLIC');
    expect(prompt).toContain('=== RELATED QUESTIONS');
  });
});

describe('retrieval note (#712)', () => {
  const docs = [makeDoc()];
  it('describes hybrid retrieval with the searched terms and scoping guard', () => {
    const prompt = buildSinglePassPrompt('q', docs, null, [
      { phrase: '287g agreements', matches: 12 },
      { phrase: 'H.R. 3005', matches: 0 },
    ]);
    expect(prompt).toContain('Retrieval was hybrid');
    expect(prompt).toContain('287g agreements (12 corpus matches) | H.R. 3005');
    expect(prompt).toContain('never as absence from the corpus');
    expect(prompt).toContain('never as vector similarity');
    // No contradictory vector-only description may coexist (#712).
    expect(prompt).not.toContain('Note: Retrieval uses vector similarity');
  });

  it('falls back to the vector-only description without searched terms', () => {
    const prompt = buildSinglePassPrompt('q', docs, null);
    expect(prompt).toContain('Note: Retrieval uses vector similarity');
    expect(prompt).not.toContain('Retrieval was hybrid');
  });
});

describe('source-coverage manifest (#737)', () => {
  it('names ingested and non-ingested source classes in every prompt', () => {
    const prompt = buildSinglePassPrompt('q', [makeDoc()], null);
    expect(prompt).toContain('Source coverage:');
    expect(prompt).toContain('NOT ingested: OMB/OPM memoranda');
    // GAO moved from NOT-ingested to ingested in #739.
    expect(prompt).toContain('GAO');
    expect(prompt).toContain('reports and testimonies');
    expect(prompt).not.toMatch(/NOT ingested:[^.]*GAO/);
  });
});

describe('excerpt budget coupling (#736)', () => {
  it('keeps the prompt excerpt budget within the SQL fetch cap', () => {
    expect(ACTION_EXCERPT_CHARS).toBeLessThanOrEqual(RESEARCH_CONTENT_FETCH_CHARS);
  });
});

describe('enumeration instruction (#751)', () => {
  beforeAll(() => {
    process.env.ENUMERATION_MODE = 'on';
  });
  afterAll(() => {
    delete process.env.ENUMERATION_MODE;
  });

  it('adds the enumeration addendum for enumeration questions', () => {
    const prompt = buildSinglePassPrompt(
      'What executive orders address collective bargaining?',
      [makeDoc()],
      null,
    );
    expect(prompt).toContain('comprehensive enumeration');
    expect(prompt).toContain('court cases by');
  });

  it('omits the addendum for analytical questions', () => {
    const prompt = buildSinglePassPrompt('Is the impoundment of funds legal?', [makeDoc()], null);
    expect(prompt).not.toContain('comprehensive enumeration');
  });
});
