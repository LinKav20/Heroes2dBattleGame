import type { EventKind } from '../../../kinds/index.ts';
import { changeUnit, removeById, replaceById, takeId } from '../state-changes.ts';
import { KERNEL_EVENTS } from '../names.ts';
import { defineKernelEvent } from './define-kernel-event.ts';

/**
 * The kinds of events of the kernel about inventories of units.
 */
export const INVENTORY_EVENT_KINDS: readonly EventKind[] = [
  defineKernelEvent(KERNEL_EVENTS.itemAdded, (state, { item, unit }) => {
    const nextId = takeId(state, item.id);

    const next = changeUnit(state, unit, (current) => ({ ...current, inventory: [...current.inventory, item] }));

    return { ...next, nextId };
  }),
  defineKernelEvent(KERNEL_EVENTS.itemChanged, (state, { item, unit }) =>
    changeUnit(state, unit, (current) => ({ ...current, inventory: replaceById(current.inventory, item, 'item') }))),
  defineKernelEvent(KERNEL_EVENTS.itemRemoved, (state, { item, unit }) =>
    changeUnit(state, unit, (current) => ({ ...current, inventory: removeById(current.inventory, item, 'item') }))),
];
