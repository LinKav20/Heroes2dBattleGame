import { summonedUnitNumber, type CellId, type ContentName, type Tag, type UnitId } from '../../ids/index.ts';
import type { AbilityUse, SideHolder, Unit, UnitHolder } from '../../model/index.ts';
import type { KernelEventAppliers } from './appliers.ts';
import { KERNEL_EVENTS } from './names.ts';
import { changeSide, changeUnit, hasId, takeId, withTagSources } from './state-changes.ts';

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
  readonly holder: SideHolder | UnitHolder;
  /** How the ability has been used after this use. */
  readonly use: AbilityUse;
}

/**
 * The payloads of the events of the kernel about units.
 */
export interface UnitEventPayloads {
  /** A unit was placed on the field during deployment. */
  readonly [KERNEL_EVENTS.unitPlaced]: UnitPlacedPayload;
  /** A unit moved along a path. */
  readonly [KERNEL_EVENTS.unitMoved]: UnitMovedPayload;
  /** The number of creatures of a unit or the health of the first one changed. */
  readonly [KERNEL_EVENTS.healthChanged]: HealthChangedPayload;
  /** A resource of a unit changed. */
  readonly [KERNEL_EVENTS.resourceChanged]: ResourceChangedPayload;
  /** The flags of a unit changed. */
  readonly [KERNEL_EVENTS.flagsChanged]: FlagsChangedPayload;
  /** A source gave a unit tags or took them back. */
  readonly [KERNEL_EVENTS.tagsChanged]: TagsChangedPayload;
  /** A new unit was summoned. */
  readonly [KERNEL_EVENTS.unitSummoned]: UnitSummonedPayload;
  /** A unit used an ability, or a side used its own ability. */
  readonly [KERNEL_EVENTS.abilityUsed]: AbilityUsedPayload;
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
  [KERNEL_EVENTS.healthChanged]: (state, { count, health, unit }) =>
    changeUnit(state, unit, (current) => ({ ...current, count, health })),
  [KERNEL_EVENTS.resourceChanged]: (state, { resource, unit, value }) =>
    changeUnit(state, unit, (current) => ({ ...current, resources: { ...current.resources, [resource]: value } })),
  [KERNEL_EVENTS.flagsChanged]: (state, { flags, unit }) =>
    changeUnit(state, unit, (current) => ({ ...current, flags })),
  [KERNEL_EVENTS.tagsChanged]: (state, { added, removed, unit }) =>
    changeUnit(state, unit, (current) => ({ ...current, tags: withTagSources(current.tags, added, removed) })),
  [KERNEL_EVENTS.unitSummoned]: (state, { unit }) => {
    const number = summonedUnitNumber(unit.id);

    if (number === undefined) throw new RangeError(`A summoned unit needs an identifier like "#7", not "${unit.id}".`);

    const nextId = takeId(state, number);

    if (hasId(state.units, unit.id)) throw new RangeError(`The unit "${unit.id}" already exists.`);

    return { ...state, nextId, units: [...state.units, unit] };
  },
  [KERNEL_EVENTS.abilityUsed]: (state, { holder, use }) =>
    holder.kind === 'unit'
      ? changeUnit(state, holder.unit, (unit) => ({ ...unit, abilityUses: recordUse(unit.abilityUses, use) }))
      : changeSide(state, holder.side, (side) => ({ ...side, abilityUses: recordUse(side.abilityUses, use) })),
};

function placed(unit: Unit, cell: CellId, facing: string | undefined): Unit {
  return facing === undefined ? { ...unit, cell } : { ...unit, cell, facing };
}

function recordUse(uses: readonly AbilityUse[], use: AbilityUse): readonly AbilityUse[] {
  if (!uses.some(({ ability }) => ability === use.ability)) return [...uses, use];

  return uses.map((current) => (current.ability === use.ability ? use : current));
}
