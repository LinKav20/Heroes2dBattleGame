import type { UnitId } from '../../../ids/index.ts';
import type { InventoryItem } from '../../../model/index.ts';

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
