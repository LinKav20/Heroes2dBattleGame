import type { Effect } from '../content/index.ts';
import { evaluated } from '../expressions/index.ts';
import type { Evaluation, Expressions, StepResult } from '../extensions/index.ts';
import type { AppliedEffect, EffectHolder } from '../model/index.ts';
import { appliedSubjects } from './applied.ts';
import { DONE } from './drafts.ts';

/**
 * Tells whether an effect on its holder acts now: its condition of activity holds with the participants of the
 * holder, or it has none. The condition cannot roll dice.
 *
 * @throws {ContentError} If the condition rolls dice or is described wrongly.
 */
export function activity(
  expressions: Expressions,
  effect: Effect,
  holder: EffectHolder,
  applied?: AppliedEffect,
): Evaluation<boolean> {
  if (effect.activeWhile === undefined) return evaluated(true);

  const scope = expressions.within({
    rolls: false,
    subjects: appliedSubjects(holder, applied),
    ...(applied === undefined ? {} : { effect: applied }),
  });

  return scope.test(effect.activeWhile);
}

/**
 * Returns what a step returns when a condition does not let it go on: nothing to do if the condition is false, the
 * need or the rejection of the evaluation as it is, and nothing if the condition holds.
 */
export function unlessHolds(result: Evaluation<boolean>): StepResult | undefined {
  if (result.kind !== 'value') return result;

  return result.value ? undefined : DONE;
}
