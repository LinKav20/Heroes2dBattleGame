import type { StepContext, StepKind, StepResult } from '../extensions/index.ts';
import { activity, unlessHolds } from './activity.ts';
import { appliedSubjects, presentEffect } from './applied.ts';
import { DONE, operationDrafts, stepsDone } from './drafts.ts';
import { effectDefinition } from './holders.ts';
import { KERNEL_STEPS } from './names.ts';
import type { TurnParams } from './params.ts';

/**
 * Runs the operations of every turn of one effect, if the effect is still on its holder, or still in the definition
 * of its holder, and its condition of activity holds.
 */
export const TURN_STEP: StepKind<TurnParams> = Object.freeze({
  kind: 'step',
  migrations: [],
  name: KERNEL_STEPS.effectTurn,
  run: turn,
  version: 1,
});

function turn({ content, expressions, params, state }: StepContext<TurnParams>): StepResult {
  const { holder } = params;
  const present = presentEffect(state, content, holder, params.effect, params.applied);

  if (present === undefined) return DONE;

  const { applied } = present;
  const definition = effectDefinition(content, params.effect);
  const stop = unlessHolds(activity(expressions, definition, holder, applied));

  if (stop !== undefined) return stop;

  const subjects = appliedSubjects(holder, applied);

  const scope = { subjects, ...(applied === undefined ? {} : { effect: applied }) };

  return stepsDone(operationDrafts(definition.onTurn, scope));
}
