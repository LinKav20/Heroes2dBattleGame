import { reactionsAfter, refreshDraft } from '../effects/index.ts';
import { createExpressions } from '../expressions/index.ts';
import { createFieldGeometry } from '../geometry/index.ts';
import { REJECTION_REASONS, type BattleState, type Step } from '../model/index.ts';
import { isKernelName, KERNEL_STEPS } from '../names/index.ts';
import { checkOwnSteps } from '../operations/index.ts';
import type { ExecutionContext } from './context.ts';
import type { EventRecorder } from './event-recorder.ts';
import { MAX_STEPS_PER_COMMAND } from './limits.ts';
import { resolveNeed, type NeedOutcome } from './resolve-need.ts';
import { accepted, extensionViolation, ruleViolation, type ExecuteResult } from './result.ts';
import { StepStack } from './step-stack.ts';

/**
 * Runs the steps from the stack one by one until the stack is empty, the battle is over, a step waits for a value
 * from outside, or the rules forbid the command. When the battle ends, the remaining steps do not run.
 *
 * After a step the kernel puts on top of the stack one step with the reactions of effects to its events, so they run
 * before the other steps. When the stack is empty and some step gave events since the marks of activity of effects
 * were last brought up to date, the kernel brings them up to date, and the reactions to that run as well. When the
 * battle ends, it brings them up to date once without reactions.
 */
export function runSteps(context: ExecutionContext, recorder: EventRecorder, stack: StepStack): ExecuteResult {
  let runs = 0;
  let stale = false;

  for (;;) {
    const step = stack.pop();

    if (step === undefined) {
      if (!stale) break;

      stale = false;
      stack.pushDrafts([refreshDraft()], undefined);
      continue;
    }

    runs += 1;

    if (runs > MAX_STEPS_PER_COMMAND) return ruleViolation(REJECTION_REASONS.stepLimit);

    const before = recorder.nextEventId;
    const outcome = runStep(context, recorder, stack, step, true);

    if (step.type !== KERNEL_STEPS.effectRefresh && recorder.nextEventId > before) stale = true;

    if (outcome === 'paused') break;

    if (outcome !== 'continue') return outcome;

    if (recorder.state.phase.kind === 'ended') return stale ? settle(context, recorder) : finished(recorder);
  }

  return finished(recorder);
}

/**
 * Brings the marks of activity of effects up to date once, without reactions to that: at the end of the battle and
 * after an aborted command.
 */
export function settle(context: ExecutionContext, recorder: EventRecorder): ExecuteResult {
  const stack = new StepStack(context.registries.steps, []);

  stack.pushDrafts([refreshDraft()], undefined);

  const step = stack.pop();
  const outcome = step === undefined ? 'continue' : runStep(context, recorder, stack, step, false);

  return outcome === 'continue' || outcome === 'paused' ? finished(recorder) : outcome;
}

function runStep(
  context: ExecutionContext,
  recorder: EventRecorder,
  stack: StepStack,
  step: Step,
  reactions: boolean,
): NeedOutcome {
  const kind = context.registries.steps.get(step.type);

  if (kind === undefined) throw new TypeError(`The kernel has no kind of step ${JSON.stringify(step.type)}.`);

  if (kind.version !== step.version) {
    throw new TypeError(`The step ${JSON.stringify(step.type)} is not in the current version; migrate it first.`);
  }

  const inputs = step.inputs ?? [];
  const { attributes: cache, content, fields, registries } = context;
  const { state } = recorder;
  const field = createFieldGeometry(state, content, registries.topologies, fields);
  const expressions = createExpressions({ cache, content, field, fields, inputs, registries, state });
  const result = kind.run({ content, expressions, field, inputs, params: step.params, state });

  if (!isKernelName(step.type)) checkOwnSteps(step.type, result);

  switch (result.kind) {
    case 'done': {
      const first = recorder.nextEventId;
      const states: BattleState[] = [];

      for (const draft of result.events) {
        recorder.fromStep(step.type, draft, step.cause);
        states.push(recorder.state);
      }

      const cause = first < recorder.nextEventId ? first : step.cause;
      const { events, topologies } = registries;
      const setup = { content, events, fields, index: context.reactions, topologies };
      const reaction = reactions ? reactionsAfter(setup, recorder.events.slice(first), states, state) : undefined;
      const pushed = stack.pushDrafts(result.steps ?? [], cause)
        && (reaction === undefined || stack.pushDrafts([reaction], first));

      return pushed ? 'continue' : ruleViolation(REJECTION_REASONS.stepLimit);
    }

    case 'need': {
      return resolveNeed(context, recorder, stack, step, result.need);
    }

    case 'reject': {
      return extensionViolation(step.type, result);
    }

    default: {
      throw new TypeError(`The step ${JSON.stringify(step.type)} returned an unknown result.`);
    }
  }
}

function finished(recorder: EventRecorder): ExecuteResult {
  return accepted(recorder.events, recorder.state);
}
