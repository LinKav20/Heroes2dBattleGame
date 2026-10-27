import { BattleCourse, chosenMechanic } from '../battle/index.ts';
import { ContentError } from '../content/index.ts';
import { reactionsAfter, refreshDraft } from '../effects/index.ts';
import { KERNEL_EVENTS } from '../events/index.ts';
import { createExpressions } from '../expressions/index.ts';
import type { StepContext, StepRejects } from '../extensions/index.ts';
import { createFieldGeometry } from '../geometry/index.ts';
import { isFormulaReason, REJECTION_CODES, REJECTION_REASONS, type BattleState, type Step } from '../model/index.ts';
import { isKernelName, KERNEL_STEPS } from '../names/index.ts';
import { checkOwnSteps } from '../operations/index.ts';
import type { ExecutionContext } from './context.ts';
import type { EventRecorder } from './event-recorder.ts';
import { MAX_STACK_DEPTH, MAX_STEPS_PER_COMMAND } from './limits.ts';
import { pauses, resolveNeed, type NeedOutcome } from './resolve-need.ts';
import { accepted, extensionViolation, ruleViolation, type ExecuteRejected, type ExecuteResult } from './result.ts';
import type { StepStack } from './step-stack.ts';

/**
 * How the runner starts: whether the marks of activity of effects are already out of date, for example after an
 * aborted command.
 */
export interface RunOptions {
  /** Whether the marks of activity of effects are out of date before the first step. */
  readonly marksStale?: boolean;
}

interface StepOptions {
  readonly course?: BattleCourse;
  readonly reactions: boolean;
}

/**
 * Runs the steps from the stack one by one until the stack is empty, the battle is over, a step waits for a value
 * from outside, or the rules forbid the command. When the battle ends, the remaining steps do not run.
 *
 * After a step the kernel puts on top of the stack one step with the reactions of effects to its events, so they run
 * before the other steps; before the battle starts effects do not react, and neither effects nor scenario triggers
 * react to the steps of a state edit. When the stack is empty and some step gave events since the marks of activity of
 * effects were last brought up to date by any step, or `marksStale` says they are out of date, the kernel brings them
 * up to date, and the reactions to that run as well; what the course of the battle checks then is up to `BattleCourse`.
 * When the battle ends, it brings them up to date once without reactions.
 *
 * A step of the course of the battle cannot reject the command: its rejection is an error of the content if a formula
 * gave it, and of the package otherwise. If the steps of the course of the battle go beyond the limits of steps, for
 * example because triggers fire each other, it is an error of the content as well.
 *
 * @throws {ContentError} If a step of the course of the battle rejects with a reason of a formula, or the course of
 * the battle goes beyond the limits of steps.
 * @throws {TypeError} If a step of the course of the battle rejects with another reason.
 */
export function runSteps(
  context: ExecutionContext,
  recorder: EventRecorder,
  stack: StepStack,
  options: RunOptions = {},
): ExecuteResult {
  const course = new BattleCourse(context.content, context.registries.events);
  let runs = 0;
  let stale = options.marksStale === true;
  let refreshed: number | undefined;

  for (;;) {
    const popped = stack.pop();

    if (popped === undefined) {
      const changed = refreshed !== undefined
        && recorder.events.slice(refreshed).some(({ type }) => type !== KERNEL_EVENTS.effectChanged);
      const checks = course.whenEmpty(recorder.state, changed);
      const refresh = checks.length === 0 && stale;

      if (checks.length === 0 && !refresh) break;

      refreshed = refresh ? recorder.nextEventId : undefined;
      stale = refresh ? false : stale;
      stack.pushDrafts(refresh ? [refreshDraft()] : checks, { flow: true });
      continue;
    }

    const step = course.beforeRun(popped);

    runs += 1;

    if (runs > MAX_STEPS_PER_COMMAND) return beyondLimits(step, recorder.state);

    const before = recorder.nextEventId;
    const reactions = step.quiet !== true && course.reacts(recorder.state);
    const outcome = runStep(context, recorder, stack, step, { course, reactions });

    stale = step.type === KERNEL_STEPS.effectRefresh ? false : stale || recorder.nextEventId > before;

    if (outcome === 'paused') break;

    if (outcome !== 'continue') return outcome;

    if (recorder.state.phase.kind === 'ended') return stale ? settle(context, recorder) : finished(recorder);
  }

  return finished(recorder);
}

/**
 * Brings the marks of activity of effects up to date once, without reactions to that: at the end of the battle.
 */
