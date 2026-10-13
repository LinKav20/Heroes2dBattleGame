/**
 * The local name of a side in the scenario, for example `attacker`.
 */
export type SideId = string;

/**
 * The identifier of a unit: its local name in the scenario, such as `archers-1`, the name the consumer gives to a unit
 * it adds, or the identifier the kernel gives to a summoned unit: `#` followed by a number, such as `#7`.
 */
export type UnitId = string;

/**
 * An opaque cell identifier. Its format belongs to the field topology, and the kernel only compares identifiers.
 */
export type CellId = string;

/**
 * The full name `pack:name` of a definition from the content registry, for example `demo:archer`.
 */
export type ContentName = string;

/**
 * A tag with a hierarchy, such as `Debuff.Poison`. A check for `Debuff` matches every nested tag too.
 */
export type Tag = string;

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
