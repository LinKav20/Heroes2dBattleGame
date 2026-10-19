import type { CellId, ContentName, SideId, UnitId } from '../ids/index.ts';
import type { JsonValue } from '../json/index.ts';
import type { Target } from './input-requests.ts';

/**
 * A command that the rules of the game allow or forbid. It is allowed only if it is in the list of available actions.
 */
export type GameCommand
  = | AttackCommand
    | DefendCommand
    | EndTurnCommand
    | ExtensionCommand
    | FinishDeploymentCommand
    | MoveCommand
    | PlaceUnitCommand
    | RetreatCommand
    | ShootCommand
    | StartBattleCommand
    | SurrenderCommand
    | UseAbilityCommand
    | UseItemCommand
    | WaitCommand;

/**
 * Place a unit in the deployment zone of its side.
 */
export interface PlaceUnitCommand {
  /** The kind of command. */
  readonly kind: 'game';
  /** The game action. */
  readonly type: 'place-unit';
  /** The unit to place. */
  readonly unit: UnitId;
  /** The cell to place it in. */
  readonly cell: CellId;
  /** The direction the unit faces, if the topology has directions. */
  readonly facing?: string;
}

/**
 * Say that a side has finished deployment.
 */
export interface FinishDeploymentCommand {
  /** The kind of command. */
  readonly kind: 'game';
  /** The game action. */
  readonly type: 'finish-deployment';
  /** The side. */
  readonly side: SideId;
}

/**
 * Start a battle in which no side has units to deploy.
 */
export interface StartBattleCommand {
  /** The kind of command. */
  readonly kind: 'game';
  /** The game action. */
  readonly type: 'start-battle';
}

/**
 * Move a unit to a cell.
 */
export interface MoveCommand {
  /** The kind of command. */
  readonly kind: 'game';
  /** The game action. */
  readonly type: 'move';
  /** The unit to move. */
  readonly unit: UnitId;
  /** The cell to move to. */
  readonly to: CellId;
  /** The direction to face at the end, if the topology has directions. */
  readonly facing?: string;
}

/**
 * Attack a unit in melee.
 */
export interface AttackCommand {
  /** The kind of command. */
  readonly kind: 'game';
  /** The game action. */
  readonly type: 'attack';
  /** The attacking unit. */
  readonly unit: UnitId;
  /** The unit to attack. */
  readonly target: UnitId;
  /** The cell to attack from, if the unit has to move first. */
  readonly from?: CellId;
  /** The direction to face in that cell, if the topology has directions. */
  readonly facing?: string;
}

/**
 * Shoot at a unit.
 */
export interface ShootCommand {
  /** The kind of command. */
  readonly kind: 'game';
  /** The game action. */
  readonly type: 'shoot';
  /** The shooting unit. */
  readonly unit: UnitId;
  /** The unit to shoot at. */
  readonly target: UnitId;
}

/**
 * Use an ability of a unit or of a side.
 */
export interface UseAbilityCommand {
  /** The kind of command. */
  readonly kind: 'game';
  /** The game action. */
  readonly type: 'use-ability';
  /** The ability. */
  readonly ability: ContentName;
  /** The unit that uses the ability; without it, the side uses its own ability. */
  readonly unit?: UnitId;
  /** The side that uses its own ability. */
  readonly side?: SideId;
  /** The chosen targets. */
  readonly targets: readonly Target[];
}

/**
 * Use an item from the inventory of a unit.
 */
export interface UseItemCommand {
  /** The kind of command. */
  readonly kind: 'game';
  /** The game action. */
  readonly type: 'use-item';
  /** The unit that uses the item. */
  readonly unit: UnitId;
  /** The identifier of the item in the inventory. */
  readonly item: number;
  /** The ability of the item to use; required if the item gives more than one. */
  readonly ability?: ContentName;
  /** The chosen targets. */
  readonly targets: readonly Target[];
}

/**
 * Put off the turn of a unit until later in the round.
 */
export interface WaitCommand {
  /** The kind of command. */
  readonly kind: 'game';
  /** The game action. */
  readonly type: 'wait';
  /** The unit. */
  readonly unit: UnitId;
}

/**
 * Make a unit defend as the defense of the ruleset says.
 */
export interface DefendCommand {
  /** The kind of command. */
  readonly kind: 'game';
  /** The game action. */
  readonly type: 'defend';
  /** The unit. */
  readonly unit: UnitId;
}

/**
 * End the turn of the side or the unit that has it, even if it could still act. The ruleset decides when this is
 * allowed.
 */
export interface EndTurnCommand {
  /** The kind of command. */
  readonly kind: 'game';
  /** The game action. */
  readonly type: 'end-turn';
  /** The side whose turn ends, if the turn belongs to a side. */
  readonly side?: SideId;
  /** The unit whose turn ends, if the turn belongs to a unit. */
  readonly unit?: UnitId;
}

/**
 * Make a side retreat from the battle.
 */
export interface RetreatCommand {
  /** The kind of command. */
  readonly kind: 'game';
  /** The game action. */
  readonly type: 'retreat';
  /** The side. */
  readonly side: SideId;
}

/**
 * Make a side give up.
 */
export interface SurrenderCommand {
  /** The kind of command. */
  readonly kind: 'game';
  /** The game action. */
  readonly type: 'surrender';
  /** The side. */
  readonly side: SideId;
}

/**
 * A game command that an extension declares. The extension describes its payload with a schema.
 */
export interface ExtensionCommand {
  /** The kind of command. */
  readonly kind: 'game';
  /** The game action. */
  readonly type: 'extension';
  /** The full name of the command, for example `acme-frost:freeze`. */
  readonly name: string;
  /** The payload of the command. */
  readonly payload: JsonValue;
  /** The side that acts, if the command is made for a side; the access policy checks it. */
  readonly side?: SideId;
  /** The unit that acts, if the command is made for a unit; the access policy checks it. */
  readonly unit?: UnitId;
}
