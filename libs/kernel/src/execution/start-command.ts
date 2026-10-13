import { REJECTION_REASONS, type BattleState, type GameCommand, type StateEditCommand } from '../model/index.ts';
import type { ExecutionContext } from './context.ts';
import { EventRecorder } from './event-recorder.ts';
import { extensionViolation, ruleViolation, type ExecuteResult } from './result.ts';
import { runSteps } from './step-runner.ts';
import { StepStack } from './step-stack.ts';

/**
 * Starts a game command or a state edit: checks that nothing waits for an answer, turns the command into steps and
 * runs them.
 */
export function startCommand(
  context: ExecutionContext,
  state: BattleState,
  command: GameCommand | StateEditCommand,
): ExecuteResult {
  if (command.kind === 'edit') return ruleViolation(REJECTION_REASONS.notAvailable);

  if (state.inputRequest !== undefined) return ruleViolation(REJECTION_REASONS.inputPending);

  if (command.type !== 'extension') return ruleViolation(REJECTION_REASONS.notAvailable);

  const kind = context.registries.commands.get(command.name);

  if (kind === undefined) return ruleViolation(REJECTION_REASONS.unknownCommand, { name: command.name });

  const plan = kind.plan({ content: context.content, payload: command.payload, state });

  if (plan.kind === 'reject') return extensionViolation(plan.params);

  const stack = new StepStack(context.registries.steps, state.steps);

  stack.pushDrafts(plan.steps, undefined);

  return runSteps(context, new EventRecorder(context.registries.events, state), stack, state.steps.length > 0);
}
