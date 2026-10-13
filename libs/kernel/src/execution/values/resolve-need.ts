import { KERNEL_EVENTS } from '../../events/index.ts';
import { VISIBLE_TO_ALL, VISIBLE_TO_NONE } from '../../ids/index.ts';
import type { StepNeed } from '../../kinds/index.ts';
import { REJECTION_REASONS, type Step } from '../../model/index.ts';
import type { EventRecorder } from '../event-recorder.ts';
import { ruleViolation, type ExecuteRejected } from '../result.ts';
import { withInput, type StepStack } from '../step-stack.ts';
import { isDiceRoll, rollDice } from './dice.ts';
import { requestAudience, requestFor } from './requests.ts';

/**
 * What happened to a value a step needs: the step got it and waits on the stack to run again, the kernel opened an
 * input request and stops, or the rules forbid the command.
 */
export type NeedOutcome = 'paused' | 'resolved' | ExecuteRejected;

/**
 * Gets the value a step needs. A roll from the generator comes at once; any other value makes the kernel open an input
 * request and save the remaining steps.
 */
export function resolveNeed(recorder: EventRecorder, stack: StepStack, step: Step, need: StepNeed): NeedOutcome {
  if (need.kind === 'roll' && recorder.state.ruleset.randomSources[need.value] !== 'external') {
    const roll = rollDice(recorder.state.rng, need.dice, need.sides);

    if ('reason' in roll) return ruleViolation(roll.reason, { value: need.value });

    const { dice, result, rng } = roll;
    const payload = { counter: rng.counter, dice, result, source: 'generator', value: need.value } as const;

    recorder.kernel(KERNEL_EVENTS.rollMade, payload, need.visibleTo ?? VISIBLE_TO_ALL, step.cause);
    stack.push(withInput(step, { dice, kind: 'roll', result }));

    return 'resolved';
  }

  if (need.kind === 'roll' && !isDiceRoll(need.dice, need.sides)) {
    return ruleViolation(REJECTION_REASONS.invalidRoll, { value: need.value });
  }

  const request = requestFor(need, recorder.state.nextId);

  stack.push(step);
  recorder.kernel(KERNEL_EVENTS.inputRequested, { request }, requestAudience(request.side), step.cause);
  recorder.kernel(KERNEL_EVENTS.stepsSaved, { steps: stack.saved() }, VISIBLE_TO_NONE, step.cause);

  return 'paused';
}
