import { describe, expect, it } from 'vitest';
import type { OperationContext } from '../../extensions/index.ts';
import { ARCHERS, PIKEMEN } from '../../tests/battle.ts';
import { applied, event } from '../../tests/fixtures.ts';
import { DONE, operationDrafts, operationScope, stepsDone } from '../index.ts';

describe('the drafts of operations', () => {
  it('keep the participants, the applied effect and the event of an operation in the operations it adds', () => {
    const subjects = { self: ARCHERS, target: PIKEMEN };
    const effect = applied(3, 'demo:blessing');
    const hit = event('acme:hit', { unit: 'pikemen-1' });
    const full = operationScope(contextWith({ effect, event: hit, subjects }));

    expect(full).toStrictEqual({ effect, event: hit, subjects });
    expect(operationScope(contextWith({ subjects }))).toStrictEqual({ subjects });
    const heal = { type: 'kernel:heal' };

    expect(operationDrafts([heal], full)[0]?.params).toStrictEqual({ ...full, op: heal });
  });

  it('give one frozen result for a step that does nothing', () => {
    expect(stepsDone([])).toBe(DONE);
    expect(Object.isFrozen(DONE.events)).toBe(true);
  });
});

function contextWith(part: Pick<OperationContext, 'effect' | 'event' | 'subjects'>): OperationContext {
  const context: unknown = part;

  return context as OperationContext;
}
