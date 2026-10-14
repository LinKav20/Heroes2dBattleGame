import type { ContentRegistry, Predicate, ValueExpr } from '../../content/index.ts';
import type { Evaluation, Subjects } from '../../extensions/index.ts';
import type { ContentName, UnitId } from '../../ids/index.ts';
import type { BattleState } from '../../model/index.ts';
import { ownValue } from '../../shared/index.ts';
import { attributeOutOfRange, evaluated } from '../results.ts';
import { applyModifiers, type ModifierValue } from './calculation.ts';
import { modifierSources } from './sources.ts';

/**
 * What the calculation of an attribute needs: the battle and a way to evaluate formulas and conditions of effects.
 */
export interface AttributeInput {
  /** The state of the battle. */
  readonly state: BattleState;
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** Evaluates a formula of a modifier. */
  readonly value: (formula: ValueExpr, subjects: Subjects) => Evaluation<number>;
  /** Evaluates a condition of an effect. */
  readonly test: (condition: Predicate, subjects: Subjects) => Evaluation<boolean>;
}

/**
 * Calculates an attribute of a unit: the base value of its creature, or 0, changed by the modifiers of the effects
 * that act on the unit, in the order of the rules.
 *
 * @throws {TypeError} If the unit, its creature or the attribute does not exist, or a formula or a condition of an
 * effect needs a value, such as a dice roll.
 */
export function attributeValue(input: AttributeInput, unitId: UnitId, attribute: ContentName): Evaluation<number> {
  const { content, state } = input;
  const unit = state.units.find(({ id }) => id === unitId);
  const definition = ownValue(content.attributes, attribute);

  if (unit === undefined) throw new TypeError(`The battle has no unit ${JSON.stringify(unitId)}.`);

  if (definition === undefined) throw new TypeError(`The content has no attribute ${JSON.stringify(attribute)}.`);

  const modifiers: ModifierValue[] = [];

  for (const source of modifierSources(state, content, unit)) {
    if (source.activeWhile !== undefined) {
      const active = settled(input.test(source.activeWhile, source.subjects), attribute);

      if (active.kind !== 'value') return active;

      if (!active.value) continue;
    }

    for (const modifier of source.effect.modifiers.filter((candidate) => candidate.attribute === attribute)) {
      const value = settled(input.value(modifier.value, source.subjects), attribute);

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

  const creature = ownValue(content.creatures, unit.creature);
  const base = creature === undefined ? 0 : ownValue(creature.attributes, attribute) ?? 0;
  const result = applyModifiers(base, modifiers, definition, state.ruleset.rounding);

  return result === undefined ? attributeOutOfRange(unitId, attribute) : evaluated(result);
}

function settled<Value>(result: Evaluation<Value>, attribute: ContentName): Evaluation<Value> {
  if (result.kind === 'need') {
    throw new TypeError(`An effect on the attribute ${JSON.stringify(attribute)} needs a value, such as a dice roll.`);
  }

  return result;
}
