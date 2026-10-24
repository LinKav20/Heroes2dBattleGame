import { summonedUnitNumber, type CellId, type ContentName, type Tag, type UnitId } from '../../ids/index.ts';
import type { Unit } from '../../model/index.ts';
import type { KernelEventAppliers } from './appliers.ts';
import { KERNEL_EVENTS } from './names.ts';
import { changeUnit, hasId, takeId, withNames, withTagSources } from './state-changes.ts';

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
 * The payload of `kernel:unit-turned`.
 */
export interface UnitTurnedPayload {
  /** The unit. */
  readonly unit: UnitId;
  /** The direction the unit faces after the change. */
  readonly facing: string;
}

/**
 * The payload of `kernel:health-changed`. The count is at most the count the unit started with. The event does not
 * check the field: a step that gives creatures back to a dead unit gives the event only when all of the cells of the
 * unit are free, as `kernel:heal` with `revive` does.
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
 * The payload of `kernel:tags-changed`: one source gives a unit tags or takes them back. The state keeps only such
 * tags; the kernel adds the tags of the creature and of the effects that act on the unit when it reads them.
 */
export interface TagsChangedPayload {
  /** The unit. */
  readonly unit: UnitId;
  /** The tags the source gives. */
  readonly added: readonly Tag[];
  /** The tags the source takes back. */
  readonly removed: readonly Tag[];
}

/**
 * The payload of `kernel:auras-changed`.
 */
export interface AurasChangedPayload {
  /** The unit. */
  readonly unit: UnitId;
  /** The effects of the auras that began to cover the unit, sorted. */
  readonly added: readonly ContentName[];
  /** The effects of the auras that no longer cover the unit, sorted. */
  readonly removed: readonly ContentName[];
}

/**
 * The payload of `kernel:zones-changed`.
 */
export interface ZonesChangedPayload {
  /** The unit. */
  readonly unit: UnitId;
  /** The hazard zones the unit entered, sorted. */
  readonly added: readonly string[];
  /** The hazard zones the unit left, sorted. */
  readonly removed: readonly string[];
}

/**
 * The payload of `kernel:unit-summoned`. The count the new unit started with is a safe integer of at least its count.
 */
export interface UnitSummonedPayload {
  /** The new unit; its identifier is `#` followed by the next number of the state. */
  readonly unit: Unit;
}

/**
 * The payloads of the events of the kernel about units.
 */
export interface UnitEventPayloads {
  /**
   * A unit was placed on the field during deployment, seen by its own side. At the start of the battle the kernel gives
   * it again for every unit a side placed, seen by the sides that see the unit, so the others learn where it stands;
   * for its own side the event changes nothing.
   */
  readonly [KERNEL_EVENTS.unitPlaced]: UnitPlacedPayload;
  /** A unit moved along a path. */
  readonly [KERNEL_EVENTS.unitMoved]: UnitMovedPayload;
  /** A unit turned where it stands. */
  readonly [KERNEL_EVENTS.unitTurned]: UnitTurnedPayload;
  /** The number of creatures of a unit or the health of the first one changed. */
  readonly [KERNEL_EVENTS.healthChanged]: HealthChangedPayload;
  /** A resource of a unit changed. */
  readonly [KERNEL_EVENTS.resourceChanged]: ResourceChangedPayload;
  /** The flags of a unit changed. */
  readonly [KERNEL_EVENTS.flagsChanged]: FlagsChangedPayload;
  /** A source gave a unit tags or took them back. */
  readonly [KERNEL_EVENTS.tagsChanged]: TagsChangedPayload;
  /** Auras began or stopped covering a unit. */
  readonly [KERNEL_EVENTS.aurasChanged]: AurasChangedPayload;
  /** A unit entered or left hazard zones. */
  readonly [KERNEL_EVENTS.zonesChanged]: ZonesChangedPayload;
  /** A new unit was summoned. */
  readonly [KERNEL_EVENTS.unitSummoned]: UnitSummonedPayload;
}

/**
 * How the events of the kernel about units change the state.
 */
export const UNIT_EVENTS: KernelEventAppliers<UnitEventPayloads> = {
  [KERNEL_EVENTS.unitPlaced]: (state, { cell, facing, unit }) =>
    changeUnit(state, unit, (current) => placed(current, cell, facing)),
  [KERNEL_EVENTS.unitMoved]: (state, { facing, path, unit }) => {
    const cell = path.at(-1);

    if (cell === undefined) throw new RangeError(`The path of the unit "${unit}" is empty.`);

    return changeUnit(state, unit, (current) => placed(current, cell, facing));
  },
  [KERNEL_EVENTS.unitTurned]: (state, { facing, unit }) =>
    changeUnit(state, unit, (current) => ({ ...current, facing })),
  [KERNEL_EVENTS.healthChanged]: (state, { count, health, unit }) =>
    changeUnit(state, unit, (current) => {
      if (count > current.startCount) {
        throw new RangeError(`The unit "${unit}" cannot have more than ${String(current.startCount)} creatures.`);
      }

      return { ...current, count, health };
    }),
  [KERNEL_EVENTS.resourceChanged]: (state, { resource, unit, value }) =>
    changeUnit(state, unit, (current) => ({ ...current, resources: { ...current.resources, [resource]: value } })),
  [KERNEL_EVENTS.flagsChanged]: (state, { flags, unit }) =>
    changeUnit(state, unit, (current) => ({ ...current, flags })),
  [KERNEL_EVENTS.tagsChanged]: (state, { added, removed, unit }) =>
    changeUnit(state, unit, (current) => ({ ...current, tags: withTagSources(current.tags, added, removed) })),
  [KERNEL_EVENTS.aurasChanged]: (state, { added, removed, unit }) =>
    changeUnit(state, unit, (current) => ({ ...current, auras: withNames(current.auras, added, removed, 'aura') })),
  [KERNEL_EVENTS.zonesChanged]: (state, { added, removed, unit }) =>
    changeUnit(state, unit, (current) => ({ ...current, zones: withNames(current.zones, added, removed, 'zone') })),
  [KERNEL_EVENTS.unitSummoned]: (state, { unit }) => {
    const number = summonedUnitNumber(unit.id);

    if (number === undefined) throw new RangeError(`A summoned unit needs an identifier like "#7", not "${unit.id}".`);

    const nextId = takeId(state, number);

    if (hasId(state.units, unit.id)) throw new RangeError(`The unit "${unit.id}" already exists.`);

    if (!Number.isSafeInteger(unit.startCount) || unit.startCount < unit.count) {
      throw new RangeError(`The summoned unit "${unit.id}" needs a start count of at least its count.`);
    }

    return { ...state, nextId, units: [...state.units, unit] };
  },
};

function placed(unit: Unit, cell: CellId, facing: string | undefined): Unit {
  return facing === undefined ? { ...unit, cell } : { ...unit, cell, facing };
}
