import { describe, expect, it } from 'vitest';
import { planTransition } from '@/scripts/dev-env';

describe('planTransition (#791)', () => {
  it('resumes the database before the web service and skips what already runs', () => {
    expect(planTransition('resume', { serviceSuspended: true, postgresSuspended: true })).toEqual([
      { kind: 'postgres', op: 'resume' },
      { kind: 'service', op: 'resume' },
    ]);
    expect(planTransition('resume', { serviceSuspended: true, postgresSuspended: false })).toEqual([
      { kind: 'service', op: 'resume' },
    ]);
    expect(planTransition('resume', { serviceSuspended: false, postgresSuspended: false })).toEqual(
      [],
    );
  });

  it('suspends the web service before the database and skips what is already suspended', () => {
    expect(
      planTransition('suspend', { serviceSuspended: false, postgresSuspended: false }),
    ).toEqual([
      { kind: 'service', op: 'suspend' },
      { kind: 'postgres', op: 'suspend' },
    ]);
    expect(planTransition('suspend', { serviceSuspended: true, postgresSuspended: false })).toEqual(
      [{ kind: 'postgres', op: 'suspend' }],
    );
  });
});
