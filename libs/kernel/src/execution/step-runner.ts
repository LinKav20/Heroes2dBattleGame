import { KERNEL_STEPS, reactionDrafts } from '../effects/index.ts';
import { createExpressions } from '../expressions/index.ts';
import type { StepDraft } from '../extensions/index.ts';
import { REJECTION_REASONS, type BattleEvent, type Step } from '../model/index.ts';
import type { ExecutionContext } from './context.ts';
import type { EventRecorder } from './event-recorder.ts';
import { MAX_STEPS_PER_COMMAND } from './limits.ts';
import { resolveNeed, type NeedOutcome } from './resolve-need.ts';
import { accepted, extensionViolation, ruleViolation, type ExecuteResult } from './result.ts';
import type { StepStack } from './step-stack.ts';

/**
 * Runs the steps from the stack one by one until the stack is empty, the battle is over, a step waits for a value
 * from outside, or the rules forbid the command. When the battle ends, the remaining steps do not run.
 *
 * After every step the kernel puts on top of the stack the reactions of effects to the events of the step, so they run
 * before the other steps. When the stack is empty, the kernel brings the marks of activity of effects up to date once.
 */
export function runSteps(context: ExecutionContext, recorder: EventRecorder, stack: StepStack): ExecuteResult {
  let runs = 0;
  let settled = false;

  for (;;) {
    const step = stack.pop();

    if (step === undefined) {
      if (settled) break;

      settled = true;
      stack.pushDrafts([SETTLE], undefined);
      continue;
    }

    runs += 1;

    if (runs > MAX_STEPS_PER_COMMAND) return ruleViolation(REJECTION_REASONS.stepLimit);

    const outcome = runStep(context, recorder, stack, step);

    if (outcome === 'paused') break;

    if (outcome !== 'continue') return outcome;

    if (recorder.state.phase.kind === 'ended') break;
  }

  return accepted(recorder.events, recorder.state);
}

const SETTLE: StepDraft = Object.freeze({ params: {}, type: KERNEL_STEPS.effectRefresh });

function runStep(context: ExecutionContext, recorder: EventRecorder, stack: StepStack, step: Step): NeedOutcome {
  const kind = context.registries.steps.get(step.type);

  if (kind === undefined) throw new TypeError(`The kernel has no kind of step ${JSON.stringify(step.type)}.`);

  if (kind.version !== step.version) {
    throw new TypeError(`The step ${JSON.stringify(step.type)} is not in the current version; migrate it first.`);
  }

  const inputs = step.inputs ?? [];
  const { cache, content, registries } = context;
  const { state } = recorder;
  const expressions = createExpressions({ cache, content, inputs, registries, state });
  const result = kind.run({ content, expressions, inputs, params: step.params, state });

  switch (result.kind) {
    case 'done': {
      const first = recorder.nextEventId;

      for (const draft of result.events) {
        recorder.fromStep(step.type, draft, step.cause);
      }

      const cause = first < recorder.nextEventId ? first : step.cause;
      const pushed = stack.pushDrafts(result.steps ?? [], cause)
        && pushReactions(context, recorder, stack, recorder.events.slice(first));

      return pushed ? 'continue' : ruleViolation(REJECTION_REASONS.stepLimit);
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

function pushReactions(
  context: ExecutionContext,
  recorder: EventRecorder,
  stack: StepStack,
  events: readonly BattleEvent[],
): boolean {
  return events.toReversed().every((event) =>
    stack.pushDrafts(reactionDrafts(event, recorder.state, context.content), event.id));
}
