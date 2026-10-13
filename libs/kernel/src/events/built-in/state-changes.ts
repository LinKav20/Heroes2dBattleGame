import type { SideId, UnitId } from '../../ids/index.ts';
import type { AppliedEffect, BattleState, EffectHolder, Hazard, Side, Unit } from '../../model/index.ts';

/**
 * Returns the state with one unit replaced by the result of `change`.
 *
 * @throws {RangeError} If the state has no unit with this identifier.
 */
export function changeUnit(state: BattleState, unit: UnitId, change: (current: Unit) => Unit): BattleState {
  return { ...state, units: changeById(state.units, unit, change, 'unit') };
}

/**
 * Returns the state with one side replaced by the result of `change`.
 *
 * @throws {RangeError} If the state has no side with this identifier.
 */
export function changeSide(state: BattleState, side: SideId, change: (current: Side) => Side): BattleState {
  return { ...state, sides: changeById(state.sides, side, change, 'side') };
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
      const hazards = changeById(state.field.hazards, holder.hazard, (hazard: Hazard) => ({
        ...hazard,
        effects: change(hazard.effects),
      }), 'hazard zone');

      return { ...state, field: { ...state.field, hazards } };
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
 * Tells whether a list has an element with the identifier.
 */
export function hasId<Item extends { readonly id: unknown }>(items: readonly Item[], id: Item['id']): boolean {
  return items.some((item) => item.id === id);
}

/**
 * Returns the list with the element that has the identifier of `next` replaced by `next`.
 *
 * @throws {RangeError} If the list has no element with this identifier.
 */
export function replaceById<Item extends { readonly id: unknown }>(
  items: readonly Item[],
  next: Item,
  what: string,
): readonly Item[] {
  return changeById(items, next.id, () => next, what);
}

/**
 * Returns the list without the element with the identifier.
 *
 * @throws {RangeError} If the list has no element with this identifier.
 */
export function removeById<Item extends { readonly id: unknown }>(
  items: readonly Item[],
  id: Item['id'],
  what: string,
): readonly Item[] {
  requireId(items, id, what);

  return items.filter((item) => item.id !== id);
}

/**
 * Checks that an identifier of an applied effect, an item or a summoned unit is the next number of the state and
 * returns the number after it.
 *
 * @throws {RangeError} If the identifier is not the next number.
 */
export function takeId(state: BattleState, id: number): number {
  return nextAfter(state.nextId, id, 'identifier');
}

/**
 * Checks that the identifier of an input request is the next number of requests and returns the number after it.
 *
 * @throws {RangeError} If the identifier is not the next number.
 */
export function takeRequestId(state: BattleState, id: number): number {
  return nextAfter(state.nextRequestId, id, 'identifier of an input request');
}

function changeById<Item extends { readonly id: unknown }>(
  items: readonly Item[],
  id: Item['id'],
  change: (current: Item) => Item,
  what: string,
): readonly Item[] {
  requireId(items, id, what);

  return items.map((item) => (item.id === id ? change(item) : item));
}

function requireId<Item extends { readonly id: unknown }>(items: readonly Item[], id: Item['id'], what: string): void {
  if (!hasId(items, id)) throw new RangeError(`There is no ${what} ${JSON.stringify(id)}.`);
}

function nextAfter(expected: number, id: number, what: string): number {
  if (id !== expected) {
    throw new RangeError(`The next ${what} is ${String(expected)}, but the event uses ${String(id)}.`);
  }

  return id + 1;
}
