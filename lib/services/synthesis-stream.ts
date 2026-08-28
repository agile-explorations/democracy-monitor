/**
 * Streamed-synthesis draining with an empty-draw guard (#714).
 *
 * A provider stream can complete "successfully" with zero text deltas (a
 * stop before any text, a max_tokens stop on nothing, a refusal block). The
 * stream route used to forward that as a normal `done`, so the reader saw
 * documents and a blank answer, the browser burned a SECOND full Sonnet
 * stream retrying, and eval captures scored a 0-char answer as a synthesis
 * gap. Because nothing was emitted, an empty draw can be retried invisibly
 * inside the same request; only a second empty draw becomes an error.
 *
 * Pure over an injected generator — unit-tested without a provider.
 */

import type { AICompletionResult } from '@/lib/types/ai';

export type SynthesisStream = AsyncGenerator<string, AICompletionResult>;

export type SynthesisOutcome =
  | { kind: 'ok'; accumulated: string; completion: AICompletionResult }
  | { kind: 'aborted' }
  | { kind: 'empty'; draws: number; stopReason?: string | null };

/** Draws per request before giving up: one invisible retry. */
export const MAX_SYNTHESIS_DRAWS = 2;

/** Forward every delta to `emit` until the stream completes; null when the
 *  client left mid-stream (the generator is closed so the model call aborts). */
export async function drainSynthesis(
  stream: SynthesisStream,
  emit: (text: string) => void,
  clientGone: () => boolean,
): Promise<{ accumulated: string; completion: AICompletionResult } | null> {
  let accumulated = '';
  let result = await stream.next();
  while (!result.done) {
    if (clientGone()) {
      await stream.return(undefined as never);
      return null;
    }
    accumulated += result.value;
    emit(result.value);
    result = await stream.next();
  }
  return { accumulated, completion: result.value };
}

/** Drain a fresh stream from `start()`; redraw once when a draw yields no
 *  text at all (nothing was emitted, so the reader never sees the retry). */
export async function synthesizeWithEmptyRetry(
  start: () => SynthesisStream,
  emit: (text: string) => void,
  clientGone: () => boolean,
  maxDraws: number = MAX_SYNTHESIS_DRAWS,
): Promise<SynthesisOutcome> {
  let stopReason: string | null | undefined;
  for (let draw = 1; draw <= maxDraws; draw++) {
    const drained = await drainSynthesis(start(), emit, clientGone);
    if (!drained) return { kind: 'aborted' };
    if (drained.accumulated.trim().length > 0) return { kind: 'ok', ...drained };
    stopReason = drained.completion.stopReason;
    console.warn(
      `[synthesis] empty draw ${draw}/${maxDraws} (stop_reason=${stopReason ?? 'unknown'}, output_tokens=${drained.completion.tokensUsed.output})`,
    );
  }
  return { kind: 'empty', draws: maxDraws, stopReason };
}
