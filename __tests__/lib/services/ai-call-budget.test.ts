import { beforeEach, describe, expect, it } from 'vitest';
import {
  AiCallBudgetExceededError,
  assertAiCallBudget,
  configureAiCallBudget,
  getAiCallCount,
  recordAiCall,
} from '@/lib/services/ai-call-budget';

describe('ai-call-budget (#564)', () => {
  beforeEach(() => configureAiCallBudget(null));

  it('is uncapped by default: never throws, still counts', () => {
    for (let i = 0; i < 1000; i++) {
      assertAiCallBudget();
      recordAiCall();
    }
    expect(getAiCallCount()).toBe(1000);
  });

  it('throws once the cap is reached', () => {
    configureAiCallBudget(3);
    for (let i = 0; i < 3; i++) {
      assertAiCallBudget();
      recordAiCall();
    }
    expect(() => assertAiCallBudget()).toThrow(AiCallBudgetExceededError);
  });

  it('reports calls and cap in the error', () => {
    configureAiCallBudget(2);
    recordAiCall();
    recordAiCall();
    try {
      assertAiCallBudget();
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as AiCallBudgetExceededError;
      expect(e.calls).toBe(2);
      expect(e.cap).toBe(2);
      expect(e.message).toContain('review it before resuming');
    }
  });

  it('reconfiguring resets the counter', () => {
    configureAiCallBudget(1);
    recordAiCall();
    configureAiCallBudget(1);
    expect(getAiCallCount()).toBe(0);
    expect(() => assertAiCallBudget()).not.toThrow();
  });
});