export function settle(context: ExecutionContext, recorder: EventRecorder): ExecuteResult {
  const type = KERNEL_STEPS.effectRefresh;
  const step: Step = { flow: true, params: {}, type, version: context.registries.steps.get(type)?.version ?? 1 };
  const outcome = runStep(context, recorder, undefined, step, { reactions: false });

  return outcome === 'continue' || outcome === 'paused' ? finished(recorder) : outcome;
}

function runStep(
  context: ExecutionContext,
  recorder: EventRecorder,
  stack: StepStack | undefined,
  step: Step,
  options: StepOptions,
): NeedOutcome {
  const kind = context.registries.steps.get(step.type);

  if (kind === undefined) throw new TypeError(`The kernel has no kind of step ${JSON.stringify(step.type)}.`);

  if (kind.version !== step.version) {
    throw new TypeError(`The step ${JSON.stringify(step.type)} is not in the current version; migrate it first.`);
  }

  const { state } = recorder;
  const run = stepContext(context, state, step);
  const result = kind.run(run);

  if (!isKernelName(step.type)) checkOwnSteps(step.type, result);

  switch (result.kind) {
    case 'done': {
      const first = recorder.nextEventId;
      const states: BattleState[] = [];

      for (const draft of result.events) {
        recorder.fromStep(step.type, draft, step.cause);
        states.push(recorder.state);
      }

      if (stack === undefined) return 'continue';

      const cause = first < recorder.nextEventId ? first : step.cause;
      const recorded = recorder.events.slice(first);
      const { events, topologies } = context.registries;
      const setup = { content: context.content, events, fields: context.fields, index: context.reactions, topologies };
      const reaction = options.reactions ? reactionsAfter(setup, recorded, states, state) : undefined;
      const flow = step.flow === true;
      const quiet = step.quiet === true;
      const drafts = options.course?.placed(result.steps ?? [], step, stack) ?? result.steps ?? [];
      const pushed = stack.pushDrafts(drafts, { cause, flow, quiet })
        && (reaction === undefined || stack.pushDrafts([reaction], { cause: first, flow }));

      if (!quiet) options.course?.afterStep(state, recorder.state, recorded, stack);

      return pushed ? 'continue' : beyondLimits(step, recorder.state);
    }

    case 'need': {
      if (stack === undefined) throw new TypeError(`The step ${JSON.stringify(step.type)} asks for a value alone.`);

      if (pauses(recorder.state, result.need) && options.course?.beforePause(stack) === false) {
        return beyondLimits(step, recorder.state);
      }

      return resolveNeed(context, recorder, stack, step, result.need);
    }

    case 'reject': {
      if (step.flow === true) flowRejects(step, result);

      return isKernelName(step.type) ? kernelViolation(result) : extensionViolation(step.type, result);
    }

    default: {
      throw new TypeError(`The step ${JSON.stringify(step.type)} returned an unknown result.`);
    }
  }
}

function stepContext(context: ExecutionContext, state: BattleState, step: Step): StepContext {
  const inputs = step.inputs ?? [];
  const { attributes, content, fields, registries } = context;
  const field = createFieldGeometry(state, content, registries.topologies, fields);
  const expressions = createExpressions({ attributes, content, field, fields, inputs, registries, state });
  const reading = { content, expressions, field, state };

  return {
    ...reading,
    inputs,
    mechanic: (name: string) => chosenMechanic(registries.mechanics, reading, name),
    params: step.params,
  };
}

function beyondLimits(step: Step, state: BattleState): ExecuteRejected {
  if (step.flow !== true) return ruleViolation(REJECTION_REASONS.stepLimit);

  throw new ContentError(
    `The course of the battle goes beyond ${String(MAX_STEPS_PER_COMMAND)} steps or ${String(MAX_STACK_DEPTH)} steps `
    + `on the stack at ${JSON.stringify(step.type)} in round ${String(state.round)}, `
    + `phase ${JSON.stringify(state.phase.kind)}, for example because triggers fire each other without end.`,
  );
}

function kernelViolation({ params = {}, reason }: StepRejects): ExecuteRejected {
  return { ok: false, rejection: { code: REJECTION_CODES.ruleViolation, params, reason } };
}

function flowRejects(step: Step, result: StepRejects): never {
  const message = `The step ${JSON.stringify(step.type)} runs as part of the course of the battle and cannot reject `
    + `the command, but it rejects it with ${JSON.stringify(result.reason)}.`;

  throw typeof result.reason === 'string' && isFormulaReason(result.reason)
    ? new ContentError(message)
    : new TypeError(message);
}

function finished(recorder: EventRecorder): ExecuteResult {
  return accepted(recorder.events, recorder.state);
}
