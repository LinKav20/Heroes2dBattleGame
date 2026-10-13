import type { CellId, ContentName, Tag, UnitId } from '../../../ids/index.ts';
import type { AbilityUse, SideTarget, Unit, UnitTarget } from '../../../model/index.ts';

/**
 * The payload of `kernel:unit-placed`.
 */
export interface UnitPlacedPayload {
  /** The unit. */
  readonly unit: UnitId;
  /** The cell. */
  readonly cell: CellId;
  /** The direction the unit faces, if the topology has directions. */
  readonly facing?: string;
}

/**
 * The payload of `kernel:unit-moved`.
 */
export interface UnitMovedPayload {
  /** The unit. */
  readonly unit: UnitId;
  /** The cells the unit passed, ending with the cell where it stopped. */
  readonly path: readonly CellId[];
  /** The direction the unit faces at the end, if the topology has directions. */
  readonly facing?: string;
}

/**
 * The payload of `kernel:health-changed`.
 */
export interface HealthChangedPayload {
  /** The unit. */
  readonly unit: UnitId;
  /** How many creatures are left. */
  readonly count: number;
  /** The health of the creature that takes damage first. */
  readonly health: number;
}

/**
 * The payload of `kernel:resource-changed`.
 */
export interface ResourceChangedPayload {
  /** The unit. */
  readonly unit: UnitId;
  /** The full name of the resource. */
  readonly resource: ContentName;
  /** The value after the change. */
  readonly value: number;
}

/**
 * The payload of `kernel:flags-changed`.
 */
export interface FlagsChangedPayload {
  /** The unit. */
  readonly unit: UnitId;
  /** The flags after the change, sorted. */
  readonly flags: readonly string[];
}

/**
 * The payload of `kernel:tags-changed`.
 */
export interface TagsChangedPayload {
  /** The unit. */
  readonly unit: UnitId;
  /** How many sources give the unit each tag after the change. */
  readonly tags: Readonly<Record<Tag, number>>;
}

/**
 * The payload of `kernel:unit-summoned`.
 */
export interface UnitSummonedPayload {
  /** The new unit; its identifier is `#` followed by the next number of the state. */
  readonly unit: Unit;
}

/**
 * The payload of `kernel:ability-used`.
 */
export interface AbilityUsedPayload {
  /** The unit or the side that used the ability. */
  readonly holder: SideTarget | UnitTarget;
  /** How the ability has been used after this use. */
  readonly use: AbilityUse;
}
