import type { ModifierOperation, Rounding } from '../../content/index.ts';
import { largest, percentOf, smallest, sum } from '../arithmetic.ts';

/**
 * A modifier with its value already evaluated.
 */
export interface ModifierValue {
  /** How the modifier changes the attribute. */
  readonly operation: ModifierOperation;
  /** The value: an amount, a percent or a multiplier in percent. */
  readonly value: number;
  /** How many times the effect of the modifier is stacked; the modifier acts this many times. */
  readonly stacks: number;
  /** The place of the modifier in the order of application; a larger one was applied later. */
  readonly order: number;
  /** The type of bonus, if any. */
  readonly bonusType?: string;
  /** The stacking key, if any. */
  readonly stackingKey?: string;
  /** The priority of an override. */
  readonly priority: number;
}

/**
 * The bounds of an attribute from its definition.
 */
export interface AttributeBounds {
  /** The lowest value, if any. */
  readonly min?: number;
  /** The highest value, if any. */
  readonly max?: number;
}

/**
 * Applies modifiers to a base value in the order of the rules:
 * 1. bonuses to the base are added, then the percent to the base is applied;
 * 2. ordinary bonuses are added;
 * 3. the percent to the whole value is applied;
 * 4. multipliers are applied one by one in the order of application;
 * 5. final bonuses are added;
 * 6. the value is overridden by the override with the highest priority, and of equal ones the latest;
 * 7. the value is bounded by the modifiers `min` and `max` and then by the bounds of the attribute.
 *
 * Of modifiers with one stacking key, and then of modifiers with one type of bonus, only the largest bonus and the
 * strongest penalty of every operation act, once each. A percent or a multiplier is rounded as the ruleset says right
 * after it is applied; percents below -100 in sum bring the value to 0, not below. Returns nothing if a value leaves
 * the safe integers.
 */
export function applyModifiers(
  base: number,
  modifiers: readonly ModifierValue[],
  bounds: AttributeBounds,
  rounding: Rounding,
): number | undefined {
  const acting = keepStrongest(keepStrongest(modifiers, 'stackingKey'), 'bonusType');
  let value = plus(base, total(acting, 'base-add'));

  value = scale(value, total(acting, 'base-percent'), rounding);
  value = plus(value, total(acting, 'add'));
  value = scale(value, total(acting, 'percent'), rounding);

  for (const multiplier of ofOperation(acting, 'multiply')) {
    for (let time = 0; time < multiplier.stacks && value !== undefined; time += 1) {
      value = percentOf(value, multiplier.value, rounding);
    }
  }

  value = plus(value, total(acting, 'final-add'));

  if (value === undefined) return undefined;

  const override = ofOperation(acting, 'override')
    .toSorted((left, right) => left.priority - right.priority || left.order - right.order)
    .at(-1);
  const lowest = largest(ofOperation(acting, 'min').map((modifier) => modifier.value));
  const highest = smallest(ofOperation(acting, 'max').map((modifier) => modifier.value));

  return bound(bound(override?.value ?? value, lowest, highest), bounds.min ?? -Infinity, bounds.max ?? Infinity);
}

const PERCENT = 100;

const NEUTRAL: Partial<Record<ModifierOperation, number>> = {
  add: 0,
  'base-add': 0,
  'base-percent': 0,
  'final-add': 0,
  multiply: 100,
  percent: 0,
};

const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function keepStrongest(
  modifiers: readonly ModifierValue[],
  key: 'bonusType' | 'stackingKey',
): readonly ModifierValue[] {
  const strongest = new Map<string, ModifierValue>();
  const kept: ModifierValue[] = [];

  for (const modifier of modifiers) {
    const group = modifier[key];
    const neutral = NEUTRAL[modifier.operation];

    if (group === undefined || neutral === undefined || modifier.value === neutral) {
      kept.push(modifier);
      continue;
    }

    const bonus = modifier.value > neutral;
    const slot = `${modifier.operation} ${bonus ? 'bonus' : 'penalty'} ${group}`;
    const current = strongest.get(slot);

    if (current === undefined || (bonus ? modifier.value >= current.value : modifier.value <= current.value)) {
      strongest.set(slot, { ...modifier, stacks: 1 });
    }
  }

  return [...kept, ...strongest.values()].toSorted((left, right) => left.order - right.order);
}

function ofOperation(modifiers: readonly ModifierValue[], operation: ModifierOperation): readonly ModifierValue[] {
  return modifiers.filter((modifier) => modifier.operation === operation);
}

function total(modifiers: readonly ModifierValue[], operation: ModifierOperation): number | undefined {
  const result = ofOperation(modifiers, operation)
    .reduce((sumOfValues, { stacks, value }) => sumOfValues + BigInt(value) * BigInt(stacks), 0n);

  return result > MAX || result < -MAX ? undefined : Number(result);
}

function plus(value: number | undefined, amount: number | undefined): number | undefined {
  return value === undefined || amount === undefined ? undefined : sum([value, amount]);
}

function scale(value: number | undefined, percent: number | undefined, rounding: Rounding): number | undefined {
  const factor = plus(PERCENT, percent);

  return value === undefined || factor === undefined ? undefined : percentOf(value, Math.max(factor, 0), rounding);
}

function bound(value: number, lowest: number, highest: number): number {
  return Math.min(Math.max(value, lowest), highest);
}
