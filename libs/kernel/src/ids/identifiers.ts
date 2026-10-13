/**
 * The local name of a side in the scenario, for example `attacker`.
 */
export type SideId = string;

/**
 * The identifier of a unit: its local name in the scenario, such as `archers-1`, the name the consumer gives to a unit
 * it adds, or the identifier the kernel gives to a summoned unit: `#` followed by a number, such as `#7`. Names from
 * the scenario and from the consumer never start with `#`.
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
 * Returns the identifier the kernel gives to a summoned unit: `#` followed by a number from the counter of the state.
 */
export function summonedUnitId(id: number): UnitId {
  return `${SUMMONED_PREFIX}${String(id)}`;
}

/**
 * Returns the number in the identifier of a summoned unit, or nothing if the identifier is not one.
 */
export function summonedUnitNumber(id: UnitId): number | undefined {
  return SUMMONED_ID.test(id) ? Number(id.slice(SUMMONED_PREFIX.length)) : undefined;
}

const SUMMONED_PREFIX = '#';
const SUMMONED_ID = /^#(0|[1-9]\d*)$/;
