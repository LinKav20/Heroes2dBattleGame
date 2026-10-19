import { contentError, creatureDefinition, itemDefinition, type Op } from '../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import {
  defineOperation,
  FORMULA_SCHEMA,
  formulaParam,
  referenceSchema,
  ROLE_SCHEMA,
  roleParam,
  stringParam,
} from '../expressions/index.ts';
import type { OperationContext, OperationExtension, StepResult } from '../extensions/index.ts';
import type { JsonObject } from '../json/index.ts';
import { battleUnit, type Unit } from '../model/index.ts';
import { FULL_NAME_PATTERN, KERNEL_OPERATIONS } from '../names/index.ts';
import { DONE } from './drafts.ts';
import { damaged, healed, type UnitHealth } from './health.ts';
import { addedItems, checkItem, removedItems } from './inventory.ts';
import { MAX_ITEMS_PER_OPERATION } from './limits.ts';

/**
 * The operations on units that the kernel registers itself: damage and heal a unit, change its resource, and add items
 * to its inventory or take them away. Every operation names the unit by the role of a participant in `to` or `from`.
 *
 * Damage and healing take the health of one creature from the attribute that the ruleset names, which must be at
 * least 1. A unit with no creatures left gets neither, and its amount is not even counted; damage or healing below 1
 * does nothing, and healing reaches only the creature that takes damage first. A gain never takes a resource above the
 * attribute that the creature names for it, a loss never takes it below 0, and a resource that is already above a
 * bound that went down keeps its value until it is spent. A resource the creature does not have is an error of
 * content. Items fill the stacks of the same item that are not equipped, then form new ones, and are taken from the
 * last stacks first; `count` is from 1 to {@link MAX_ITEMS_PER_OPERATION}, and 1 if not given.
 */
export const UNIT_OPERATION_KINDS: readonly OperationExtension[] = Object.freeze([
  defineOperation({
    name: KERNEL_OPERATIONS.damage,
    params: { amount: FORMULA_SCHEMA, to: ROLE_SCHEMA },
  }, (node, context) => changeHealth(node, context, damaged)),
  defineOperation({
    name: KERNEL_OPERATIONS.heal,
    params: { amount: FORMULA_SCHEMA, to: ROLE_SCHEMA },
  }, (node, context) => changeHealth(node, context, healed)),
  defineOperation({
    name: KERNEL_OPERATIONS.changeResource,
    params: { amount: FORMULA_SCHEMA, resource: { pattern: FULL_NAME_PATTERN, type: 'string' }, to: ROLE_SCHEMA },
  }, changeResource),
  defineOperation({
    name: KERNEL_OPERATIONS.addItem,
    optional: ['count'],
    params: { count: countSchema(), item: referenceSchema('item'), to: ROLE_SCHEMA },
  }, addItem),
  defineOperation({
    name: KERNEL_OPERATIONS.removeItem,
    optional: ['count'],
    params: { count: countSchema(), from: ROLE_SCHEMA, item: referenceSchema('item') },
  }, removeItem),
]);

function changeHealth(
  node: Op,
  context: OperationContext,
  change: (unit: Unit, maxHealth: number, amount: number) => UnitHealth,
): StepResult {
  const unit = unitParam(node, context, 'to');

  if (unit.count === 0) return DONE;

  const amount = context.expressions.value(formulaParam(node, 'amount'));

  if (amount.kind !== 'value') return amount;

  if (amount.value < 1) return DONE;

  const attribute = context.state.ruleset.healthAttribute;
  const maxHealth = context.expressions.attribute({ kind: 'unit', unit: unit.id }, attribute);

  if (maxHealth.kind !== 'value') return maxHealth;

  if (maxHealth.value < 1) {
    throw contentError(node, `needs the attribute ${JSON.stringify(attribute)} of every unit to be at least 1`);
  }

  const { count, health } = change(unit, maxHealth.value, amount.value);

  if (count === unit.count && health === unit.health) return DONE;

  const event = kernelEventDraft(KERNEL_EVENTS.healthChanged, { count, health, unit: unit.id }, unit.visibleTo);

  return { events: [event], kind: 'done' };
}

function changeResource(node: Op, context: OperationContext): StepResult {
  const unit = unitParam(node, context, 'to');
  const resource = stringParam(node, 'resource');
  const rule = creatureDefinition(context.content, unit.creature).resources[resource];

  if (rule === undefined) {
    throw contentError(node, `changes ${JSON.stringify(resource)}, which the creature ${unit.creature} does not have`);
  }

  const amount = context.expressions.value(formulaParam(node, 'amount'));

  if (amount.kind !== 'value') return amount;

  if (amount.value === 0) return DONE;

  const limit = context.expressions.attribute({ kind: 'unit', unit: unit.id }, rule.limit);

  if (limit.kind !== 'value') return limit;

  const current = unit.resources[resource] ?? 0;
  const value = changedResource(current, amount.value, limit.value);

  if (value === current) return DONE;

  const event = kernelEventDraft(KERNEL_EVENTS.resourceChanged, { resource, unit: unit.id, value }, unit.visibleTo);

  return { events: [event], kind: 'done' };
}

function addItem(node: Op, context: OperationContext): StepResult {
  const unit = unitParam(node, context, 'to');
  const definition = itemDefinition(context.content, stringParam(node, 'item'));

  checkItem(definition);

  return { events: addedItems(unit, definition, countParam(node), context.state.nextId), kind: 'done' };
}

function removeItem(node: Op, context: OperationContext): StepResult {
  const unit = unitParam(node, context, 'from');
  const definition = itemDefinition(context.content, stringParam(node, 'item'));

  return { events: removedItems(unit, definition.name, countParam(node)), kind: 'done' };
}

function unitParam(node: Op, context: OperationContext, name: string): Unit {
  const role = roleParam(node, name);
  const subject = context.subjects[role];

  if (subject?.kind !== 'unit') throw contentError(node, `needs a unit as ${role} in ${JSON.stringify(name)}`);

  return battleUnit(context.state, subject.unit);
}

function countParam(node: Op): number {
  const { count } = node;

  if (count === undefined) return 1;

  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1 || count > MAX_ITEMS_PER_OPERATION) {
    throw contentError(node, `needs a whole number from 1 to ${String(MAX_ITEMS_PER_OPERATION)} in "count"`);
  }

  return count;
}

function countSchema(): JsonObject {
  return { maximum: MAX_ITEMS_PER_OPERATION, minimum: 1, type: 'integer' };
}

function changedResource(current: number, amount: number, limit: number): number {
  const wanted = BigInt(current) + BigInt(amount);

  if (amount < 0) return Number(wanted < 0n ? 0n : wanted);

  const bound = BigInt(Math.max(0, limit));

  return Number(wanted > bound ? (BigInt(current) > bound ? BigInt(current) : bound) : wanted);
}
