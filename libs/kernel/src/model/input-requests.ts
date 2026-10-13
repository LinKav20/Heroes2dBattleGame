import type { CellId, ContentName, SideId, UnitId, VisibleTo } from '../ids/index.ts';

/**
 * A mark in the battle state that the kernel needs data from outside: a dice roll, a choice of an option or a choice of
 * targets. The kernel does not know who answers.
 */
export type InputRequest = ChoiceRequest | RollRequest | TargetRequest;

/**
 * A request for the result of a dice roll, for example of real dice.
 */
export interface RollRequest {
  /** The kind of request. */
  readonly kind: 'roll';
  /** The identifier of the request; an answer names it. */
  readonly id: number;
  /** The full name of the random value the roll is for, for example `core:attack-roll`. */
  readonly name: ContentName;
  /** How many dice to roll. */
  readonly count: number;
  /** How many sides every die has. */
  readonly sides: number;
  /** Which sides see the result of the roll; all sides if not given. */
  readonly visibleTo?: VisibleTo;
  /** The side the request belongs to and the only side that sees it; without a side every side sees the request. */
  readonly side?: SideId;
  /** The unit the request belongs to, if any. */
  readonly unit?: UnitId;
}

/**
 * A request to choose one of several options.
 */
export interface ChoiceRequest {
  /** The kind of request. */
  readonly kind: 'choice';
  /** The identifier of the request; an answer names it. */
  readonly id: number;
  /** The full name of the choice, for example `core:morale-reroll`; the user interface shows its text by it. */
  readonly name: ContentName;
  /** The options to choose from, all different. */
  readonly options: readonly string[];
  /** The side the request belongs to and the only side that sees it; without a side every side sees the request. */
  readonly side?: SideId;
  /** The unit the request belongs to, if any. */
  readonly unit?: UnitId;
}

/**
 * A request to choose targets.
 */
export interface TargetRequest {
  /** The kind of request. */
  readonly kind: 'target';
  /** The identifier of the request; an answer names it. */
  readonly id: number;
  /** The full name of the choice, for example `core:spell-target`; the user interface shows its text by it. */
  readonly name: ContentName;
  /** The targets to choose from, all different. */
  readonly targets: readonly Target[];
  /** How many different targets to choose. */
  readonly count: number;
  /** The side the request belongs to and the only side that sees it; without a side every side sees the request. */
  readonly side?: SideId;
  /** The unit the request belongs to, if any. */
  readonly unit?: UnitId;
}

/**
 * A target of an ability, an item or a request: a unit, a cell or a side.
 */
export type Target = CellTarget | SideTarget | UnitTarget;

/**
 * A unit as a target.
 */
export interface UnitTarget {
  /** The kind of target. */
  readonly kind: 'unit';
  /** The unit. */
  readonly unit: UnitId;
}

/**
 * A cell as a target.
 */
export interface CellTarget {
  /** The kind of target. */
  readonly kind: 'cell';
  /** The cell. */
  readonly cell: CellId;
}

/**
 * A side as a target.
 */
export interface SideTarget {
  /** The kind of target. */
  readonly kind: 'side';
  /** The side. */
  readonly side: SideId;
}
