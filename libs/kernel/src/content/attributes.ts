import type { ContentName } from '../ids/index.ts';
import type { ValueExpr } from './expressions.ts';

/**
 * An attribute that the engine calculates from a base value and modifiers, for example attack or speed.
 */
export interface Attribute {
  /** The full name of the attribute, for example `core:speed`. */
  readonly name: ContentName;
  /** The lowest value, if the attribute has one. */
  readonly min?: number;
  /** The highest value, if the attribute has one. */
  readonly max?: number;
}

/**
 * A change of an attribute.
 */
export interface Modifier {
  /** The full name of the attribute the modifier changes. */
  readonly attribute: ContentName;
  /**
   * How the modifier changes the value. Modifiers apply in this order: `base-add`, `base-percent`, `add`, `percent`,
   * `multiply`, `final-add`, `override`, then `min` and `max` bound the value.
   */
  readonly operation: ModifierOperation;
  /** The amount. Percents and multipliers are integers in percent: +25 % is 25, and a multiplier of 1.5 is 150. */
  readonly value: ValueExpr;
  /** Of bonuses of one type only the largest applies, and of penalties only the strongest. */
  readonly bonusType?: string;
  /** Modifiers with the same stacking key do not add up: only one of them applies, as with one bonus type. */
  readonly stackingKey?: string;
  /** Of several overrides the one with the highest priority wins, and of equal ones the latest applied. */
  readonly priority?: number;
}

/**
 * How a modifier changes an attribute.
 */
export type ModifierOperation
  = | 'add'
    | 'base-add'
    | 'base-percent'
    | 'final-add'
    | 'max'
    | 'min'
    | 'multiply'
    | 'override'
    | 'percent';
