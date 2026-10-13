import { REJECTION_REASONS, type BattleState, type GameCommand, type StateEditCommand } from '../model/index.ts';
import type { ExecutionContext } from './context.ts';
import { EventRecorder } from './event-recorder.ts';
import { extensionViolation, ruleViolation, type ExecuteResult } from './result.ts';
import { runSteps } from './step-runner.ts';
import { StepStack } from './step-stack.ts';

/**
 * Starts a game command or a state edit: checks that the battle goes on and nothing waits for an answer, turns the
 * command into steps and runs them.
 *
 * @throws {TypeError} If the state has saved steps without an open input request, or the kind of command returns an
 * unknown plan.
 */
export function startCommand(
  context: ExecutionContext,
  state: BattleState,
  command: GameCommand | StateEditCommand,
): ExecuteResult {
  if (command.kind === 'edit') return ruleViolation(REJECTION_REASONS.notAvailable);

  if (state.inputRequest !== undefined) return ruleViolation(REJECTION_REASONS.inputPending);

  if (state.steps.length > 0) throw new TypeError('The battle has saved steps, but no input request is open.');

  if (state.phase.kind === 'ended') return ruleViolation(REJECTION_REASONS.battleOver);

  if (command.type !== 'extension') return ruleViolation(REJECTION_REASONS.notAvailable);

  const kind = context.registries.commands.get(command.name);

  if (kind === undefined) return ruleViolation(REJECTION_REASONS.unknownCommand, { name: command.name });

  const plan = kind.plan({ content: context.content, payload: command.payload, state });

  switch (plan.kind) {
    case 'reject': {
      return extensionViolation(command.name, plan);
    }

    case 'steps': {
      const stack = new StepStack(context.registries.steps, []);

      if (!stack.pushDrafts(plan.steps, undefined)) return ruleViolation(REJECTION_REASONS.stepLimit);

      return runSteps(context, new EventRecorder(context.registries.events, state), stack);
    }

    default: {
      throw new TypeError(`The command ${JSON.stringify(command.name)} returned an unknown plan.`);
    }
  }
}
