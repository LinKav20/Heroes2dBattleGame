import type { ContentName } from '../ids/index.ts';

/**
 * An item in the inventory of a unit.
 */
export interface InventoryItem {
  /** The identifier of the item in the battle. */
  readonly id: number;
  /** The definition of the item. */
  readonly item: ContentName;
  /** The equipment slot the item takes, if it is equipped. */
  readonly slot?: string;
  /** How many items are in the stack. */
  readonly count: number;
  /** The charges left, if the item has charges. */
  readonly charges?: number;
}
