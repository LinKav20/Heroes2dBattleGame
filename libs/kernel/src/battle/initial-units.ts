import {
  ContentError,
  creatureDefinition,
  itemDefinition,
  type ContentRegistry,
  type Item,
  type ResourceRule,
  type Scenario,
  type ScenarioItem,
  type ScenarioUnit,
} from '../content/index.ts';
import type { Evaluation, Expressions } from '../extensions/index.ts';
import type { ContentName, SideId, UnitId } from '../ids/index.ts';
import type { AbilityUse, InventoryItem, Side, Unit } from '../model/index.ts';
import { checkItem, MAX_ITEMS_PER_OPERATION } from '../operations/index.ts';
import { sortedEntries } from '../shared/index.ts';
import type { SpentUses, UnitChanges } from './options.ts';

/**
 * The bounds of the values of a unit by its attributes now: the full health of one creature and the bound of every
 * resource of its creature.
 */
export interface UnitBounds {
  /** The full health of one creature. */
  readonly health: number;
  /** The bound of every resource, by the full name of the resource. */
  readonly resources: Readonly<Record<ContentName, number>>;
}

/**
 * Returns a side of a new battle: its abilities, and no effects or uses yet.
 */
export function sideOf({ abilities, id }: Scenario['sides'][number]): Side {
  return { abilities, abilityUses: [], effects: [], id };
}

/**
 * Returns a unit of a new battle with its items and without health, resources and effects yet.
 */
export function unitOf(side: SideId, unit: ScenarioUnit, inventory: readonly InventoryItem[]): Unit {
  const { cell, count, creature, facing, id, visibleTo } = unit;

  return {
    abilityUses: [],
    auras: [],
    count,
    creature,
    effects: [],
    flags: [],
    health: 0,
    id,
    inventory,
    resources: {},
    side,
    spentActions: {},
    startCount: count,
    summoned: false,
    tags: {},
    visibleTo,
    zones: [],
    ...(cell === undefined ? {} : { cell }),
    ...(facing === undefined ? {} : { facing }),
  };
}

/**
 * Returns the stacks of items a unit starts with: stacks of the size of the item, the first one with the given charges
 * and slot and the others full and not equipped, with identifiers from `firstId`.
 *
 * @throws {ContentError} If the content has no such item, the item is described wrongly, or the items are wrong, as
 * `itemProblem` tells.
 */
export function stacksOf(content: ContentRegistry, item: ScenarioItem, firstId: number): readonly InventoryItem[] {
  const definition = itemDefinition(content, item.item);
  const { charges, slot } = item;
  const place = { definition: item.item };

  checkItem(definition);

  const problem = itemProblem(definition, item);

  if (problem !== undefined) {
    throw new ContentError(`An item ${JSON.stringify(item.item)} of the scenario ${problem}.`, place);
  }

  const full = definition.charges;
  const { stack } = definition;
  const stacks: InventoryItem[] = [];

  for (let left = item.count; left > 0; left -= stack) {
    const first = stacks.length === 0;
    const stackCharges = first ? charges ?? full : full;

    stacks.push({
      count: Math.min(left, stack),
      id: firstId + stacks.length,
      item: item.item,
      ...(stackCharges === undefined ? {} : { charges: stackCharges }),
      ...(first && slot !== undefined ? { slot } : {}),
    });
  }

  return stacks;
}

/**
 * Returns what is wrong with items a unit starts with by the definition of the item, as the end of a sentence: the
 * count is not a whole number from 1 to `MAX_ITEMS_PER_OPERATION`, the charges are given for an item without charges
 * or are not from 1 to the charges of a new item, or the slot is not the slot of the item. Returns `undefined` if
 * nothing is wrong.
 */
export function itemProblem(definition: Item, item: ScenarioItem): string | undefined {
  const { charges, count, slot } = item;
  const full = definition.charges;
  const fits = full !== undefined && Number.isSafeInteger(charges) && Number(charges) >= 1 && Number(charges) <= full;

  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_ITEMS_PER_OPERATION) {
    return `needs a count from 1 to ${String(MAX_ITEMS_PER_OPERATION)}`;
  }

  if (charges !== undefined && !fits) return 'has charges it cannot have';

  return slot !== undefined && slot !== definition.slot ? 'takes another slot' : undefined;
}

