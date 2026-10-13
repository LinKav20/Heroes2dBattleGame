import { KERNEL_EVENTS } from '../events/index.ts';
import { REJECTION_REASONS, type BattleState, type InputAnswer } from '../model/index.ts';
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
 */
export function answerRequest(context: ExecutionContext, state: BattleState, command: InputAnswer): ExecuteResult {
  const request = state.inputRequest;

  if (request?.id !== command.request) return nothingToAnswer(command.request);

  const input = readAnswer(request, command.value);

  if (input === undefined) return ruleViolation(REJECTION_REASONS.invalidAnswer, { request: request.id });

  const recorder = new EventRecorder(context.registries.events, state);
  const audience = requestAudience(request.side);

  recorder.kernel(KERNEL_EVENTS.inputClosed, { request: request.id }, audience);

  if (input.kind === 'roll' && request.kind === 'roll') {
    const payload = { dice: input.dice, result: input.result, source: 'external', value: request.value } as const;

    recorder.kernel(KERNEL_EVENTS.rollMade, payload, audience);
  }

  const stack = new StepStack(context.registries.steps, state.steps);

  stack.answerTop(input);

  return runSteps(context, recorder, stack, true);
}
