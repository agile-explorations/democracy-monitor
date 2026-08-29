import { describe, expect, it } from 'vitest';
import { ASSESSMENT_LABELS } from '@/lib/data/assessment-labels';
import {
  buildPacketMarkdown,
  cohenKappa,
  decisionsTemplate,
  isDeparture,
  ReaderDecisionsFileSchema,
  renderReaderAudit,
  scoreReaders,
  stratifiedSampleSpec,
} from '@/lib/services/reader-audit';
import type { ModelVerdict, PacketItem, ReaderDecisionsFile } from '@/lib/services/reader-audit';

const item = (
  id: number,
  verdict: PacketItem['verdict'],
  era: PacketItem['era'] = 'current',
): PacketItem => ({
  id,
  era,
  category: 'civilService',
  weekOf: '2026-03-30',
  title: `Document ${id}`,
  url: `https://example.gov/${id}`,
  sourceOrigin: 'federal_register',
  sourceType: 'Rule',
  publishedAt: '2026-03-28',
  excerpt: `Body of document ${id}.`,
  verdict,
  erosionType: 'formal_override',
  confidence: 0.8,
  reasoning: `Reasoning for ${id}, long enough to count.`,
  citedPassages: [`passage ${id}`],
  counterArguments: [],
  comparativeContext: null,
  promptVersion: 'p2-2026-08-13',
});

describe('reader audit (#816) — sampling and packet', () => {
  it('splits the sample current/baseline 70/30 by default and honours an override', () => {
    expect(stratifiedSampleSpec(50)).toEqual({ current: 35, baseline: 15 });
    expect(stratifiedSampleSpec(50, 40)).toEqual({ current: 40, baseline: 10 });
    expect(stratifiedSampleSpec(10, 99)).toEqual({ current: 10, baseline: 0 });
  });

  it("writes every item with its title and the reviewer's verdict label into the packet", () => {
    const items = [item(1, 'clearly_concerning'), item(2, 'routine', 'baseline')];
    const md = buildPacketMarkdown(items, '2026-Q3');
    for (const it of items) {
      expect(md).toContain(it.title);
      expect(md).toContain(ASSESSMENT_LABELS[it.verdict]);
      expect(md).toContain(`(stored as \`${it.verdict}\`)`);
      expect(md).toContain(it.reasoning);
    }
    expect(md).toContain('> passage 1');
  });

  it('produces a decisions template that validates and has one undecided entry per item', () => {
    const t = decisionsTemplate([item(1, 'routine'), item(2, 'potentially_concerning')], '2026-Q3');
    expect(ReaderDecisionsFileSchema.parse(t)).toEqual(t);
    expect(t.items.map((d) => d.id)).toEqual([1, 2]);
    expect(t.items.every((d) => d.agree === null && d.verdict === null)).toBe(true);
    expect(() =>
      ReaderDecisionsFileSchema.parse({ ...t, items: [{ id: 1, agree: 'yes' }] }),
    ).toThrow();
  });
});

describe("Cohen's kappa", () => {
  it('is 1 on perfect agreement, 0 at chance, and matches a worked 2x2 case', () => {
    expect(cohenKappa(['a', 'b', 'a'], ['a', 'b', 'a'])).toBe(1);
    // Rater A always says 'a'; rater B is split — observed 0.5, expected 0.5 → 0.
    expect(cohenKappa(['a', 'a', 'a', 'a'], ['a', 'b', 'a', 'b'])).toBe(0);
    // Classic example: 20 yes/yes, 5 yes/no, 10 no/yes, 15 no/no → κ = 0.4.
    const a = [...Array(25).fill('yes'), ...Array(25).fill('no')];
    const b = [
      ...Array(20).fill('yes'),
      ...Array(5).fill('no'),
      ...Array(10).fill('yes'),
      ...Array(15).fill('no'),
    ];
    expect(cohenKappa(a, b)).toBeCloseTo(0.4, 6);
    expect(cohenKappa([], [])).toBe(0);
    expect(() => cohenKappa(['a'], [])).toThrow();
  });

  it('draws the departure line between possible/clear and the rest', () => {
    expect(isDeparture('clearly_concerning')).toBe(true);
    expect(isDeparture('potentially_concerning')).toBe(true);
    expect(isDeparture('novel_not_concerning')).toBe(false);
    expect(isDeparture('routine')).toBe(false);
  });
});

describe('scoreReaders', () => {
  const model: ModelVerdict[] = [
    { id: 1, era: 'current', verdict: 'clearly_concerning' },
    { id: 2, era: 'current', verdict: 'routine' },
    { id: 3, era: 'baseline', verdict: 'potentially_concerning' },
    { id: 4, era: 'baseline', verdict: 'novel_not_concerning' },
  ];
  const file = (reader: string, items: ReaderDecisionsFile['items']): ReaderDecisionsFile => ({
    reader,
    seed: '2026-Q3',
    items,
  });
  const A = file('Reader A', [
    { id: 1, agree: true, verdict: null, reasoning: '' },
    { id: 2, agree: true, verdict: null, reasoning: '' },
    { id: 3, agree: false, verdict: 'routine', reasoning: 'A: this is a routine notice' },
    { id: 4, agree: true, verdict: null, reasoning: '' },
  ]);
  const B = file('Reader B', [
    { id: 1, agree: true, verdict: null, reasoning: '' },
    { id: 2, agree: false, verdict: 'potentially_concerning', reasoning: 'B: sees a departure' },
    {
      id: 3,
      agree: false,
      verdict: 'novel_not_concerning',
      reasoning: 'B: novel but within baseline',
    },
    { id: 4, agree: true, verdict: null, reasoning: '' },
  ]);

  it('scores agreement with the reviewer, between readers, per era, and lists shared disagreements', () => {
    const r = scoreReaders(model, A, B, new Date('2026-09-01T00:00:00Z'));
    expect(r.sample).toBe(4);
    expect(r.readers[0]).toMatchObject({
      reader: 'Reader A',
      decided: 4,
      agreeVerdict: 0.75,
      agreeDeparture: 0.75,
    });
    expect(r.readers[1]).toMatchObject({
      reader: 'Reader B',
      decided: 4,
      agreeVerdict: 0.5,
      agreeDeparture: 0.5,
    });
    // Item 3: both readers left the departure line; item 2: only B did.
    expect(r.interReader.agreeVerdict).toBe(0.5);
    expect(r.byEra.current.items).toBe(2);
    expect(r.byEra.baseline.readerAgreeVerdict).toEqual([0.5, 0.5]);
    expect(r.bothDisagree).toHaveLength(1);
    expect(r.bothDisagree[0]).toMatchObject({ id: 3, model: 'potentially_concerning' });
    expect(r.bothDisagree[0].readers.map((x) => x.verdict)).toEqual([
      'routine',
      'novel_not_concerning',
    ]);
    expect(r.scoredAt).toBe('2026-09-01T00:00:00.000Z');
    expect(renderReaderAudit(r)[0]).toContain('4 readings');
  });

  it('ignores items either reader left undecided', () => {
    const partial = file('B', [{ id: 1, agree: true, verdict: null, reasoning: '' }]);
    const r = scoreReaders(model, A, partial);
    expect(r.readers[0].decided).toBe(1);
    expect(r.readers[0].agreeVerdict).toBe(1);
  });
});
