import { ContentError, type Item } from '../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { EventDraft } from '../extensions/index.ts';
import type { ContentName } from '../ids/index.ts';
import type { InventoryItem, Unit } from '../model/index.ts';

/**
 * Checks the definition of an item: it stacks by a whole number from 1, has charges from 1 if any, and an item with
 * charges that using does not use up does not stack, because only one charge counter is kept per stack.
 *
 * @throws {ContentError} If the definition breaks any of these rules.
 */
export function checkItem(item: Item): void {
  const problem = itemProblem(item);

  if (problem !== undefined) {
    throw new ContentError(`The item ${JSON.stringify(item.name)} ${problem}.`, { definition: item.name });
  }
}

/**
 * Returns the event that an item of a unit gives after it changes: `kernel:item-removed` if it is gone,
 * `kernel:item-changed` otherwise, or none if it has not changed.
 */
export function itemChange(unit: Unit, before: InventoryItem, after: InventoryItem | undefined): readonly EventDraft[] {
  if (after === before) return [];

  return after === undefined
    ? [kernelEventDraft(KERNEL_EVENTS.itemRemoved, { item: before.id, unit: unit.id }, unit.visibleTo)]
    : [kernelEventDraft(KERNEL_EVENTS.itemChanged, { item: after, unit: unit.id }, unit.visibleTo)];
}

/**
 * Returns the events that add items to the inventory of a unit. The items first fill the stacks of the same item that
 * are not equipped, in the order of the inventory, and the rest form new stacks with all their charges. New stacks
 * take the next numbers of the state from `nextId` on.
 */
export function addedItems(unit: Unit, definition: Item, count: number, nextId: number): readonly EventDraft[] {
  const { stack } = definition;
  const events: EventDraft[] = [];
  let left = count;

  for (const item of unit.inventory) {
    const room = stack - item.count;

    if (left === 0 || item.item !== definition.name || item.slot !== undefined || room <= 0) continue;

    const added = Math.min(room, left);

    left -= added;
    events.push(...itemChange(unit, item, { ...item, count: item.count + added }));
  }

  for (let id = nextId; left > 0; id += 1) {
    const added = Math.min(stack, left);
    const charges = definition.charges === undefined ? {} : { charges: definition.charges };
    const item: InventoryItem = { count: added, id, item: definition.name, ...charges };

    left -= added;
    events.push(kernelEventDraft(KERNEL_EVENTS.itemAdded, { item, unit: unit.id }, unit.visibleTo));
  }

  return events;
}

/**
 * Returns the events that take up to `count` items from the inventory of a unit: first from the stacks of the item
 * that are not equipped, then from the equipped ones, each time from the last stack backwards; a stack left empty
 * leaves the inventory.
 */
export function removedItems(unit: Unit, name: ContentName, count: number): readonly EventDraft[] {
  const events: EventDraft[] = [];
  const stacks = unit.inventory.toReversed();
  const spare = stacks.filter(({ slot }) => slot === undefined);
  const worn = stacks.filter(({ slot }) => slot !== undefined);
  let left = count;

  for (const item of [...spare, ...worn]) {
    if (left === 0 || item.item !== name) continue;

    const taken = Math.min(item.count, left);

    left -= taken;
    events.push(...itemChange(unit, item, taken === item.count ? undefined : { ...item, count: item.count - taken }));
  }

  return events;
}

function itemProblem({ charges, consumedOnUse, stack }: Item): string | undefined {
  if (!isWholeFrom(stack, 1)) return 'needs a whole number from 1 in stack';

  if (charges === undefined) return undefined;

  if (!isWholeFrom(charges, 1)) return 'needs a whole number from 1 in charges';

  return consumedOnUse || stack === 1 ? undefined : 'has charges and is not used up, so it cannot stack';
}

function isWholeFrom(value: number, least: number): boolean {
  return Number.isSafeInteger(value) && value >= least;
}
