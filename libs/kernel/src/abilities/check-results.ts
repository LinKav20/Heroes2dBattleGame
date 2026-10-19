import type { Evaluation, StepRejects } from '../extensions/index.ts';
import type { JsonObject } from '../json/index.ts';
import { REJECTION_CODES, type Rejection, type RejectionReason } from '../model/index.ts';

/**
 * The rules forbid the command with a reason of the kernel.
 */
export interface AbilityForbidden {
  /** The kind of result. */
  readonly kind: 'forbidden';
  /** Why the rules forbid the command. */
  readonly rejection: Rejection;
}

/**
 * Why a unit or a side cannot use an ability now: a reason of the kernel, or the rejection a node of a formula or a
 * condition gave.
 */
export type AbilityCheck = AbilityForbidden | StepRejects;

/**
 * Returns the result of a check that the rules forbid with a reason of the kernel and its parameters.
 */
export function forbidden(reason: RejectionReason, params: JsonObject = {}): AbilityForbidden {
  return { kind: 'forbidden', rejection: { code: REJECTION_CODES.ruleViolation, params, reason } };
}

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
