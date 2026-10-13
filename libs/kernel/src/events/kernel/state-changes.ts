import type { SideId, UnitId } from '../../ids/index.ts';
import type { AppliedEffect, BattleState, EffectHolder, Hazard, Side, Unit } from '../../model/index.ts';

/**
 * Returns the state with one unit replaced by the result of `change`.
 *
 * @throws {RangeError} If the state has no unit with this identifier.
 */
export function changeUnit(state: BattleState, unit: UnitId, change: (current: Unit) => Unit): BattleState {
  if (!state.units.some(({ id }) => id === unit)) throw new RangeError(`The battle has no unit "${unit}".`);

  return { ...state, units: state.units.map((current) => (current.id === unit ? change(current) : current)) };
}

/**
 * Returns the state with one side replaced by the result of `change`.
 *
 * @throws {RangeError} If the state has no side with this identifier.
 */
export function changeSide(state: BattleState, side: SideId, change: (current: Side) => Side): BattleState {
  if (!state.sides.some(({ id }) => id === side)) throw new RangeError(`The battle has no side "${side}".`);

  return { ...state, sides: state.sides.map((current) => (current.id === side ? change(current) : current)) };
}

/**
 * Returns the state with one hazard zone replaced by the result of `change`.
 *
 * @throws {RangeError} If the field has no hazard zone with this identifier.
 */
export function changeHazard(state: BattleState, hazard: string, change: (current: Hazard) => Hazard): BattleState {
  if (!state.field.hazards.some(({ id }) => id === hazard)) {
    throw new RangeError(`The field has no hazard zone "${hazard}".`);
  }

  const hazards = state.field.hazards.map((current) => (current.id === hazard ? change(current) : current));

  return { ...state, field: { ...state.field, hazards } };
}

/**
 * Returns the state with the applied effects of one holder replaced by the result of `change`.
 *
 * @throws {RangeError} If the holder does not exist.
 */
export function changeEffects(
  state: BattleState,
  holder: EffectHolder,
  change: (effects: readonly AppliedEffect[]) => readonly AppliedEffect[],
): BattleState {
  switch (holder.kind) {
    case 'field': {
      return { ...state, field: { ...state.field, effects: change(state.field.effects) } };
    }

    case 'hazard': {
      return changeHazard(state, holder.hazard, (hazard) => ({ ...hazard, effects: change(hazard.effects) }));
    }

    case 'side': {
      return changeSide(state, holder.side, (side) => ({ ...side, effects: change(side.effects) }));
    }

    case 'unit': {
      return changeUnit(state, holder.unit, (unit) => ({ ...unit, effects: change(unit.effects) }));
    }

    default: {
      throw new TypeError('Unknown kind of effect holder.');
    }
  }
}

/**
 * Returns the list with the element that has the identifier of `next` replaced by `next`.
 *
 * @throws {RangeError} If the list has no element with this identifier.
 */
export function replaceById<Item extends { readonly id: number }>(
  items: readonly Item[],
  next: Item,
  what: string,
): readonly Item[] {
  if (!items.some(({ id }) => id === next.id)) throw new RangeError(`There is no ${what} ${String(next.id)}.`);

  return items.map((item) => (item.id === next.id ? next : item));
}

/**
 * Returns the list without the element with the identifier.
 *
 * @throws {RangeError} If the list has no element with this identifier.
 */
export function removeById<Item extends { readonly id: number }>(
  items: readonly Item[],
  id: number,
  what: string,
): readonly Item[] {
  if (!items.some((item) => item.id === id)) throw new RangeError(`There is no ${what} ${String(id)}.`);

  return items.filter((item) => item.id !== id);
}

/**
 * Checks that an identifier is the next number of the state and returns the number after it.
 *
 * @throws {RangeError} If the identifier is not the next number.
 */
export function takeId(state: BattleState, id: number): number {
  if (id !== state.nextId) {
    throw new RangeError(`The next identifier is ${String(state.nextId)}, but the event uses ${String(id)}.`);
  }

  return id + 1;
}
