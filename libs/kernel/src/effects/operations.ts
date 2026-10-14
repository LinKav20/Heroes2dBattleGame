import type { Op } from '../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import {
  contentError,
  isFormula,
  isNode,
  listParam,
  matchesAny,
  nodeSchema,
  stringParam,
} from '../expressions/index.ts';
import type {
  OperationContext,
  OperationExtension,
  StepContext,
  StepKind,
  StepResult,
  Subjects,
} from '../extensions/index.ts';
import type { EffectHolder } from '../model/index.ts';
import type { Registry } from '../names/index.ts';
import { isRecord } from '../shared/index.ts';
import { applicationDraft, removalDraft } from './drafts.ts';
import { effectDefinition, effectsOf } from './holders.ts';
import { KERNEL_OPERATIONS, KERNEL_STEPS } from './names.ts';
import type { OperationParams } from './params.ts';
import { APPLY_PARAMS, REMOVE_PARAMS, SET_PARAMS } from './schemas.ts';

/**
 * The operations that the kernel registers itself: apply an effect, remove effects by tags and set a scenario
 * variable. An effect is applied to or removed from a participant by its role, or from the field.
 */
export const KERNEL_OPERATION_KINDS: readonly OperationExtension[] = Object.freeze([
  operation(KERNEL_OPERATIONS.applyEffect, APPLY_PARAMS, (node, context) => {
    const holder = holderParam(node, context.subjects, 'to');
    const { self } = context.subjects;
    const params = isRecord(node.params) ? (node.params) : undefined;
    const source = self?.kind === 'side' || self?.kind === 'unit' ? self : undefined;

    return {
      events: [],
      kind: 'done',
      steps: [applicationDraft({
        effect: stringParam(node, 'effect'),
        holder,
        ...(params === undefined ? {} : { params }),
        ...(source === undefined ? {} : { source }),
      })],
    };
  }, ['params']),
  operation(KERNEL_OPERATIONS.removeEffects, REMOVE_PARAMS, (node, context) => {
    const holder = holderParam(node, context.subjects, 'from');
    const tags = listParam(node, 'tags', (value): value is string => typeof value === 'string');
    const removed = effectsOf(context.state, holder)
      .filter(({ effect }) => matchesAny(effectDefinition(context.content, effect).tags, tags))
      .map(({ id }) => removalDraft(holder, id));

    return { events: [], kind: 'done', steps: removed };
  }),
  operation(KERNEL_OPERATIONS.setVariable, SET_PARAMS, (node, context) => {
    const variable = stringParam(node, 'variable');
    const { value } = node;

    if (typeof value === 'boolean' || typeof value === 'string') {
      return { events: [kernelEventDraft(KERNEL_EVENTS.variableSet, { value, variable }, 'all')], kind: 'done' };
    }

    if (!isFormula(value)) throw contentError(node, 'needs a boolean, a string or a formula in "value"');

    const result = context.expressions.value(value, context.subjects);

    if (result.kind !== 'value') return result;

    const event = kernelEventDraft(KERNEL_EVENTS.variableSet, { value: result.value, variable }, 'all');

    return { events: [event], kind: 'done' };
  }),
]);

/**
 * Returns the kind of step that runs one operation of content by its node.
 */
export function operationStep(operations: () => Registry<OperationExtension>): StepKind<OperationParams> {
  return Object.freeze({
    kind: 'step',
    migrations: [],
    name: KERNEL_STEPS.operation,
    run: ({ content, expressions, inputs, params, state }: StepContext<OperationParams>): StepResult => {
      const { op, subjects } = params;

      if (!isNode(op)) throw new TypeError(`${JSON.stringify(op)} is not an operation.`);

      const kind = operations().get(op.type);

      if (kind === undefined) throw new TypeError(`The kernel has no operation ${JSON.stringify(op.type)}.`);

      return kind.run(op, { content, expressions, inputs, state, subjects });
    },
    version: 1,
  });
}

function operation(
  name: string,
  params: Parameters<typeof nodeSchema>[1],
  run: (node: Op, context: OperationContext) => StepResult,
  optional: readonly string[] = [],
): OperationExtension {
  return Object.freeze({ kind: 'operation', name, run, schema: nodeSchema(name, params, optional) });
}

function holderParam(node: Op, subjects: Subjects, name: string): EffectHolder {
  const role = node[name];

  if (role === 'field') return { kind: 'field' };

  const subject = role === 'self' || role === 'source' || role === 'target' ? subjects[role] : undefined;

  if (subject?.kind === 'side') return { kind: 'side', side: subject.side };

  if (subject?.kind === 'unit') return { kind: 'unit', unit: subject.unit };

  throw contentError(node, `needs field or a unit or a side among the participants in ${JSON.stringify(name)}`);
}
