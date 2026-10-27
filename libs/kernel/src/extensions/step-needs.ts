import type { ContentName, SideId, UnitId, VisibleTo } from '../ids/index.ts';
import type { Target } from '../model/index.ts';

/**
 * A value a step needs: a roll, a choice of an option or a choice of targets.
 *
 * A need that cannot be met is an error of the extension, and the kernel throws a `TypeError`: a roll without dice,
 * with more than `MAX_DICE_PER_ROLL` dice or with dice of more than `MAX_DIE_SIDES` sides, a choice without options
 * or with repeated ones, a choice of targets without targets, with repeated targets, with a count outside 1 to the
 * number of targets, or with a unit that is not in the battle or that the choosing side does not see; without a side,
 * each unit target must be marked as seen by all.
 */
export type StepNeed = ChoiceNeed | RollNeed | TargetNeed;

/**
 * A roll of dice. The ruleset tells whether the generator rolls it or it comes from outside; if the ruleset names no
 * source for the value, the generator rolls it.
 */
export interface RollNeed {
  /** The kind of value. */
  readonly kind: 'roll';
  /** The full name of the random value, for example `core:attack-roll`. */
  readonly name: ContentName;
  /** How many dice to roll, from 1 to `MAX_DICE_PER_ROLL`. */
  readonly count: number;
  /** How many sides every die has, from 1 to `MAX_DIE_SIDES`. */
  readonly sides: number;
  /** Which sides see the result, whoever rolls it; all sides if not given. */
  readonly visibleTo?: VisibleTo;
  /** The side the roll belongs to; an input request goes to it. */
  readonly side?: SideId;
  /** The unit the roll belongs to. */
  readonly unit?: UnitId;
}

/**
 * A choice of one option, which always comes from outside.
 */
export interface ChoiceNeed {
  /** The kind of value. */
  readonly kind: 'choice';
  /** The full name of the choice, for example `core:morale-reroll`; the user interface shows its text by it. */
  readonly name: ContentName;
  /** The options to choose from, all different. */
  readonly options: readonly string[];
  /** The side that chooses. */
  readonly side?: SideId;
  /** The unit the choice belongs to. */
  readonly unit?: UnitId;
}

/**
 * A choice of targets, which always comes from outside.
 */
export interface TargetNeed {
  /** The kind of value. */
  readonly kind: 'target';
  /** The full name of the choice, for example `core:spell-target`; the user interface shows its text by it. */
  readonly name: ContentName;
  /**
   * The targets to choose from, all different. A unit must be one the side that chooses sees, or, without a side, one
   * marked as seen by all, so the request never names a unit hidden from whoever sees it.
   */
  readonly targets: readonly Target[];
  /** How many different targets to choose, from 1 to the number of targets. */
  readonly count: number;
  /** The side that chooses. */
  readonly side?: SideId;
  /** The unit the choice belongs to. */
  readonly unit?: UnitId;
}
