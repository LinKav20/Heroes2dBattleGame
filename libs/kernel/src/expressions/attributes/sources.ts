import {
  creatureDefinition,
  definitionOf,
  effectDefinition,
  itemDefinition,
  type ContentRegistry,
  type Effect,
} from '../../content/index.ts';
import type { Subjects } from '../../extensions/index.ts';
import type { ContentName, SideId } from '../../ids/index.ts';
import {
  battleSide,
  battleUnit,
  findSide,
  isWorn,
  type AppliedEffect,
  type BattleState,
  type SideTarget,
  type Target,
  type Unit,
  type UnitTarget,
} from '../../model/index.ts';
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
 * creature, of the battlefield, of its items and of the auras that cover it first, then the applied effects of the
 * unit, its side, the field and the hazard zones it stands in by the order they were applied. For a side: the effects
 * of the battlefield, then the applied effects of the side and the field. An item with an equipment slot acts only
 * while it is equipped.
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
    battleSide(state, of.side);

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
    ...auraEffects(content, unit).map((name) => fromDefinition(content, name, { self: of, target: of })),
    ...appliedOf(state, unit.side, unit).map(({ applied, holder }) => fromApplied(content, applied, holder, of)),
  ];
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
 * Returns the effects that act on a unit as its own: the permanent effects of its creature, the effects of its items
 * and the effects of the auras that cover it, except those it already has from its creature or items. An item with an
 * equipment slot gives its effects only while equipped.
 *
 * @throws {ContentError} If the content has no definition of the creature or an item.
 */
export function unitDefinitionEffects(content: ContentRegistry, unit: Unit): readonly ContentName[] {
  return [...ownDefinitionEffects(content, unit), ...auraEffects(content, unit)];
}

/**
 * Returns the effects of a unit that are its own and not of the auras that cover it: the permanent effects of its
 * creature and the effects of its items. Only they can create auras.
 *
 * @throws {ContentError} If the content has no definition of the creature or an item.
 */
export function ownDefinitionEffects(content: ContentRegistry, unit: Unit): readonly ContentName[] {
  return [...creatureEffects(content, unit), ...itemEffects(content, unit)];
}

function auraEffects(content: ContentRegistry, unit: Unit): readonly ContentName[] {
  if (unit.auras.length === 0) return [];

  const own = ownDefinitionEffects(content, unit);

  return unit.auras.filter((name) => !own.includes(name));
}

function creatureEffects(content: ContentRegistry, unit: Unit): readonly ContentName[] {
  return creatureDefinition(content, unit.creature).effects;
}

function itemEffects(content: ContentRegistry, unit: Unit): readonly ContentName[] {
  return unit.inventory.flatMap((carried) => {
    const item = itemDefinition(content, carried.item);

    return isWorn(item, carried) ? item.effects : [];
  });
}

function appliedOf(state: BattleState, side: SideId, unit: Unit | undefined): readonly HeldApplied[] {
  const sideTarget: Target = { kind: 'side', side };
  const sideEffects = findSide(state, side)?.effects ?? [];
  const unitTarget: Target | undefined = unit === undefined ? undefined : { kind: 'unit', unit: unit.id };

  const zoneEffects = state.field.hazards
    .filter(({ id }) => unit?.zones.includes(id) === true)
    .flatMap(({ effects }) => effects);

  return [
    ...(unit?.effects ?? []).map((applied) => ({ applied, holder: unitTarget })),
    ...sideEffects.map((applied) => ({ applied, holder: sideTarget })),
    ...[...state.field.effects, ...zoneEffects].map((applied) => ({ applied, holder: undefined })),
  ].toSorted((left, right) => left.applied.id - right.applied.id);
}

function fromDefinition(content: ContentRegistry, name: ContentName, subjects: Subjects): ModifierSource {
  return { effect: effectDefinition(content, name), stacks: 1, subjects };
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
  const effect = effectDefinition(content, applied.effect);

  return { applied, effect, stacks: applied.stacks, subjects };
}
