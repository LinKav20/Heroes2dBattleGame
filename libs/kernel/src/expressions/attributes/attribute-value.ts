import {
  ContentError,
  creatureDefinition,
  definitionOf,
  type Attribute,
  type ContentRegistry,
} from '../../content/index.ts';
import type { Evaluation, Expressions } from '../../extensions/index.ts';
import type { ContentName } from '../../ids/index.ts';
import { battleUnit, type BattleState, type SideTarget, type UnitTarget } from '../../model/index.ts';
import { ownValue } from '../../shared/index.ts';
import { attributeOutOfRange, evaluated } from '../results.ts';
import { applyModifiers, type ModifierValue } from './calculation.ts';
import type { ModifierSource } from './sources.ts';

/**
 * What calculating attributes and tags needs: the state, the content, the effects acting on a unit or a side and
 * whether each acts, both found once for the run of a step, and the evaluation of their formulas without dice rolls.
 */
export interface AttributeInput {
  /** The state. */
  readonly state: BattleState;
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** Returns the effects that act on a unit or a side in the order of application. */
  sources(of: SideTarget | UnitTarget): readonly ModifierSource[];
  /** Tells whether an effect acts now: its condition of activity holds, or it has none. */
  active(source: ModifierSource): Evaluation<boolean>;
  /** Returns the evaluation of the formulas of an effect with its participants and applied effect, without rolls. */
  scope(source: ModifierSource): Expressions;
}

/**
 * Calculates an attribute of a unit or a side: the base value of the creature of a unit, or 0 for a side, changed by
 * the modifiers of the effects that act on it, in the order of the rules. Only the effects with modifiers of this
 * attribute evaluate their conditions of activity.
 *
 * @throws {TypeError} If the unit or the side is not in the battle.
 * @throws {ContentError} If its creature or the attribute does not exist, the base value or the bounds are not safe
 * integers or the lowest bound is above the highest one, or a formula or a condition of an effect rolls dice.
 */
export function attributeValue(
  input: AttributeInput,
  of: SideTarget | UnitTarget,
  attribute: ContentName,
): Evaluation<number> {
  const { content, state } = input;
  const bounds = definitionOf(content.attributes, attribute, 'attribute');
  const base = of.kind === 'side' ? 0 : baseOf(input, of, attribute);
  const modifiers: ModifierValue[] = [];

  checkBounds(bounds, base);

  for (const source of input.sources(of)) {
    const own = source.effect.modifiers.filter((modifier) => modifier.attribute === attribute);

    if (own.length === 0) continue;

    const active = input.active(source);

    if (active.kind !== 'value') return active;

    if (!active.value) continue;

    const scope = input.scope(source);

    for (const modifier of own) {
      const value = scope.value(modifier.value);

      if (value.kind !== 'value') return value;

      modifiers.push({
        operation: modifier.operation,
        order: modifiers.length,
        priority: modifier.priority ?? 0,
        stacks: source.stacks,
        value: value.value,
        ...(modifier.bonusType === undefined ? {} : { bonusType: modifier.bonusType }),
        ...(modifier.stackingKey === undefined ? {} : { stackingKey: modifier.stackingKey }),
      });
    }
  }

  const result = applyModifiers(base, modifiers, bounds, state.ruleset.rounding);

  return result === undefined ? attributeOutOfRange(of, attribute) : evaluated(result);
}

/**
 * Tells whether an effect acts now in its scope: its condition of activity holds, or it has none.
 */
export function sourceActivity(scope: Expressions, source: ModifierSource): Evaluation<boolean> {
  const { activeWhile } = source.effect;

  return activeWhile === undefined ? evaluated(true) : scope.test(activeWhile);
}

function baseOf(input: AttributeInput, of: UnitTarget, attribute: ContentName): number {
  const unit = battleUnit(input.state, of.unit);

  return ownValue(creatureDefinition(input.content, unit.creature).attributes, attribute) ?? 0;
}

function checkBounds(attribute: Attribute, base: number): void {
  const { max, min, name } = attribute;
  const numbers = [base, ...(min === undefined ? [] : [min]), ...(max === undefined ? [] : [max])];

  if (!numbers.every((value) => Number.isSafeInteger(value))) {
    throw new ContentError(
      `The attribute ${JSON.stringify(name)} has a base value or a bound that is not a safe integer.`,
      { definition: name },
    );
  }

  if (min !== undefined && max !== undefined && min > max) {
    throw new ContentError(
      `The attribute ${JSON.stringify(name)} has a lowest bound above its highest bound.`,
      { definition: name },
    );
  }
}
