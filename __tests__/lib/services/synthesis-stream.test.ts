import { describe, expect, it } from 'vitest';
import { drainSynthesis, synthesizeWithEmptyRetry } from '@/lib/services/synthesis-stream';
import type { AICompletionResult } from '@/lib/types/ai';

const completion = (over: Partial<AICompletionResult> = {}): AICompletionResult => ({
  content: '',
  model: 'test-model',
  tokensUsed: { input: 10, output: 0 },
  latencyMs: 5,
  ...over,
});

async function* draw(chunks: string[], final: AICompletionResult) {
  for (const c of chunks) yield c;
  return final;
}

describe('drainSynthesis (#714)', () => {
  it('forwards every chunk and returns the accumulated text with the completion', async () => {
    const emitted: string[] = [];
    const out = await drainSynthesis(
      draw(['## Expert', ' answer'], completion({ content: '## Expert answer' })),
      (t) => emitted.push(t),
      () => false,
    );
    expect(emitted).toEqual(['## Expert', ' answer']);
    expect(out?.accumulated).toBe('## Expert answer');
    expect(out?.completion.model).toBe('test-model');
  });

  it('returns null and stops consuming when the client is gone', async () => {
    const emitted: string[] = [];
    let gone = false;
    const out = await drainSynthesis(
      draw(['a', 'b', 'c'], completion()),
      (t) => {
        emitted.push(t);
        gone = true;
      },
      () => gone,
    );
    expect(out).toBeNull();
    expect(emitted).toEqual(['a']);
  });
});

describe('synthesizeWithEmptyRetry (#714)', () => {
  it('redraws once when the first draw yields no text, invisibly to the reader', async () => {
    const draws: string[][] = [[], ['The answer.']];
    const emitted: string[] = [];
    const outcome = await synthesizeWithEmptyRetry(
      () => draw(draws.shift() ?? [], completion({ stopReason: 'end_turn' })),
      (t) => emitted.push(t),
      () => false,
    );
    expect(outcome.kind).toBe('ok');
    expect(emitted).toEqual(['The answer.']);
    expect(draws).toEqual([]);
  });

  it('reports an empty outcome with the stop reason after two empty draws', async () => {
    let started = 0;
    const outcome = await synthesizeWithEmptyRetry(
      () => {
        started++;
        return draw([], completion({ stopReason: 'refusal' }));
      },
      () => undefined,
      () => false,
    );
    expect(outcome).toEqual({ kind: 'empty', draws: 2, stopReason: 'refusal' });
    expect(started).toBe(2);
  });

  it('treats whitespace-only output as empty', async () => {
    const outcome = await synthesizeWithEmptyRetry(
      () => draw(['  \n'], completion()),
      () => undefined,
      () => false,
    );
    expect(outcome.kind).toBe('empty');
  });

  it('does not redraw when the reader left', async () => {
    let started = 0;
    const outcome = await synthesizeWithEmptyRetry(
      () => {
        started++;
        return draw(['x'], completion());
      },
      () => undefined,
      () => true,
    );
    expect(outcome).toEqual({ kind: 'aborted' });
    expect(started).toBe(1);
  });

  it('never redraws a draw that produced text', async () => {
    let started = 0;
    const outcome = await synthesizeWithEmptyRetry(
      () => {
        started++;
        return draw(['ok'], completion());
      },
      () => undefined,
      () => false,
    );
    expect(outcome.kind).toBe('ok');
    expect(started).toBe(1);
  });
});
