import type { Item } from '../content/index.ts';
import type { InventoryItem } from '../model/index.ts';

/**
 * Returns an item after one use, or nothing if the use takes the last item of the stack. An item with charges spends
 * one; when the last charge is spent, an item that using uses up leaves the stack, and the next one starts with all
 * its charges, while another item stays without charges. An item without charges leaves the stack if using uses it
 * up, and does not change otherwise.
 */
export function afterUse(definition: Item, item: InventoryItem): InventoryItem | undefined {
  const charges = item.charges ?? definition.charges;

  if (charges === undefined) return definition.consumedOnUse ? withoutOne(definition, item) : item;

  if (charges > 1) return { ...item, charges: charges - 1 };

  return definition.consumedOnUse ? withoutOne(definition, item) : { ...item, charges: 0 };
}

function withoutOne(definition: Item, item: InventoryItem): InventoryItem | undefined {
  if (item.count <= 1) return undefined;

  const charges = definition.charges === undefined ? {} : { charges: definition.charges };

  return { ...item, count: item.count - 1, ...charges };
}
