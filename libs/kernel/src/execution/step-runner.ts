import { REJECTION_REASONS, type Step } from '../model/index.ts';
import type { ExecutionContext } from './context.ts';
import type { EventRecorder } from './event-recorder.ts';
import { MAX_STEPS_PER_COMMAND } from './limits.ts';
import { resolveNeed, type NeedOutcome } from './resolve-need.ts';
import { accepted, extensionViolation, ruleViolation, type ExecuteResult } from './result.ts';
import type { StepStack } from './step-stack.ts';

/**
 * Runs the steps from the stack one by one until the stack is empty, the battle is over, a step waits for a value
 * from outside, or the rules forbid the command. When the battle ends, the remaining steps do not run.
 */
export function runSteps(context: ExecutionContext, recorder: EventRecorder, stack: StepStack): ExecuteResult {
  let runs = 0;

  for (let step = stack.pop(); step !== undefined; step = stack.pop()) {
    runs += 1;

    if (runs > MAX_STEPS_PER_COMMAND) return ruleViolation(REJECTION_REASONS.stepLimit);

    const outcome = runStep(context, recorder, stack, step);

    if (outcome === 'paused') break;

    if (outcome !== 'continue') return outcome;

    if (recorder.state.phase.kind === 'ended') break;
  }

  return accepted(recorder.events, recorder.state);
}

function runStep(context: ExecutionContext, recorder: EventRecorder, stack: StepStack, step: Step): NeedOutcome {
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
      const first = recorder.nextEventId;

      for (const draft of result.events) {
        recorder.fromStep(step.type, draft, step.cause);
      }

      const cause = first < recorder.nextEventId ? first : step.cause;

      return stack.pushDrafts(result.steps ?? [], cause) ? 'continue' : ruleViolation(REJECTION_REASONS.stepLimit);
    }

    case 'need': {
      return resolveNeed(recorder, stack, step, result.need);
    }

    case 'reject': {
      return extensionViolation(step.type, result);
    }

    default: {
      throw new TypeError(`The step ${JSON.stringify(step.type)} returned an unknown result.`);
    }
  }
}
