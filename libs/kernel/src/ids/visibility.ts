import type { SideId } from './identifiers.ts';

/**
 * Which sides see a part of the battle: all of them, or the listed ones. An empty list means that only an actor with
 * full visibility sees it.
 */
export type VisibleTo = 'all' | readonly SideId[];

/**
 * Every side sees it.
 */
export const VISIBLE_TO_ALL: VisibleTo = 'all';

/**
 * No side sees it; only an actor with full visibility does.
 */
export const VISIBLE_TO_NONE: VisibleTo = Object.freeze([]);

/**
 * Returns which sides see both parts of the battle: the sides that are in both lists.
 */
export function visibleToBoth(left: VisibleTo, right: VisibleTo): VisibleTo {
  if (left === 'all') return right;

  return right === 'all' ? left : left.filter((side) => right.includes(side));
}
