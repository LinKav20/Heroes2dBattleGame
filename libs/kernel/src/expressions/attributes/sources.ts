import type { ContentRegistry, Effect, Predicate } from '../../content/index.ts';
import type { Subjects } from '../../extensions/index.ts';
import type { ContentName } from '../../ids/index.ts';
import type { AppliedEffect, BattleState, Target, Unit } from '../../model/index.ts';
import { ownValue } from '../../shared/index.ts';

/**
 * An effect whose modifiers may change an attribute of a unit, with the participants of its formulas.
 */
export interface ModifierSource {
  /** The definition of the effect. */
  readonly effect: Effect;
  /** How many times the effect is stacked. */
  readonly stacks: number;
  /** The participants: the holder of the effect as `self`, the unit as `target` and the one that applied it. */
  readonly subjects: Subjects;
  /** The condition the effect acts under, if it has one. */
  readonly activeWhile?: Predicate;
}

/**
 * Returns the effects that act on a unit, in the order of application: the effects of its creature, of the
 * battlefield and of its items first, then the applied effects of the unit, its side and the field by the order they
 * were applied. An item with an equipment slot acts only while it is equipped.
 *
 * An effect acts while its `activeWhile` holds; the mark `active` of an applied effect is not read.
 *
 * @throws {TypeError} If the content has no definition of an effect, a creature or an item.
 */
export function modifierSources(state: BattleState, content: ContentRegistry, unit: Unit): readonly ModifierSource[] {
  const self: Target = { kind: 'unit', unit: unit.id };
  const creature = ownValue(content.creatures, unit.creature);

  if (creature === undefined) throw new TypeError(`The content has no creature ${JSON.stringify(unit.creature)}.`);

  const battlefield = battlefieldEffects(state, content);
  const items = itemEffects(content, unit);
  const side: Target = { kind: 'side', side: unit.side };
  const sideEffects = state.sides.find(({ id }) => id === unit.side)?.effects ?? [];
  const applied: ReadonlyArray<{ readonly effect: AppliedEffect; readonly holder: Target | undefined }> = [
    ...unit.effects.map((effect) => ({ effect, holder: self })),
    ...sideEffects.map((effect) => ({ effect, holder: side })),
    ...state.field.effects.map((effect) => ({ effect, holder: undefined })),
  ].toSorted((left, right) => left.effect.id - right.effect.id);

  return [
    ...creature.effects.map((name) => fromDefinition(content, name, { self, target: self })),
    ...battlefield.map((name) => fromDefinition(content, name, { target: self })),
    ...items.map((name) => fromDefinition(content, name, { self, target: self })),
    ...applied.map(({ effect, holder }) => fromApplied(content, effect, holder, self)),
  ];
}

/**
 * Returns the effects of the battlefield of the battle.
 *
 * @throws {TypeError} If the content has no definition of the battlefield.
 */
export function battlefieldEffects(state: BattleState, content: ContentRegistry): readonly ContentName[] {
  return state.field.battlefield === undefined
    ? []
    : definition(content.battlefields, state.field.battlefield, 'battlefield').effects;
}

/**
 * Returns the effects of the items of a unit; an item with an equipment slot gives its effects only while equipped.
 *
 * @throws {TypeError} If the content has no definition of an item.
 */
export function itemEffects(content: ContentRegistry, unit: Unit): readonly ContentName[] {
  return unit.inventory.flatMap((carried) => {
    const item = definition(content.items, carried.item, 'item');

    return item.slot === undefined || carried.slot !== undefined ? item.effects : [];
  });
}

function fromDefinition(content: ContentRegistry, name: ContentName, subjects: Subjects): ModifierSource {
  const effect = definition(content.effects, name, 'effect');

  return effect.activeWhile === undefined
    ? { effect, stacks: 1, subjects }
    : { activeWhile: effect.activeWhile, effect, stacks: 1, subjects };
}

function fromApplied(
  content: ContentRegistry,
  applied: AppliedEffect,
  holder: Target | undefined,
  target: Target,
): ModifierSource {
  const source = sourceOf(applied);
  const subjects: Subjects = {
    ...(holder === undefined ? {} : { self: holder }),
    ...(source === undefined ? {} : { source }),
    target,
  };

  const effect = definition(content.effects, applied.effect, 'effect');

  return effect.activeWhile === undefined
    ? { effect, stacks: applied.stacks, subjects }
    : { activeWhile: effect.activeWhile, effect, stacks: applied.stacks, subjects };
}

function sourceOf(applied: AppliedEffect): Target | undefined {
  if (applied.sourceUnit !== undefined) return { kind: 'unit', unit: applied.sourceUnit };

  return applied.sourceSide === undefined ? undefined : { kind: 'side', side: applied.sourceSide };
}

function definition<Definition>(
  table: Readonly<Record<ContentName, Definition>>,
  name: ContentName,
  what: string,
): Definition {
  const found = ownValue(table, name);

  if (found === undefined) throw new TypeError(`The content has no ${what} ${JSON.stringify(name)}.`);

  return found;
}
