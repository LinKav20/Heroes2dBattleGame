import type { CellId, ContentName, UnitId } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { SideTarget, UnitTarget } from './input-requests.ts';

/**
 * A command that changes the state directly, bypassing the rules of the game. The kernel checks only that the state
 * stays consistent.
 */
export interface StateEditCommand {
  /** The kind of command. */
  readonly kind: 'edit';
  /** The change. */
  readonly edit: StateEdit;
}

/**
 * A change of the state that bypasses the rules of the game.
 */
export type StateEdit = ApplyEffectEdit | MoveUnitEdit | RemoveEffectEdit | SetHealthEdit | SetResourceEdit;

/**
 * Set how many creatures a unit has and the health of the one that takes damage first.
 */
export interface SetHealthEdit {
  /** The kind of edit. */
  readonly type: 'set-health';
  /** The unit. */
  readonly unit: UnitId;
  /** The number of creatures. */
  readonly count: number;
  /** The health of the creature that takes damage first. */
  readonly health: number;
}

/**
 * Set a resource of a unit.
 */
export interface SetResourceEdit {
  /** The kind of edit. */
  readonly type: 'set-resource';
  /** The unit. */
  readonly unit: UnitId;
  /** The resource. */
  readonly resource: string;
  /** The new value. */
  readonly value: number;
}

/**
 * Apply an effect to a unit or a side.
 */
export interface ApplyEffectEdit {
  /** The kind of edit. */
  readonly type: 'apply-effect';
  /** The unit or the side. */
  readonly target: SideTarget | UnitTarget;
  /** The effect. */
  readonly effect: ContentName;
  /** The values to apply the effect with, such as its strength. */
  readonly params: JsonObject;
}

/**
 * Remove an applied effect from a unit or a side.
 */
export interface RemoveEffectEdit {
  /** The kind of edit. */
  readonly type: 'remove-effect';
  /** The unit or the side. */
  readonly target: SideTarget | UnitTarget;
  /** The identifier of the applied effect. */
  readonly effect: number;
}

/**
 * Move a unit to a cell.
 */
export interface MoveUnitEdit {
  /** The kind of edit. */
  readonly type: 'move-unit';
  /** The unit. */
  readonly unit: UnitId;
  /** The cell. */
  readonly cell: CellId;
  /** The direction the unit faces, if the topology has directions. */
  readonly facing?: string;
}
