import type { CellId, ContentName, SideId, UnitId } from '../ids/index.ts';
import type { BattleEvent, SideTarget, TurnHolder, TurnRecord, UnitTarget } from '../model/index.ts';
import type { BATTLE_MOMENTS } from '../names/index.ts';

/**
 * The parameters of `kernel:turn-start`: the turn of a side or a unit starts.
 */
export interface TurnStartParams {
  /** The side or the unit that gets the turn. */
  readonly holder: TurnHolder;
}

/**
 * The parameters of `kernel:turn-end`: the turn of a side or a unit ends, if it still has the turn, and is recorded
 * so.
 */
export type TurnEndParams = TurnRecord;

/**
 * The parameters of `kernel:turn-check`: the turn ends if the step says so, or if the side or the unit that has it
 * can do nothing more. The step does nothing if nobody has the turn or another side or unit has it.
 */
export interface TurnCheckParams {
  /** The side or the unit whose turn is checked; the one that has the turn when the step runs if not given. */
  readonly holder?: TurnHolder;
  /** Whether the turn ends in any case. */
  readonly end?: boolean;
}

/**
 * The parameters of `kernel:turn-check` as the kernel puts it at the start of a turn: a turn that ends there ends
 * before the side or the unit could act.
 */
export interface StartCheckParams extends TurnCheckParams {
  /** Whether the check comes at the start of the turn. */
  readonly start?: boolean;
}

/**
 * The parameters of `kernel:turn-counts`: the counts of a turn for its participants, one participant at a time.
 */
export interface TurnCountsParams {
  /** What is counted: the uses and actions of abilities, only actions, or durations at the start or the end. */
  readonly counts: 'abilities' | 'actions' | 'effects-end' | 'effects-start';
  /** The participants left, in order. */
  readonly holders: readonly TurnHolder[];
}

/**
 * The parameters of `kernel:action-end`: the end of a game action of a side or a unit.
 */
export interface ActionEndParams {
  /** The side or the unit that had the turn when the command was planned. */
  readonly holder: TurnHolder;
  /** How the command ends the turn: `ended` ends it, `waited` ends it as put off; without it, the kernel checks. */
  readonly end?: 'ended' | 'waited';
}

/**
 * A moment of the battle when the kernel asks the order of turns for steps of its own.
 */
export type HookMoment = (typeof BATTLE_MOMENTS)[keyof typeof BATTLE_MOMENTS];

/**
 * The parameters of `kernel:turn-order-hook`: the kernel asks the order of turns for its steps at a moment.
 */
export interface TurnOrderHookParams {
  /** The moment. */
  readonly moment: HookMoment;
  /** The side or the unit whose turn starts or ends, for the moments of a turn. */
  readonly holder?: TurnHolder;
}

/**
 * The parameters of `kernel:scenario-check`: scenario triggers that may fire, checked one at a time.
 */
export interface ScenarioCheckParams {
  /** The triggers in the order they are checked. */
  readonly firings: readonly TriggerFiring[];
}

/**
 * A scenario trigger that may fire: its event or moment has come.
 */
export interface TriggerFiring {
  /** The local name of the trigger. */
  readonly trigger: string;
  /** The unit or the side the event or the moment is about, if any. */
  readonly target?: SideTarget | UnitTarget;
  /** The event the trigger waits for, if it waits for an event and not a moment. */
  readonly event?: BattleEvent;
}

/**
 * The parameters of `kernel:move`: a unit moves along a path that the command has checked.
 */
export interface MoveParams {
  /** The unit. */
  readonly unit: UnitId;
  /** The cells the unit passes, ending with the cell where it stops; none if it only turns. */
  readonly path: readonly CellId[];
  /** The direction the unit faces at the end, if it changes. */
  readonly facing?: string;
  /** The actions of the turn the move spends, by the full name of the kind of action. */
  readonly spent: Readonly<Record<ContentName, number>>;
}

/**
 * The parameters of `kernel:spend-actions`: a unit spends actions of its turn.
 */
export interface SpendActionsParams {
  /** The unit. */
  readonly unit: UnitId;
  /** How many actions of every kind the unit spends, by the full name of the kind of action; each from 0. */
  readonly spent: Readonly<Record<ContentName, number>>;
}

/**
 * The parameters of `kernel:unit-place`: a unit is placed during deployment.
 */
export interface UnitPlaceParams {
  /** The unit. */
  readonly unit: UnitId;
  /** The cell. */
  readonly cell: CellId;
  /** The direction the unit faces, if the topology has directions. */
  readonly facing?: string;
}

/**
 * The parameters of `kernel:deployment-end`: a side has finished deployment.
 */
export interface DeploymentEndParams {
  /** The side. */
  readonly side: SideId;
}

/**
 * The parameters of `kernel:give-up`: a side retreats or surrenders, and the battle ends.
 */
export interface GiveUpParams {
  /** The side. */
  readonly side: SideId;
  /** Whether the side retreats or surrenders. */
  readonly kind: 'retreat' | 'surrender';
}