/**
 * Returns the bounds of the values of a unit by its attributes now.
 *
 * @throws {ContentError} If the content has no definition of the creature, an attribute cannot be calculated, or the
 * health of one creature is below 1.
 */
export function unitBounds(
  content: ContentRegistry,
  expressions: Expressions,
  healthAttribute: string,
  unit: Unit,
): UnitBounds {
  const { resources } = creatureDefinition(content, unit.creature);
  const target = { kind: 'unit', unit: unit.id } as const;
  const health = valueOf(expressions.attribute(target, healthAttribute), unit.id);

  if (health < 1) throw new ContentError(`The unit ${JSON.stringify(unit.id)} has a health of one creature below 1.`);

  return {
    health,
    resources: Object.fromEntries(sortedEntries(resources).map(([resource, rule]) =>
      [resource, Math.max(0, valueOf(expressions.attribute(target, rule.limit), unit.id))])),
  };
}

/**
 * Returns a unit at the values it starts with by its bounds: the full health of one creature, resources that are full
 * at the start or restored once per battle at their bound, and other resources at 0.
 *
 * @throws {ContentError} If the content has no definition of the creature.
 */
export function startingUnit(content: ContentRegistry, unit: Unit, bounds: UnitBounds): Unit {
  const { resources } = creatureDefinition(content, unit.creature);
  const values = Object.fromEntries(sortedEntries(resources).map(([resource, rule]) =>
    [resource, startsFull(rule) ? bounds.resources[resource] ?? 0 : 0]));

  return { ...unit, health: bounds.health, resources: values };
}

/**
 * Returns a unit after the effects of the scenario at the values it starts the battle with. The health of a unit with
 * creatures and the resources that start full move by as much as their bounds moved from `before` to `after`, within
 * 1 or 0 and the new bound, so what operations of the effects did stays. Then the changes of the options win, and the
 * uses of abilities they give replace the uses of the unit, used neither this turn nor this round.
 *
 * @throws {ContentError} If the content has no definition of the creature.
 * @throws {TypeError} If the changes give a resource the creature does not have or a health out of its bounds.
 */
export function settledUnit(
  content: ContentRegistry,
  unit: Unit,
  before: UnitBounds,
  after: UnitBounds,
  changes: UnitChanges = {},
): Unit {
  const { resources } = creatureDefinition(content, unit.creature);
  const unknown = Object.keys(changes.resources ?? {}).find((resource) => !Object.hasOwn(resources, resource));

  if (unknown !== undefined) {
    throw new TypeError(`The creature of ${JSON.stringify(unit.id)} has no resource ${JSON.stringify(unknown)}.`);
  }

  const values = Object.fromEntries(sortedEntries(resources).map(([resource, rule]) => {
    const value = unit.resources[resource] ?? 0;
    const bound = after.resources[resource] ?? 0;
    const moved = startsFull(rule) ? within(value + bound - (before.resources[resource] ?? 0), 0, bound) : value;

    return [resource, changes.resources?.[resource] ?? moved];
  }));
  const count = changes.count ?? unit.count;
  const moved = unit.count > 0 ? within(unit.health + after.health - before.health, 1, after.health) : after.health;
  const health = changes.health ?? moved;

  if (!Number.isSafeInteger(health) || health < 1 || health > after.health) {
    throw new TypeError(`The unit ${JSON.stringify(unit.id)} needs a health from 1 to ${String(after.health)}.`);
  }

  return {
    ...unit,
    count,
    health: count > 0 ? health : 0,
    resources: values,
    startCount: changes.count ?? unit.startCount,
    ...(changes.abilityUses === undefined ? {} : { abilityUses: spentUses(changes.abilityUses) }),
  };
}

function spentUses(uses: Readonly<Record<ContentName, SpentUses>>): readonly AbilityUse[] {
  return sortedEntries(uses).map(([ability, { battle = 0, cooldown = 0 }]) =>
    ({ ability, battle, cooldown, round: 0, turn: 0 }));
}

function startsFull(rule: ResourceRule): boolean {
  return rule.initial === 'full' || rule.restore === 'battle';
}

function within(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function valueOf(evaluation: Evaluation<number>, unit: UnitId): number {
  if (evaluation.kind === 'value') return evaluation.value;

  throw new ContentError(`An attribute of the unit ${JSON.stringify(unit)} cannot be calculated at the start.`);
}
