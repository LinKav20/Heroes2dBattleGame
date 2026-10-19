import { contentError, type ExpressionNode, type Op, effectDefinition } from '../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import {
  CONDITION_SCHEMA,
  defineOperation,
  FORMULA_SCHEMA,
  isCondition,
  isFormula,
  listParam,
  listSchema,
  matchesAny,
  NAME_SCHEMA,
  referenceSchema,
  stringParam,
  SUBJECT_ROLES,
} from '../expressions/index.ts';
import type { OperationContext, OperationExtension, StepResult } from '../extensions/index.ts';
import { VISIBLE_TO_ALL } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';
import { targetHolder, type EffectHolder } from '../model/index.ts';
import { KERNEL_OPERATIONS } from '../names/index.ts';
import { stepsDone } from '../operations/index.ts';
import { isRecord } from '../shared/index.ts';
import { applicationDraft, removalDraft } from './drafts.ts';
import { effectsOf, sideOf } from './holders.ts';

/**
 * The operations that the kernel registers itself: apply an effect, remove effects by tags and set a scenario
 * variable. An effect is applied to or removed from a participant by its role, the side of the participant if `side`
 * is `true`, or the field. The source of an applied effect is the participant `self`. A variable gets a boolean, a
 * string, the value of a formula in `value` or the result of a condition in `condition`.
 */
export const KERNEL_OPERATION_KINDS: readonly OperationExtension[] = Object.freeze([
  defineOperation({
    name: KERNEL_OPERATIONS.applyEffect,
    optional: ['params', 'side'],
    params: {
      effect: referenceSchema('effect'),
      params: { type: 'object' },
      side: { type: 'boolean' },
      to: holderRoles(),
    },
  }, applyEffect),
  defineOperation({
    name: KERNEL_OPERATIONS.removeEffects,
    optional: ['side'],
    params: { from: holderRoles(), side: { type: 'boolean' }, tags: listSchema(NAME_SCHEMA) },
  }, removeEffects),
  defineOperation({
    name: KERNEL_OPERATIONS.setVariable,
    optional: ['condition', 'value'],
    params: {
      condition: CONDITION_SCHEMA,
      value: { anyOf: [{ type: ['boolean', 'string'] }, FORMULA_SCHEMA] },
      variable: NAME_SCHEMA,
    },
    schema: { oneOf: [{ required: ['value'] }, { required: ['condition'] }] },
  }, setVariable),
]);

/**
 * Returns the holder a parameter of an operation names: `field`, or the participant with this role, or its side if
 * the operation has `side: true`.
 *
 * @throws {ContentError} If the parameter names no participant that is a unit or a side, or the participant has no
 * side.
 */
export function holderParam(node: ExpressionNode, context: OperationContext, name: string): EffectHolder {
  const role = node[name];
  const side = node.side === true;

  if (role === 'field' && !side) return { kind: 'field' };

  const known = SUBJECT_ROLES.find((candidate) => candidate === role);
  const holder = targetHolder(known === undefined ? undefined : context.subjects[known]);

  if (holder === undefined) {
    throw contentError(node, `needs field or a unit or a side among the participants in ${JSON.stringify(name)}`);
  }

  if (!side) return holder;

  const owner = sideOf(context.state, holder);

  if (owner === undefined) throw contentError(node, `refers to the side of ${JSON.stringify(role)}, which has none`);

  return { kind: 'side', side: owner };
}

function applyEffect(node: Op, context: OperationContext): StepResult {
  const holder = holderParam(node, context, 'to');
  const params = isRecord(node.params) ? node.params : undefined;
  const source = targetHolder(context.subjects.self);

  return stepsDone([applicationDraft({
    effect: stringParam(node, 'effect'),
    holder,
    ...(params === undefined ? {} : { params }),
    ...(source === undefined ? {} : { source }),
  })]);
}

function removeEffects(node: Op, context: OperationContext): StepResult {
  const holder = holderParam(node, context, 'from');
  const tags = listParam(node, 'tags', (value): value is string => typeof value === 'string');
  const removed = effectsOf(context.state, holder)
    .filter(({ effect }) => matchesAny(effectDefinition(context.content, effect).tags, tags))
    .map(({ id }) => removalDraft({ effect: id, holder }));

  return stepsDone(removed);
}

function setVariable(node: Op, context: OperationContext): StepResult {
  const variable = stringParam(node, 'variable');
  const { condition, value } = node;

  if ((condition === undefined) === (value === undefined)) {
    throw contentError(node, 'needs either "value" or "condition"');
  }

  if (typeof value === 'boolean' || typeof value === 'string') {
    return { events: [kernelEventDraft(KERNEL_EVENTS.variableSet, { value, variable }, VISIBLE_TO_ALL)], kind: 'done' };
  }

  if (condition !== undefined && !isCondition(condition)) throw contentError(node, 'needs a condition in "condition"');

  if (value !== undefined && !isFormula(value)) {
    throw contentError(node, 'needs a boolean, a string or a formula in "value"');
  }

  const result = condition === undefined ? context.expressions.value(value ?? 0) : context.expressions.test(condition);

  if (result.kind !== 'value') return result;

  const event = kernelEventDraft(KERNEL_EVENTS.variableSet, { value: result.value, variable }, VISIBLE_TO_ALL);

  return { events: [event], kind: 'done' };
}

function holderRoles(): JsonObject {
  return { enum: ['field', ...SUBJECT_ROLES] };
}
