import { planAbility } from '../abilities/index.ts';
import {
  asGameAction,
  packagePlan,
  planAttack,
  planContext,
  planDefend,
  planEdit,
  planEndTurn,
  planFinishDeployment,
  planGiveUp,
  planMove,
  planPlaceUnit,
  planShoot,
  planStartBattle,
  planWait,
  type BattlePlan,
  type PlanContext,
  type PlannedEdit,
} from '../battle/index.ts';
import type { StepDraft } from '../extensions/index.ts';
import {
  forbidden,
  REJECTION_REASONS,
  type BattleState,
  type ExtensionCommand,
  type GameCommand,
  type StateEditCommand,
} from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { commandSetup, type ExecutionContext } from './context.ts';
import { EventRecorder } from './event-recorder.ts';
import { extensionViolation, ruleViolation, type ExecuteRejected, type ExecuteResult } from './result.ts';
import { runSteps } from './step-runner.ts';
import { StepStack } from './step-stack.ts';

type KernelCommand = Exclude<GameCommand, ExtensionCommand>;

interface Planner<Command extends GameCommand> {
  readonly plan: (context: PlanContext, command: Command) => BattlePlan;
  readonly action: boolean;
}

type Planners = { readonly [Type in KernelCommand['type']]: Planner<Extract<KernelCommand, { type: Type }>> };

/**
 * Starts a game command or a state edit: checks that the battle goes on and nothing waits for an answer, turns the
 * command into steps and runs them. A game command of the kernel goes to its planner, and a command of an extension to
 * its kind. A game action in a turn, such as a move, the use of an ability or a command of an extension, ends with the
 * step that brings auras and zones up to date, checks scenario triggers and outcomes and ends the turn of its holder
 * as the plan says or if it is over. A state edit runs its steps, which nothing reacts to, and then the checks of the
 * outcomes and of the end of the turn, as `planEdit` tells.
 *
 * @throws {TypeError} If the state has saved steps without an open input request, a plan is unknown, or a command of
 * an extension plans a step that only the kernel adds or rejects with a reason it may not give.
 */
export function startCommand(
  context: ExecutionContext,
  state: BattleState,
  command: GameCommand | StateEditCommand,
): ExecuteResult {
  const blocked = battleRejection(state);

  if (blocked !== undefined) return blocked;

  if (command.kind === 'edit') return startEdit(context, state, command);

  const plan = planOf(context, state, command);

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

/**
 * Returns why no game command can run in a state now: an input request is open, or the battle is over; nothing if the
 * battle waits for a command.
 *
 * @throws {TypeError} If the state has saved steps without an open input request.
 */
export function battleRejection(state: BattleState): ExecuteRejected | undefined {
  if (state.inputRequest !== undefined) return ruleViolation(REJECTION_REASONS.inputPending);

  if (state.steps.length > 0) throw new TypeError('The battle has saved steps, but no input request is open.');

  return state.phase.kind === 'ended' ? ruleViolation(REJECTION_REASONS.battleOver) : undefined;
}

const PLANNERS: Planners = {
  attack: { action: true, plan: planAttack },
  defend: { action: true, plan: planDefend },
  'end-turn': { action: true, plan: planEndTurn },
  'finish-deployment': { action: false, plan: planFinishDeployment },
  move: { action: true, plan: planMove },
  'place-unit': { action: false, plan: planPlaceUnit },
  retreat: { action: false, plan: planGiveUp },
  shoot: { action: true, plan: planShoot },
  'start-battle': { action: false, plan: planStartBattle },
  surrender: { action: false, plan: planGiveUp },
  'use-ability': { action: true, plan: (context, command) => planAbility(context.setup, context.state, command) },
  'use-item': { action: true, plan: (context, command) => planAbility(context.setup, context.state, command) },
  wait: { action: true, plan: planWait },
};

function planOf(context: ExecutionContext, state: BattleState, command: GameCommand): BattlePlan {
  const plan = planContext(commandSetup(context.registries, context, context.content), state);

  if (command.type === 'extension') return extensionPlan(context, plan, command);

  const planner = PLANNERS[command.type] as Planner<KernelCommand>;
  const planned = planner.plan(plan, command);

  return planner.action ? asGameAction(state, planned) : planned;
}

function extensionPlan(
  context: ExecutionContext,
  plan: PlanContext,
  command: ExtensionCommand,
): BattlePlan {
  const kind = context.registries.commands.get(command.name);

  if (kind === undefined) return forbidden(REJECTION_REASONS.unknownCommand, { name: command.name });

  const { content, expressions, field, state } = plan;
  const planned = kind.plan({ content, expressions, field, payload: command.payload, state });

  return asGameAction(state, packagePlan(command.name, planned));
}

function startEdit(context: ExecutionContext, state: BattleState, command: StateEditCommand): ExecuteResult {
  const plan = planEdit(planContext(commandSetup(context.registries, context, context.content), state), command.edit);

  if (plan.kind === 'forbidden') return { ok: false, rejection: plan.rejection };

  if (plan.kind === 'reject') return extensionViolation(KERNEL_STEPS.stateEdit, plan);

  return runEdit(context, state, plan);
}

function runEdit(context: ExecutionContext, state: BattleState, plan: PlannedEdit): ExecuteResult {
  const stack = new StepStack(context.registries.steps, []);

  const pushed = stack.pushDrafts(plan.checks, { flow: true })
    && stack.pushDrafts(plan.tail, { flow: true, quiet: true })
    && stack.pushDrafts(plan.steps, { quiet: true });

  if (!pushed) return ruleViolation(REJECTION_REASONS.stepLimit);

  return runSteps(context, new EventRecorder(context.registries.events, state), stack);
}

function runPlanned(context: ExecutionContext, state: BattleState, steps: readonly StepDraft[]): ExecuteResult {
  const stack = new StepStack(context.registries.steps, []);

  if (!stack.pushDrafts(steps)) return ruleViolation(REJECTION_REASONS.stepLimit);

  return runSteps(context, new EventRecorder(context.registries.events, state), stack);
}
