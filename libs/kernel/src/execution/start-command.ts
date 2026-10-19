import { planAbility } from '../abilities/index.ts';
import {
  asGameAction,
  packagePlan,
  planContext,
  planDefend,
  planEndTurn,
  planFinishDeployment,
  planGiveUp,
  planMove,
  planPlaceUnit,
  planStartBattle,
  planWait,
  type BattlePlan,
  type CommandSetup,
  type PlanContext,
} from '../battle/index.ts';
import type { StepDraft } from '../extensions/index.ts';
import {
  REJECTION_REASONS,
  type BattleState,
  type ExtensionCommand,
  type GameCommand,
  type StateEditCommand,
} from '../model/index.ts';
import type { ExecutionContext } from './context.ts';
import { EventRecorder } from './event-recorder.ts';
import { extensionViolation, ruleViolation, type ExecuteResult } from './result.ts';
import { runSteps } from './step-runner.ts';
import { StepStack } from './step-stack.ts';

type KernelCommand = Exclude<GameCommand, ExtensionCommand>;

interface Planner<Command extends GameCommand> {
  readonly plan: (context: PlanContext, command: Command) => BattlePlan;
  readonly action: boolean;
}

type Planners = { readonly [Type in KernelCommand['type']]?: Planner<Extract<KernelCommand, { type: Type }>> };

/**
 * Starts a game command or a state edit: checks that the battle goes on and nothing waits for an answer, turns the
 * command into steps and runs them. A game command of the kernel goes to its planner, and a command of an extension to
 * its kind; the kernel game commands without a planner yet are not available. A game action in a turn, such as a
 * move, the use of an ability or a command of an extension, ends with the step that brings auras and zones up to date,
 * checks scenario triggers and outcomes and ends the turn of its holder as the plan says or if it is over.
 *
 * @throws {TypeError} If the state has saved steps without an open input request, a plan is unknown, or a command of
 * an extension plans a step that only the kernel adds or rejects with a reason it may not give.
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

  const plan = planOf(context, state, command);

  if (plan === undefined) {
    return command.type === 'extension'
      ? ruleViolation(REJECTION_REASONS.unknownCommand, { name: command.name })
      : ruleViolation(REJECTION_REASONS.notAvailable);
  }

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
  defend: { action: true, plan: planDefend },
  'end-turn': { action: true, plan: planEndTurn },
  'finish-deployment': { action: false, plan: planFinishDeployment },
  move: { action: true, plan: planMove },
  'place-unit': { action: false, plan: planPlaceUnit },
  retreat: { action: false, plan: planGiveUp },
  'start-battle': { action: false, plan: planStartBattle },
  surrender: { action: false, plan: planGiveUp },
  'use-ability': { action: true, plan: (context, command) => planAbility(context.setup, context.state, command) },
  'use-item': { action: true, plan: (context, command) => planAbility(context.setup, context.state, command) },
  wait: { action: true, plan: planWait },
};

function planOf(context: ExecutionContext, state: BattleState, command: GameCommand): BattlePlan | undefined {
  const plan = planContext(setupOf(context), state);

  if (command.type === 'extension') return extensionPlan(context, plan, command);

  const planner = PLANNERS[command.type] as Planner<KernelCommand> | undefined;

  if (planner === undefined) return undefined;

  const planned = planner.plan(plan, command);

  return planner.action ? asGameAction(state, planned) : planned;
}

function extensionPlan(
  context: ExecutionContext,
  plan: PlanContext,
  command: ExtensionCommand,
): BattlePlan | undefined {
  const kind = context.registries.commands.get(command.name);

  if (kind === undefined) return undefined;

  const { content, expressions, field, state } = plan;
  const planned = kind.plan({ content, expressions, field, payload: command.payload, state });

  const shape: unknown = planned.kind;

  if (shape !== 'reject' && shape !== 'steps') {
    throw new TypeError(`The command ${JSON.stringify(command.name)} returned an unknown plan.`);
  }

  return asGameAction(state, packagePlan(command.name, planned));
}

function setupOf({ attributes, content, fields, registries }: ExecutionContext): CommandSetup {
  return { attributes, content, fields, registries };
}

function runPlanned(context: ExecutionContext, state: BattleState, steps: readonly StepDraft[]): ExecuteResult {
  const stack = new StepStack(context.registries.steps, []);

  if (!stack.pushDrafts(steps)) return ruleViolation(REJECTION_REASONS.stepLimit);

  return runSteps(context, new EventRecorder(context.registries.events, state), stack);
}
