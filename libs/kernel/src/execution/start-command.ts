import { planAbility, type AbilityForbidden, type AbilitySetup } from '../abilities/index.ts';
import type { CommandSteps, StepDraft, StepRejects } from '../extensions/index.ts';
import {
  REJECTION_REASONS,
  type BattleState,
  type ExtensionCommand,
  type GameCommand,
  type StateEditCommand,
} from '../model/index.ts';
import { checkOwnDrafts } from '../operations/index.ts';
import type { ExecutionContext } from './context.ts';
import { EventRecorder } from './event-recorder.ts';
import { extensionViolation, ruleViolation, type ExecuteResult } from './result.ts';
import { runSteps } from './step-runner.ts';
import { StepStack } from './step-stack.ts';

type KernelCommand = Exclude<GameCommand, ExtensionCommand>;

type KernelCommandPlan = AbilityForbidden | CommandSteps | StepRejects;

type Planner<Command extends KernelCommand> = (
  context: ExecutionContext,
  state: BattleState,
  command: Command,
) => KernelCommandPlan;

type Planners = { readonly [Type in KernelCommand['type']]?: Planner<Extract<KernelCommand, { type: Type }>> };

/**
 * Starts a game command or a state edit: checks that the battle goes on and nothing waits for an answer, turns the
 * command into steps and runs them. A game command of the kernel goes to its planner, and a command of an extension to
 * its kind; the kernel game commands without a planner yet are not available.
 *
 * @throws {TypeError} If the state has saved steps without an open input request, a plan is unknown, or a command of
 * an extension plans a step that only the kernel adds.
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

  if (command.type === 'extension') return startExtension(context, state, command);

  const plan = planOf(context, state, command);

  if (plan === undefined) return ruleViolation(REJECTION_REASONS.notAvailable);

  switch (plan.kind) {
    case 'forbidden': {
      return { ok: false, rejection: plan.rejection };
    }

    case 'reject': {
      return extensionViolation(command.type, plan);
    }

    case 'steps': {
      return runPlanned(context, state, plan.steps);
    }

    default: {
      throw new TypeError(`The game command ${JSON.stringify(command.type)} has an unknown plan.`);
    }
  }
}

const PLANNERS: Planners = {
  'use-ability': (context, state, command) => planAbility(setupOf(context), state, command),
  'use-item': (context, state, command) => planAbility(setupOf(context), state, command),
};

function planOf(context: ExecutionContext, state: BattleState, command: KernelCommand): KernelCommandPlan | undefined {
  const planner = PLANNERS[command.type] as Planner<KernelCommand> | undefined;

  return planner?.(context, state, command);
}

function setupOf({ attributes: cache, content, fields, registries }: ExecutionContext): AbilitySetup {
  return { cache, content, fields, registries };
}

function startExtension(context: ExecutionContext, state: BattleState, command: ExtensionCommand): ExecuteResult {
  const kind = context.registries.commands.get(command.name);

  if (kind === undefined) return ruleViolation(REJECTION_REASONS.unknownCommand, { name: command.name });

  const plan = kind.plan({ content: context.content, payload: command.payload, state });

  switch (plan.kind) {
    case 'reject': {
      return extensionViolation(command.name, plan, false);
    }

    case 'steps': {
      checkOwnDrafts(command.name, plan.steps);

      return runPlanned(context, state, plan.steps);
    }

    default: {
      throw new TypeError(`The command ${JSON.stringify(command.name)} returned an unknown plan.`);
    }
  }
}

function runPlanned(context: ExecutionContext, state: BattleState, steps: readonly StepDraft[]): ExecuteResult {
  const stack = new StepStack(context.registries.steps, []);

  if (!stack.pushDrafts(steps, undefined)) return ruleViolation(REJECTION_REASONS.stepLimit);

  return runSteps(context, new EventRecorder(context.registries.events, state), stack);
}
