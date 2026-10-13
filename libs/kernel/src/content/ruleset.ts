import type { ContentName } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';

/**
 * The basic mechanics of a battle, as the scenario picked them and the consumer adjusted them. The ruleset does not
 * change during the battle.
 */
export interface Ruleset {
  /** The full name of the ruleset, for example `core:stacks-speed`. */
  readonly name: ContentName;
  /** Who gets a turn: every unit in turn, or a whole side, which then acts with any of its units. */
  readonly turnOwner: 'side' | 'unit';
  /** The variant of every mechanic, by the full name of the mechanic, for example `kernel:turn-order`. */
  readonly mechanics: Readonly<Record<string, MechanicChoice>>;
  /**
   * Where every random value comes from, by the full name of the value, for example `core:attack-roll`. The generator
   * rolls a value the ruleset does not name.
   */
  readonly randomSources: Readonly<Record<ContentName, RandomSource>>;
  /** How a step that produces a fraction rounds it. */
  readonly rounding: Rounding;
  /** The full name of the attribute that bounds the health of one creature. */
  readonly healthAttribute: ContentName;
}

/**
 * The variant chosen for one mechanic and its parameters.
 */
export interface MechanicChoice {
  /** The full name of the variant in the registry of mechanics. */
  readonly variant: string;
  /** The parameters of the variant. */
  readonly params?: JsonObject;
}

/**
 * Where a random value comes from: the generator in the battle state, or an input request answered from outside, for
 * example with real dice.
 */
export type RandomSource = (typeof RANDOM_SOURCES)[keyof typeof RANDOM_SOURCES];

/**
 * How a fraction is rounded to an integer: `down` to the smaller integer, negative numbers included, `up` to the
 * larger integer, `nearest` to the nearest integer with a half rounded up.
 */
export type Rounding = 'down' | 'nearest' | 'up';

/**
 * The sources of random values.
 */
export const RANDOM_SOURCES = Object.freeze({
  external: 'external',
  generator: 'generator',
} as const);
