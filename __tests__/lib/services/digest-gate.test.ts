import { describe, expect, it } from 'vitest';
import { evaluateDigestGate } from '@/lib/services/digest-gate';
import type { DigestGateInput } from '@/lib/services/digest-gate';

const clean: DigestGateInput = {
  dataIntegrity: 'high',
  graphErrorViolations: 0,
  unresolvedAggregateFailures: 0,
};

describe('evaluateDigestGate', () => {
  it('sends when all quality signals are clean', () => {
    expect(evaluateDigestGate(clean)).toEqual({ send: true, holdReasons: [] });
  });

  it('moderate integrity still sends (transient degradation)', () => {
    expect(evaluateDigestGate({ ...clean, dataIntegrity: 'moderate' }).send).toBe(true);
  });

  it.each(['low', 'critical'] as const)('holds on %s data integrity', (level) => {
    const gate = evaluateDigestGate({ ...clean, dataIntegrity: level });
    expect(gate.send).toBe(false);
    expect(gate.holdReasons[0]).toContain(level);
  });

  it('holds when no source health data was collected', () => {
    const gate = evaluateDigestGate({ ...clean, dataIntegrity: null });
    expect(gate.send).toBe(false);
    expect(gate.holdReasons[0]).toContain('no source health data');
  });

  it('holds on error-severity graph violations', () => {
    const gate = evaluateDigestGate({ ...clean, graphErrorViolations: 3 });
    expect(gate.send).toBe(false);
    expect(gate.holdReasons[0]).toContain('derivation-graph');
  });

  it('holds on unresolved aggregate failures', () => {
    const gate = evaluateDigestGate({ ...clean, unresolvedAggregateFailures: 2 });
    expect(gate.send).toBe(false);
    expect(gate.holdReasons[0]).toContain('aggregate');
  });

  it('accumulates every applicable hold reason', () => {
    const gate = evaluateDigestGate({
      dataIntegrity: 'critical',
      graphErrorViolations: 1,
      unresolvedAggregateFailures: 1,
    });
    expect(gate.send).toBe(false);
    expect(gate.holdReasons).toHaveLength(3);
  });
});
