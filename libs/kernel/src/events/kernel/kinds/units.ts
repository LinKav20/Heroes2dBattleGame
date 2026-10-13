import type { EventKind } from '../../../kinds/index.ts';
import type { AbilityUse, Unit } from '../../../model/index.ts';
import { changeSide, changeUnit, takeId } from '../state-changes.ts';
import { KERNEL_EVENTS } from '../names.ts';
import { defineKernelEvent } from './define-kernel-event.ts';

/**
 * The kinds of events of the kernel about units: placement, movement, health, resources, flags, tags, summoning and
 * used abilities.
 */
export const UNIT_EVENT_KINDS: readonly EventKind[] = [
  defineKernelEvent(KERNEL_EVENTS.unitPlaced, (state, { cell, facing, unit }) =>
    changeUnit(state, unit, (current) => placed(current, cell, facing))),
  defineKernelEvent(KERNEL_EVENTS.unitMoved, (state, { facing, path, unit }) => {
    const cell = path.at(-1);

    if (cell === undefined) throw new RangeError(`The path of the unit "${unit}" is empty.`);

    return changeUnit(state, unit, (current) => placed(current, cell, facing));
  }),
  defineKernelEvent(KERNEL_EVENTS.healthChanged, (state, { count, health, unit }) =>
    changeUnit(state, unit, (current) => ({ ...current, count, health }))),
  defineKernelEvent(KERNEL_EVENTS.resourceChanged, (state, { resource, unit, value }) =>
    changeUnit(state, unit, (current) => ({ ...current, resources: { ...current.resources, [resource]: value } }))),
  defineKernelEvent(KERNEL_EVENTS.flagsChanged, (state, { flags, unit }) =>
    changeUnit(state, unit, (current) => ({ ...current, flags }))),
  defineKernelEvent(KERNEL_EVENTS.tagsChanged, (state, { tags, unit }) =>
    changeUnit(state, unit, (current) => ({ ...current, tags }))),
  defineKernelEvent(KERNEL_EVENTS.unitSummoned, (state, { unit }) => {
    const nextId = takeId(state, summonedNumber(unit.id));

    if (state.units.some(({ id }) => id === unit.id)) throw new RangeError(`The unit "${unit.id}" already exists.`);

    return { ...state, nextId, units: [...state.units, unit] };
  }),
  defineKernelEvent(KERNEL_EVENTS.abilityUsed, (state, { holder, use }) =>
    holder.kind === 'unit'
      ? changeUnit(state, holder.unit, (unit) => ({ ...unit, abilityUses: recordUse(unit.abilityUses, use) }))
      : changeSide(state, holder.side, (side) => ({ ...side, abilityUses: recordUse(side.abilityUses, use) }))),
];

/**
 * Returns the identifier the kernel gives to a summoned unit: `#` followed by a number of the state.
 */
export function summonedUnitId(id: number): string {
  return `${SUMMONED_PREFIX}${String(id)}`;
}

const SUMMONED_PREFIX = '#';
const SUMMONED_ID = /^#(0|[1-9]\d*)$/;

function placed(unit: Unit, cell: string, facing: string | undefined): Unit {
  return facing === undefined ? { ...unit, cell } : { ...unit, cell, facing };
}

function recordUse(uses: readonly AbilityUse[], use: AbilityUse): readonly AbilityUse[] {
  if (!uses.some(({ ability }) => ability === use.ability)) return [...uses, use];

  return uses.map((current) => (current.ability === use.ability ? use : current));
}

function summonedNumber(id: string): number {
  if (!SUMMONED_ID.test(id)) throw new RangeError(`A summoned unit needs an identifier like "#7", not "${id}".`);

  return Number(id.slice(SUMMONED_PREFIX.length));
}
