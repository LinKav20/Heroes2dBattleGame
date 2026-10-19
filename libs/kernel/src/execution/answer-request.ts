import { afterAbort } from '../battle/index.ts';
import { RANDOM_SOURCES } from '../content/index.ts';
import { KERNEL_EVENTS } from '../events/index.ts';
import { VISIBLE_TO_ALL } from '../ids/index.ts';
import {
  REJECTION_REASONS,
  type BattleState,
  type InputAnswer,
  type InputRequest,
  type Rejection,
  type StepInput,
} from '../model/index.ts';
import type { ExecutionContext } from './context.ts';
import { EventRecorder } from './event-recorder.ts';
import { nothingToAnswer, ruleViolation, type ExecuteResult } from './result.ts';
import { runSteps } from './step-runner.ts';
import { StepStack } from './step-stack.ts';
import { readAnswer } from './values/answers.ts';
import { requestAudience } from './values/requests.ts';

/**
 * Checks an answer against the open input request, closes the request, gives the value to the waiting step and goes on
 * from it.
 *
 * If the rules forbid the rest of the command, the kernel still accepts the answer: it closes the request and aborts
 * the command with `kernel:command-aborted`, and the events of the rest of the command are dropped. The steps of the
 * course of the battle that were waiting still run, so the action ends, the turn passes and the round goes on; a wait
 * that was aborted does not put the turn off.
 *
 * @throws {TypeError} If an input request is open, but the state has no step that waits for it.
 */
export function answerRequest(context: ExecutionContext, state: BattleState, command: InputAnswer): ExecuteResult {
  const request = state.inputRequest;

  if (request?.id !== command.request) return nothingToAnswer(command.request);

  const input = readAnswer(request, command.value);

  if (input === undefined) return ruleViolation(REJECTION_REASONS.invalidAnswer, { request: request.id });

  const stack = new StepStack(context.registries.steps, state.steps);

  stack.answerTop(input);

  const result = runSteps(context, closeRequest(context, state, request, input), stack);

  if (result.ok) return result;

  const flow = new StepStack(context.registries.steps, state.steps);

  flow.keepFlow();
  afterAbort(flow);

  return runSteps(context, abort(context, state, request, input, result.rejection), flow, { marksStale: true });
}

function abort(
  context: ExecutionContext,
  state: BattleState,
  request: InputRequest,
  input: StepInput,
  rejection: Rejection,
): EventRecorder {
  const recorder = closeRequest(context, state, request, input);

  recorder.kernel(KERNEL_EVENTS.commandAborted, { rejection }, requestAudience(request));

  return recorder;
}

function closeRequest(
  context: ExecutionContext,
  state: BattleState,
  request: InputRequest,
  input: StepInput,
): EventRecorder {
  const recorder = new EventRecorder(context.registries.events, state);

  recorder.kernel(KERNEL_EVENTS.inputClosed, { request: request.id }, requestAudience(request));

  if (request.kind === 'roll' && input.kind === 'roll') {
    const payload = { dice: input.dice, name: request.name, result: input.result, source: RANDOM_SOURCES.external };

    recorder.kernel(KERNEL_EVENTS.rollMade, payload, request.visibleTo ?? VISIBLE_TO_ALL);
  }

  return recorder;
}
