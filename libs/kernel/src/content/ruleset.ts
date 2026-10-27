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
  /**
   * The variant of every mechanic, by the full name of the mechanic, for example `kernel:turn-order`. The ruleset must
   * choose the order of turns.
   */
  readonly mechanics: Readonly<Record<string, MechanicChoice>>;
  /** What a side or a unit can do in its turn and when the turn ends. */
  readonly turn: TurnRule;
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
 * What a side or a unit can do in its turn.
 */
export interface TurnRule {
  /**
   * The kinds of actions of a turn by full name, for example `core:action`. The turn of a unit ends by itself when the
   * unit has spent all of them, and the turn of a side when every unit of the side on the field has. With an empty
   * list a turn ends by a command, which the rule must allow then, or when the unit dies or leaves the field.
   */
  readonly actions: readonly ContentName[];
  /** Whether the side or the unit that has the turn may end it by the command `end-turn`. */
  readonly endTurn: boolean;
  /** How units move; without it they cannot move by the command `move`. */
  readonly movement?: MovementRule;
}

/**
 * How units move by the command `move`.
 */
export interface MovementRule {
  /**
   * The kind of action, by full name, that counts the cost of movement: a move spends as many of these actions as the
   * path costs, for example `core:movement` with an attribute equal to the speed of the creature.
   */
  readonly points: ContentName;
  /** The other actions of the turn that every move spends, by full name, for example `core:action`. */
  readonly actions: Readonly<Record<ContentName, number>>;
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

/**
 * The sources of rolled values: the sources of random values and the simulation.
 */
export const ROLL_SOURCES = Object.freeze({ ...RANDOM_SOURCES, simulated: 'simulated' } as const);
