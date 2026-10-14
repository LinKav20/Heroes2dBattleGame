import { definitionOf, type ContentRegistry, type Effect } from '../../content/index.ts';
import type { Subjects } from '../../extensions/index.ts';
import type { ContentName, SideId, UnitId } from '../../ids/index.ts';
import type { AppliedEffect, BattleState, SideTarget, Target, Unit, UnitTarget } from '../../model/index.ts';
import { appliedSource } from '../subjects.ts';

/**
 * An effect that acts on a unit or a side, with the participants of its formulas and conditions.
 */
export interface ModifierSource {
  /** The definition of the effect. */
  readonly effect: Effect;
  /** How many times the effect is stacked. */
  readonly stacks: number;
  /** The participants: the holder of the effect as `self`, the unit or the side as `target`, and its source. */
  readonly subjects: Subjects;
  /** The applied effect, if the effect is not one of a definition. */
  readonly applied?: AppliedEffect;
}

interface HeldApplied {
  readonly applied: AppliedEffect;
  readonly holder: Target | undefined;
}

/**
 * Returns the effects that act on a unit or a side, in the order of application. For a unit: the effects of its
 * creature, of the battlefield and of its items first, then the applied effects of the unit, its side and the field by
 * the order they were applied. For a side: the effects of the battlefield, then the applied effects of the side and the
 * field. An item with an equipment slot acts only while it is equipped.
 *
 * Whether an effect acts now is decided by its condition of activity, which the caller evaluates.
 *
 * @throws {TypeError} If the unit or the side is not in the battle.
 * @throws {ContentError} If the content has no definition of an effect, a creature, an item or the battlefield.
 */
export function modifierSources(
  state: BattleState,
  content: ContentRegistry,
  of: SideTarget | UnitTarget,
): readonly ModifierSource[] {
  const battlefield = battlefieldEffects(state, content);

  if (of.kind === 'side') {
    if (!state.sides.some(({ id }) => id === of.side)) {
      throw new TypeError(`The battle has no side ${JSON.stringify(of.side)}.`);
    }

    return [
      ...battlefield.map((name) => fromDefinition(content, name, { target: of })),
      ...appliedOf(state, of.side, undefined).map(({ applied, holder }) => fromApplied(content, applied, holder, of)),
    ];
  }

  const unit = battleUnit(state, of.unit);

  return [
    ...creatureEffects(content, unit).map((name) => fromDefinition(content, name, { self: of, target: of })),
    ...battlefield.map((name) => fromDefinition(content, name, { target: of })),
    ...itemEffects(content, unit).map((name) => fromDefinition(content, name, { self: of, target: of })),
    ...appliedOf(state, unit.side, unit).map(({ applied, holder }) => fromApplied(content, applied, holder, of)),
  ];
}

/**
 * Returns a unit of the battle.
 *
 * @throws {TypeError} If the battle has no such unit: a step or its parameters refer to it wrongly.
 */
export function battleUnit(state: BattleState, unit: UnitId): Unit {
  const found = state.units.find(({ id }) => id === unit);

  if (found === undefined) throw new TypeError(`The battle has no unit ${JSON.stringify(unit)}.`);

  return found;
}

/**
 * Returns the effects of the battlefield of the battle.
 *
 * @throws {ContentError} If the content has no definition of the battlefield.
 */
export function battlefieldEffects(state: BattleState, content: ContentRegistry): readonly ContentName[] {
  return state.field.battlefield === undefined
    ? []
    : definitionOf(content.battlefields, state.field.battlefield, 'battlefield').effects;
}

/**
 * Returns the permanent effects of the creature of a unit and the effects of its items; an item with an equipment
 * slot gives its effects only while equipped.
 *
 * @throws {ContentError} If the content has no definition of the creature or an item.
 */
export function unitDefinitionEffects(content: ContentRegistry, unit: Unit): readonly ContentName[] {
  return [...creatureEffects(content, unit), ...itemEffects(content, unit)];
}

function creatureEffects(content: ContentRegistry, unit: Unit): readonly ContentName[] {
  return definitionOf(content.creatures, unit.creature, 'creature').effects;
}

function itemEffects(content: ContentRegistry, unit: Unit): readonly ContentName[] {
  return unit.inventory.flatMap((carried) => {
    const item = definitionOf(content.items, carried.item, 'item');

    return item.slot === undefined || carried.slot !== undefined ? item.effects : [];
  });
}

function appliedOf(state: BattleState, side: SideId, unit: Unit | undefined): readonly HeldApplied[] {
  const sideTarget: Target = { kind: 'side', side };
  const sideEffects = state.sides.find(({ id }) => id === side)?.effects ?? [];
  const unitTarget: Target | undefined = unit === undefined ? undefined : { kind: 'unit', unit: unit.id };

  return [
    ...(unit?.effects ?? []).map((applied) => ({ applied, holder: unitTarget })),
    ...sideEffects.map((applied) => ({ applied, holder: sideTarget })),
    ...state.field.effects.map((applied) => ({ applied, holder: undefined })),
  ].toSorted((left, right) => left.applied.id - right.applied.id);
}

function fromDefinition(content: ContentRegistry, name: ContentName, subjects: Subjects): ModifierSource {
  return { effect: definitionOf(content.effects, name, 'effect'), stacks: 1, subjects };
}

function fromApplied(
  content: ContentRegistry,
  applied: AppliedEffect,
  holder: Target | undefined,
  target: SideTarget | UnitTarget,
): ModifierSource {
  const source = appliedSource(applied);
  const subjects: Subjects = {
    ...(holder === undefined ? {} : { self: holder }),
    ...(source === undefined ? {} : { source }),
    target,
  };
  const effect = definitionOf(content.effects, applied.effect, 'effect');

  return { applied, effect, stacks: applied.stacks, subjects };
}
