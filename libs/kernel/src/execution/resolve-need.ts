import { RANDOM_SOURCES } from '../content/index.ts';
import { KERNEL_EVENTS } from '../events/index.ts';
import type { RollNeed, StepNeed } from '../extensions/index.ts';
import { VISIBLE_TO_ALL, VISIBLE_TO_NONE } from '../ids/index.ts';
import { REJECTION_REASONS, type Step } from '../model/index.ts';
import { RNG_FAILURES, rngRangeSeries } from '../rng/index.ts';
import type { ExecutionContext } from './context.ts';
import type { EventRecorder } from './event-recorder.ts';
import { ruleViolation, type ExecuteRejected } from './result.ts';
import { withInput, type StepStack } from './step-stack.ts';
import { checkNeed } from './values/needs.ts';
import { requestAudience, requestFor } from './values/requests.ts';

/**
 * What happened to a value a step needs: the step got it and waits on the stack to run again, the kernel opened an
 * input request and stops, or the rules forbid the command.
 */
export type NeedOutcome = 'continue' | 'paused' | ExecuteRejected;

/**
 * Gets the value a step needs. A roll from the generator comes at once; any other value makes the kernel open an input
 * request and save the remaining steps. A roll from the generator changes only its counter, so the values of
 * attributes and tags calculated before the roll stay valid.
 *
 * @throws {TypeError} If the need cannot be met, or the ruleset rolls the value with the generator, but the battle
 * has none.
 */
export function resolveNeed(
  context: ExecutionContext,
  recorder: EventRecorder,
  stack: StepStack,
  step: Step,
  need: StepNeed,
): NeedOutcome {
  checkNeed(step.type, need);

  if (need.kind === 'roll' && recorder.state.ruleset.randomSources[need.name] !== RANDOM_SOURCES.external) {
    const before = recorder.state;
    const outcome = rollWithGenerator(recorder, stack, step, need);

    context.attributes.carry(context.content, before, recorder.state);

    return outcome;
  }

  const request = requestFor(need, recorder.state.nextRequestId);

  stack.push(step);
  recorder.kernel(KERNEL_EVENTS.inputRequested, { request }, requestAudience(request), step.cause);
  recorder.kernel(KERNEL_EVENTS.stepsSaved, { steps: stack.saved() }, VISIBLE_TO_NONE, step.cause);

  return 'paused';
}

function rollWithGenerator(recorder: EventRecorder, stack: StepStack, step: Step, need: RollNeed): NeedOutcome {
  const { rng } = recorder.state;

  if (rng === undefined) {
    throw new TypeError(`The ruleset rolls ${JSON.stringify(need.name)} with the generator, but the battle has none.`);
  }

  const roll = rngRangeSeries(rng, 1, need.sides, need.count);

  if (!roll.ok && roll.reason === RNG_FAILURES.exhausted) {
    return ruleViolation(REJECTION_REASONS.rngExhausted, { name: need.name });
  }

  if (!roll.ok) throw new TypeError(`The generator cannot roll dice with ${String(need.sides)} sides.`);

  const dice = roll.values;
  const result = dice.reduce((sum, die) => sum + die, 0);
  const payload = { counter: roll.rng.counter, dice, name: need.name, result, source: RANDOM_SOURCES.generator };

  recorder.kernel(KERNEL_EVENTS.rollMade, payload, need.visibleTo ?? VISIBLE_TO_ALL, step.cause);
  stack.push(withInput(step, { dice, kind: 'roll', name: need.name, result }));

  return 'continue';
}
