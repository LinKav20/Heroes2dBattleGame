import { KERNEL_EVENTS } from '../events/index.ts';
import { VISIBLE_TO_NONE } from '../ids/index.ts';
import { REJECTION_REASONS, type Step } from '../model/index.ts';
import type { ExecutionContext } from './context.ts';
import type { EventRecorder } from './event-recorder.ts';
import { MAX_STACK_DEPTH, MAX_STEPS_PER_COMMAND } from './limits.ts';
import { accepted, extensionViolation, ruleViolation, type ExecuteRejected, type ExecuteResult } from './result.ts';
import type { StepStack } from './step-stack.ts';
import { resolveNeed } from './values/resolve-need.ts';

type StepOutcome = 'continue' | 'paused' | ExecuteRejected;

/**
 * Runs the steps from the stack one by one until the stack is empty, a step waits for a value from outside, or the
 * rules forbid the command. A command that goes on after an answer empties the saved steps when it is done.
 */
export function runSteps(
  context: ExecutionContext,
  recorder: EventRecorder,
  stack: StepStack,
  hadSavedSteps: boolean,
): ExecuteResult {
  let stepsRun = 0;

  for (let step = stack.pop(); step !== undefined; step = stack.pop()) {
    stepsRun += 1;

    if (stepsRun > MAX_STEPS_PER_COMMAND) return ruleViolation(REJECTION_REASONS.stepLimit);

    const outcome = runStep(context, recorder, stack, step);

    if (outcome === 'paused') return accepted(recorder.events, recorder.state);

    if (outcome !== 'continue') return outcome;

    if (stack.depth > MAX_STACK_DEPTH) return ruleViolation(REJECTION_REASONS.stepLimit);
  }

  if (hadSavedSteps) recorder.kernel(KERNEL_EVENTS.stepsSaved, { steps: [] }, VISIBLE_TO_NONE);

  return accepted(recorder.events, recorder.state);
}

function runStep(context: ExecutionContext, recorder: EventRecorder, stack: StepStack, step: Step): StepOutcome {
  const kind = context.registries.steps.get(step.type);

  if (kind === undefined) throw new TypeError(`The kernel has no kind of step ${JSON.stringify(step.type)}.`);

  if (kind.version !== step.version) {
    throw new TypeError(`The step ${JSON.stringify(step.type)} is not in the current version; migrate it first.`);
  }

  const result = kind.run({
    content: context.content,
    inputs: step.inputs ?? [],
    params: step.params,
    state: recorder.state,
  });

  switch (result.kind) {
    case 'done': {
      const first = recorder.nextId;

      result.events.forEach((draft) => {
        recorder.record(draft, step.cause);
      });

      stack.pushDrafts(result.steps ?? [], first < recorder.nextId ? first : step.cause);

      return 'continue';
    }

    case 'need': {
      const outcome = resolveNeed(recorder, stack, step, result.need);

      return outcome === 'resolved' ? 'continue' : outcome;
    }

    case 'reject': {
      return extensionViolation(result.params);
    }

    default: {
      throw new TypeError(`The step ${JSON.stringify(step.type)} returned an unknown result.`);
    }
  }
}
