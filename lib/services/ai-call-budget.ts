/**
 * Per-process AI call budget (#564). The #563 incident showed a wrong cost
 * estimate can burn 10x the quote before anyone looks: duplicate P2 calls ran
 * for hours because nothing treated spend as a gated quantity. This module
 * makes the runbook precheck estimate an ENFORCED budget: callers configure a
 * cap (estimate × safety factor), the assessment choke points record every
 * model call, and the next call past the cap throws — long runs exit cleanly
 * (all review pipelines are resumable) instead of running to completion on a
 * bad estimate.
 *
 * Uncapped by default: the weekly snapshot is bounded by week volume and sets
 * no cap; backfill CLIs pass --max-calls.
 */

export class AiCallBudgetExceededError extends Error {
  constructor(
    public readonly calls: number,
    public readonly cap: number,
  ) {
    super(
      `AI call budget exhausted: ${calls} calls made, cap ${cap}. ` +
        'The precheck estimate was wrong — review it before resuming.',
    );
    this.name = 'AiCallBudgetExceededError';
  }
}

let callCount = 0;
let callCap: number | null = null;

/** Set (or clear, with null) the cap and reset the counter. */
export function configureAiCallBudget(cap: number | null): void {
  callCap = cap;
  callCount = 0;
}

/** Record one model call. Call immediately before each provider request. */
export function recordAiCall(): void {
  callCount++;
}

export function getAiCallCount(): number {
  return callCount;
}

/**
 * Throw when the budget is exhausted. Call BEFORE the per-document try/catch
 * in assessment functions — those catches swallow errors per doc, and a
 * budget stop must propagate, not degrade into a skipped document.
 */
export function assertAiCallBudget(): void {
  if (callCap !== null && callCount >= callCap) {
    throw new AiCallBudgetExceededError(callCount, callCap);
  }
}
