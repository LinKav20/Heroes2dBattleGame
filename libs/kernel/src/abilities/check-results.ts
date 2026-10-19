import type { Evaluation, StepRejects } from '../extensions/index.ts';
import type { Forbidden } from '../model/index.ts';

/**
 * Why a unit or a side cannot use an ability now: a reason of the kernel, or the rejection a node of a formula or a
 * condition gave.
 */
export type AbilityCheck = Forbidden | StepRejects;

/**
 * Returns what a check gives for the value of an evaluation, or the rejection of the evaluation as it is.
 *
 * @throws {TypeError} If the evaluation needs a roll, which a check never allows.
 */
export function whenValue<Value>(
  evaluation: Evaluation<Value>,
  check: (value: Value) => AbilityCheck | undefined,
): AbilityCheck | undefined {
  if (evaluation.kind === 'value') return check(evaluation.value);

  if (evaluation.kind === 'reject') return evaluation;

  throw new TypeError('A check of an ability cannot roll dice.');
}
