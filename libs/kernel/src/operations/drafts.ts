import type { Op } from '../content/index.ts';
import type { OperationContext, StepDone, StepDraft } from '../extensions/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import type { OperationParams, OperationScope } from './params.ts';

/**
 * The result of a step that does nothing.
 */
export const DONE: StepDone = Object.freeze({ events: Object.freeze([]), kind: 'done' });

/**
 * Returns the result of a step that adds steps and gives no events.
 */
export function stepsDone(steps: readonly StepDraft[]): StepDone {
  return steps.length === 0 ? DONE : { events: [], kind: 'done', steps };
}

/**
 * Returns what an operation runs with, so the operations it adds through {@link operationDrafts} keep its participants,
 * applied effect and event.
 */
export function operationScope({ effect, event, subjects }: OperationContext): OperationScope {
  return { subjects, ...(effect === undefined ? {} : { effect }), ...(event === undefined ? {} : { event }) };
}

/**
 * Returns the steps that run operations of content one after another with the given participants, applied effect and
 * event.
 */
export function operationDrafts(ops: readonly Op[], scope: OperationScope): ReadonlyArray<StepDraft<OperationParams>> {
  return ops.map((op) => ({ params: { ...scope, op }, type: KERNEL_STEPS.operation }));
}
