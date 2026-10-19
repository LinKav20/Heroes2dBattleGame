import type { CellId, ContentName, SideId, UnitId, VisibleTo } from '../ids/index.ts';
import type { JsonObject, JsonValue } from '../json/index.ts';
import type { Op, Predicate } from './expressions.ts';

/**
 * A scenario: a particular battle with its field, sides, units, variables, triggers and victory conditions. It does
 * not say who controls the sides.
 */
export interface Scenario {
  /** The full name of the scenario. */
  readonly name: ContentName;
  /** The ruleset of the battle. */
  readonly ruleset: ContentName;
  /** The field of the battle. */
  readonly field: ScenarioField;
  /** The sides in the order the scenario lists them. */
  readonly sides: readonly ScenarioSide[];
  /** The variables and their initial values, by local name. */
  readonly variables: Readonly<Record<string, ScenarioValue>>;
  /** The triggers in the order of declaration. */
  readonly triggers: readonly ScenarioTrigger[];
  /** The conditions that end the battle. */
  readonly outcomes: readonly OutcomeCondition[];
  /** The initial data of extensions, such as a siege, by the full name of the extension. */
  readonly extensions: Readonly<Record<string, JsonValue>>;
}

/**
 * The value of a scenario variable.
 */
export type ScenarioValue = boolean | number | string;

/**
 * The field of a scenario.
 */
export interface ScenarioField {
  /** The full name of the field topology in the registry, for example `rules-stdlib:hex`. */
  readonly topology: string;
  /** The parameters of the topology, such as the size of the field. */
  readonly params: JsonObject;
  /** The battlefield whose effects act on the whole battle, if any. */
  readonly battlefield?: ContentName;
  /** The obstacles on the field. */
  readonly obstacles: readonly ScenarioObstacle[];
  /** The hazard zones on the field. */
  readonly hazards: readonly ScenarioHazard[];
}

/**
 * An obstacle placed on the field.
 */
export interface ScenarioObstacle {
  /** The local name of the obstacle. */
  readonly id: string;
  /** The definition of the obstacle. */
  readonly obstacle: ContentName;
  /** The cells the obstacle takes. */
  readonly cells: readonly CellId[];
}

/**
 * A hazard zone: cells whose effects act on the units that enter or stand in them.
 */
export interface ScenarioHazard {
  /** The local name of the zone. */
  readonly id: string;
  /** The cells of the zone. */
  readonly cells: readonly CellId[];
  /** The effects of the zone. */
  readonly effects: readonly ContentName[];
  /** Which sides see the zone. */
  readonly visibleTo: VisibleTo;
}

/**
 * A side of a scenario.
 */
export interface ScenarioSide {
  /** The local name of the side. */
  readonly id: SideId;
  /** The cells where the side deploys its units. */
  readonly deploymentZone: readonly CellId[];
  /** The units of the side in the order the scenario lists them. */
  readonly units: readonly ScenarioUnit[];
  /** The effects of the side itself. */
  readonly effects: readonly ContentName[];
  /** The abilities of the side itself. */
  readonly abilities: readonly ContentName[];
}

/**
 * A unit of a scenario.
 */
export interface ScenarioUnit {
  /** The local name of the unit. */
  readonly id: UnitId;
  /** The creature of the unit. */
  readonly creature: ContentName;
  /** The number of creatures. */
  readonly count: number;
  /** The cell of the unit; without it the unit is placed during deployment. */
  readonly cell?: CellId;
  /** The direction the unit faces, in the terms of the field topology. */
  readonly facing?: string;
  /** The effects the unit starts with. */
  readonly effects: readonly ContentName[];
  /** The items the unit starts with. */
  readonly items: readonly ScenarioItem[];
  /** Which sides see the unit at the start. */
  readonly visibleTo: VisibleTo;
}

/**
 * Items a unit starts with.
 */
export interface ScenarioItem {
  /** The definition of the item. */
  readonly item: ContentName;
  /** The number of items. */
  readonly count: number;
  /** The equipment slot the item takes at the start, if it is equipped. */
  readonly slot?: string;
  /** The charges left, if the item has charges and not all of them are left. */
  readonly charges?: number;
}

/**
 * A scenario trigger: "when this happens and that holds, do this".
 */
export interface ScenarioTrigger {
  /** The local name of the trigger. */
  readonly id: string;
  /**
   * The full name of the kind of event, or of a moment of the battle from `BATTLE_MOMENTS`, that the trigger waits for:
   * the start of the battle, or the start or the end of a round or a turn. The moment `kernel:turn-end` comes after the
   * event `kernel:turn-ended`, which carries `waited` and `skipped`, and after the counts of the end of the turn.
   * A trigger that waits for `kernel:unit-placed`, `kernel:battle-ended` or an event of running a command, such as
   * `kernel:roll-made`, would never fire, so it is an error of the content.
   */
  readonly on: string;
  /** The trigger fires only if this condition holds. */
  readonly condition?: Predicate;
  /** The operations to run. */
  readonly ops: readonly Op[];
  /** Triggers with a higher priority fire first, and of equal ones the earlier declared. */
  readonly priority: number;
  /** The largest number of times the trigger fires, if limited. */
  readonly limit?: number;
}

/**
 * A condition that ends the battle.
 */
export interface OutcomeCondition {
  /** The local name of the condition. */
  readonly id: string;
  /** What the battle ends with: a victory or a defeat of the side, or a draw. */
  readonly outcome: 'defeat' | 'draw' | 'victory';
  /** The side that wins or loses; a draw has no side. */
  readonly side?: SideId;
  /** The condition, for example "the side is destroyed" or "20 rounds have passed". */
  readonly condition: Predicate;
}
