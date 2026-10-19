import type { Item } from '../content/index.ts';
import type { SideId, UnitId } from '../ids/index.ts';
import type { Hazard } from './field.ts';
import type { InventoryItem } from './inventory.ts';
import type { Side } from './sides.ts';
import type { BattleState } from './state.ts';
import type { Unit } from './units.ts';

/**
 * Returns a unit of the battle, or nothing if there is no such unit.
 */
export function findUnit(state: BattleState, unit: UnitId): Unit | undefined {
  return state.units.find(({ id }) => id === unit);
}

/**
 * Returns a side of the battle, or nothing if there is no such side.
 */
export function findSide(state: BattleState, side: SideId): Side | undefined {
  return state.sides.find(({ id }) => id === side);
}

/**
 * Returns a hazard zone of the field, or nothing if there is no such zone.
 */
export function findHazard(state: BattleState, hazard: string): Hazard | undefined {
  return state.field.hazards.find(({ id }) => id === hazard);
}

/**
 * Returns an item of the inventory of a unit, or nothing if the unit has no such item.
 */
export function unitItem(unit: Unit, item: number): InventoryItem | undefined {
  return unit.inventory.find(({ id }) => id === item);
}

/**
 * Returns a unit of the battle.
 *
 * @throws {TypeError} If the battle has no such unit: a step or its parameters refer to it wrongly.
 */
export function battleUnit(state: BattleState, unit: UnitId): Unit {
  const found = findUnit(state, unit);

  if (found === undefined) throw new TypeError(`The battle has no unit ${JSON.stringify(unit)}.`);

  return found;
}

/**
 * Returns a side of the battle.
 *
 * @throws {TypeError} If the battle has no such side: a step or its parameters refer to it wrongly.
 */
export function battleSide(state: BattleState, side: SideId): Side {
  const found = findSide(state, side);

  if (found === undefined) throw new TypeError(`The battle has no side ${JSON.stringify(side)}.`);

  return found;
}

/**
 * Tells whether a unit stands on the field: it is alive and has a cell. Only such a unit takes cells, moves, creates
 * auras and stands in zones.
 */
export function standsOnField(unit: Unit): boolean {
  return unit.count > 0 && unit.cell !== undefined;
}

/**
 * Tells whether an item of a unit gives its effects and abilities: an item with an equipment slot gives them only while
 * it is equipped.
 */
export function isWorn(definition: Item, item: InventoryItem): boolean {
  return definition.slot === undefined || item.slot !== undefined;
}
