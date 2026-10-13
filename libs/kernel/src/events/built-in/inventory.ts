import type { UnitId } from '../../ids/index.ts';
import type { InventoryItem } from '../../model/index.ts';
import type { KernelEventAppliers } from './appliers.ts';
import { KERNEL_EVENTS } from './names.ts';
import { changeUnit, removeById, replaceById, takeId } from './state-changes.ts';

/**
 * The payload of `kernel:item-added`.
 */
export interface ItemAddedPayload {
  /** The unit. */
  readonly unit: UnitId;
  /** The item; its identifier is the next number of the state. */
  readonly item: InventoryItem;
}

/**
 * The payload of `kernel:item-changed`.
 */
export interface ItemChangedPayload {
  /** The unit. */
  readonly unit: UnitId;
  /** The item after the change, with the same identifier. */
  readonly item: InventoryItem;
}

/**
 * The payload of `kernel:item-removed`.
 */
export interface ItemRemovedPayload {
  /** The unit. */
  readonly unit: UnitId;
  /** The identifier of the item. */
  readonly item: number;
}

/**
 * The payloads of the events of the kernel about inventories of units.
 */
export interface InventoryEventPayloads {
  /** An item appeared in the inventory of a unit. */
  readonly [KERNEL_EVENTS.itemAdded]: ItemAddedPayload;
  /** An item in the inventory of a unit changed: its count, charges or slot. */
  readonly [KERNEL_EVENTS.itemChanged]: ItemChangedPayload;
  /** An item left the inventory of a unit. */
  readonly [KERNEL_EVENTS.itemRemoved]: ItemRemovedPayload;
}

/**
 * How the events of the kernel about inventories of units change the state.
 */
export const INVENTORY_EVENTS: KernelEventAppliers<InventoryEventPayloads> = {
  [KERNEL_EVENTS.itemAdded]: (state, { item, unit }) => {
    const nextId = takeId(state, item.id);
    const next = changeUnit(state, unit, (current) => ({ ...current, inventory: [...current.inventory, item] }));

    return { ...next, nextId };
  },
  [KERNEL_EVENTS.itemChanged]: (state, { item, unit }) =>
    changeUnit(state, unit, (current) => ({ ...current, inventory: replaceById(current.inventory, item, 'item') })),
  [KERNEL_EVENTS.itemRemoved]: (state, { item, unit }) =>
    changeUnit(state, unit, (current) => ({ ...current, inventory: removeById(current.inventory, item, 'item') })),
};
