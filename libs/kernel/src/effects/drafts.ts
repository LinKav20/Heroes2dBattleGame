import type { Op } from '../content/index.ts';
import type { StepDone, StepDraft } from '../extensions/index.ts';
import { KERNEL_STEPS } from './names.ts';
import type {
  ApplicationParams,
  OperationParams,
  OperationScope,
  RemovalParams,
  TickParams,
  TurnParams,
} from './params.ts';

/**
 * The result of a step that does nothing.
 */
export const DONE: StepDone = Object.freeze({ events: [], kind: 'done' });

/**
 * Returns the result of a step that adds steps and gives no events.
 */
export function stepsDone(steps: readonly StepDraft[]): StepDone {
  return steps.length === 0 ? DONE : { events: [], kind: 'done', steps };
}

/**
 * Returns the steps that run operations of content one after another with the given participants, applied effect and
 * event.
 */
export function operationDrafts(ops: readonly Op[], scope: OperationScope): ReadonlyArray<StepDraft<OperationParams>> {
  return ops.map((op) => ({ params: { ...scope, op }, type: KERNEL_STEPS.operation }));
}

/**
 * Returns the step that applies an effect.
 */
export function applicationDraft(params: ApplicationParams): StepDraft<ApplicationParams> {
  return { params, type: KERNEL_STEPS.effectApplication };
}

/**
 * Returns the step that removes an applied effect.
 */
export function removalDraft(params: RemovalParams): StepDraft<RemovalParams> {
  return { params, type: KERNEL_STEPS.effectRemoval };
}

/**
 * Returns the step that counts down effects at a moment of the battle.
 */
export function tickDraft(params: TickParams): StepDraft<TickParams> {
  return { params, type: KERNEL_STEPS.effectTick };
}

/**
 * Returns the step in which an effect runs its operations of every turn.
 */
export function turnDraft(params: TurnParams): StepDraft<TurnParams> {
  return { params, type: KERNEL_STEPS.effectTurn };
}

/**
 * Returns the step that brings the marks of activity of effects up to date.
 */
export function refreshDraft(): StepDraft {
  return { params: {}, type: KERNEL_STEPS.effectRefresh };
}
