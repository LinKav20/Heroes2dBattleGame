import type { StepDraft } from '../extensions/index.ts';
import type { TurnHolder } from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import type {
  ActionEndParams,
  DeploymentEndParams,
  GiveUpParams,
  MoveParams,
  ScenarioCheckParams,
  SpendActionsParams,
  StartCheckParams,
  TriggerFiring,
  TurnCheckParams,
  TurnCountsParams,
  TurnEndParams,
  TurnOrderHookParams,
  TurnStartParams,
  UnitPlaceParams,
} from './params.ts';

/**
 * Returns the step that moves a unit along a path, spends the actions of the turn the move costs and gives
 * `kernel:unit-moved`, or `kernel:unit-turned` if the path is empty and the direction changes. The step does not check
 * the path: a package that adds it plans the move with `plannedMove` first.
 */
export function moveDraft(params: MoveParams): StepDraft<MoveParams> {
  return { params, type: KERNEL_STEPS.move };
}

/**
 * Returns the step with which a unit spends actions of its turn, for example the action of an attack or a defense.
 */
export function spendActionsDraft(params: SpendActionsParams): StepDraft<SpendActionsParams> {
  return { params, type: KERNEL_STEPS.spendActions };
}

/**
 * Returns the step that ends the turn if `end` says so, or if the side or the unit that has it can do nothing more:
 * the unit is dead, is not on the field or has spent every kind of action of the turn that the ruleset lists; with a
 * holder the step ends only the turn of that holder. A hook of the order of turns adds it to end the turn at once,
 * for example when a check of morale fails. A step of a command that adds it with `end` does not end the turn at once:
 * the turn ends after the rest of the command, at the end of the action.
 */
export function turnCheckDraft(params: TurnCheckParams = {}): StepDraft<TurnCheckParams> {
  return { params, type: KERNEL_STEPS.turnCheck };
}

/**
 * Returns the step that checks at the start of a turn whether the turn is over before the holder could act.
 */
export function startCheckDraft(holder: TurnHolder): StepDraft<StartCheckParams> {
  return { params: { holder, start: true }, type: KERNEL_STEPS.turnCheck };
}

/**
 * Returns the step that counts a turn for its participants one at a time.
 */
export function turnCountsDraft(params: TurnCountsParams): StepDraft<TurnCountsParams> {
  return { params, type: KERNEL_STEPS.turnCounts };
}

/**
 * Returns the step that starts the battle after deployment.
 */
export function battleStartDraft(): StepDraft {
  return { params: {}, type: KERNEL_STEPS.battleStart };
}

/**
 * Returns the step that starts the next round.
 */
export function roundStartDraft(): StepDraft {
  return { params: {}, type: KERNEL_STEPS.roundStart };
}

/**
 * Returns the step that ends the round.
 */
export function roundEndDraft(): StepDraft {
  return { params: {}, type: KERNEL_STEPS.roundEnd };
}

/**
 * Returns the step that gives the next turn of the round, or ends the round.
 */
export function nextTurnDraft(): StepDraft {
  return { params: {}, type: KERNEL_STEPS.nextTurn };
}

/**
 * Returns the step that starts a turn.
 */
export function turnStartDraft(params: TurnStartParams): StepDraft<TurnStartParams> {
  return { params, type: KERNEL_STEPS.turnStart };
}

/**
 * Returns the step that ends a turn.
 */
export function turnEndDraft(params: TurnEndParams): StepDraft<TurnEndParams> {
  return { params, type: KERNEL_STEPS.turnEnd };
}

/**
 * Returns the step that asks the order of turns for its steps at a moment of the battle.
 */
export function turnOrderHookDraft(params: TurnOrderHookParams): StepDraft<TurnOrderHookParams> {
  return { params, type: KERNEL_STEPS.turnOrderHook };
}

/**
 * Returns the step after a game action: auras and zones, scenario triggers, outcomes and the end of the turn.
 */
export function actionEndDraft(params: ActionEndParams): StepDraft<ActionEndParams> {
  return { params, type: KERNEL_STEPS.actionEnd };
}

/**
 * Returns the step that checks scenario triggers one at a time.
 */
export function scenarioCheckDraft(firings: readonly TriggerFiring[] = []): StepDraft<ScenarioCheckParams> {
  return { params: { firings }, type: KERNEL_STEPS.scenarioCheck };
}

/**
 * Returns the step that checks the outcomes of the scenario.
 */
export function outcomeCheckDraft(): StepDraft {
  return { params: {}, type: KERNEL_STEPS.outcomeCheck };
}

/**
 * Returns the step that places a unit during deployment.
 */
export function unitPlaceDraft(params: UnitPlaceParams): StepDraft<UnitPlaceParams> {
  return { params, type: KERNEL_STEPS.unitPlace };
}

/**
 * Returns the step that finishes the deployment of a side.
 */
export function deploymentEndDraft(params: DeploymentEndParams): StepDraft<DeploymentEndParams> {
  return { params, type: KERNEL_STEPS.deploymentEnd };
}

/**
 * Returns the step that ends the battle because a side retreats or surrenders.
 */
export function giveUpDraft(params: GiveUpParams): StepDraft<GiveUpParams> {
  return { params, type: KERNEL_STEPS.giveUp };
}
