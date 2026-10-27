import type { SideId } from './identifiers.ts';

/**
 * Which sides see a part of the battle: all of them, or the listed ones. An empty list means that only an actor with
 * full visibility sees it.
 */
export type VisibleTo = 'all' | readonly SideId[];

/**
 * What an actor sees of a battle: everything, or the parts that some sides see. An actor with full visibility also sees
 * the parts that no side sees.
 */
export type Visibility = FullVisibility | SidesVisibility;

/**
 * An actor sees the whole battle but the random number generator.
 */
export interface FullVisibility {
  /** The kind of visibility. */
  readonly kind: 'full';
}

/**
 * An actor sees what the listed sides see.
 */
export interface SidesVisibility {
  /** The kind of visibility. */
  readonly kind: 'sides';
  /** The sides, all different; an empty list sees only what every side sees. */
  readonly sides: readonly SideId[];
}

/**
 * Every side sees it.
 */
export const VISIBLE_TO_ALL: VisibleTo = 'all';

/**
 * No side sees it; only an actor with full visibility does.
 */
export const VISIBLE_TO_NONE: VisibleTo = Object.freeze([]);

/**
 * Tells whether an actor with the visibility sees a part of the battle that the sides `visibleTo` see.
 */
export function canSee(visibility: Visibility, visibleTo: VisibleTo): boolean {
  if (visibility.kind === 'full' || visibleTo === 'all') return true;

  return visibleTo.some((side) => visibility.sides.includes(side));
}

/**
 * Tells whether a side sees a part of the battle that the sides `visibleTo` see; without a side, only a part marked as
 * seen by all.
 */
export function sideSees(side: SideId | undefined, visibleTo: VisibleTo): boolean {
  return canSee({ kind: 'sides', sides: side === undefined ? [] : [side] }, visibleTo);
}

/**
 * Returns which sides see both parts of the battle: the sides that are in both lists.
 */
export function visibleToBoth(left: VisibleTo, right: VisibleTo): VisibleTo {
  if (left === 'all') return right;

  return right === 'all' ? left : left.filter((side) => right.includes(side));
}
