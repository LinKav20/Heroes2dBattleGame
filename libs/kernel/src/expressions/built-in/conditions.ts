import { ContentError, contentError, type ExpressionNode } from '../../content/index.ts';
import type { ConditionExtension, Evaluation, ExpressionContext } from '../../extensions/index.ts';
import type { Target } from '../../model/index.ts';
import { ownValue } from '../../shared/index.ts';
import { conditionParam, formulaParam, isCondition, listParam, roleParam, stringParam } from '../params.ts';
import { evaluated } from '../results.ts';
import { subjectUnit } from '../subjects.ts';
import { hasTag } from '../tags.ts';
import { defineCondition, everyHolds, someHolds } from './define.ts';
import { eventField } from './event-fields.ts';
import { COMPARISON_OPERATORS, KERNEL_CONDITIONS, SUBJECT_KINDS } from './names.ts';
import { CONDITION_SCHEMA, FORMULA_SCHEMA, listSchema, NAME_SCHEMA, ROLE_SCHEMA } from './schema.ts';

/**
 * The nodes of conditions that the kernel registers itself: logical connectives, a comparison of numbers, a check of
 * a tag, checks of participants, checks of the event a reaction reacts to and a check of a scenario variable.
 * `kernel:event-is` tells whether a field of the payload at `path` equals `value`, and `kernel:event-names` whether
 * it names the unit or the side that is the participant `of`; without an event or the field both are false.
 */
export const CONDITION_KINDS: readonly ConditionExtension[] = [
  defineCondition(
    { name: KERNEL_CONDITIONS.and, params: { conditions: listSchema(CONDITION_SCHEMA) } },
    (node, context) => everyHolds(listParam(node, 'conditions', isCondition), context),
  ),
  defineCondition(
    { name: KERNEL_CONDITIONS.or, params: { conditions: listSchema(CONDITION_SCHEMA) } },
    (node, context) => someHolds(listParam(node, 'conditions', isCondition), context),
  ),
  defineCondition({ name: KERNEL_CONDITIONS.not, params: { condition: CONDITION_SCHEMA } }, (node, context) => {
    const result = context.test(conditionParam(node, 'condition'));

    return result.kind === 'value' ? evaluated(!result.value) : result;
  }),
  defineCondition({
    name: KERNEL_CONDITIONS.compare,
    params: { left: FORMULA_SCHEMA, operator: { enum: [...COMPARISON_OPERATORS] }, right: FORMULA_SCHEMA },
  }, compare),
  defineCondition({
    name: KERNEL_CONDITIONS.hasTag,
    params: { of: ROLE_SCHEMA, tag: NAME_SCHEMA },
  }, (node, context) => {
    const tag = stringParam(node, 'tag');
    const unit = subjectUnit(context, roleParam(node, 'of'));

    if (unit === undefined) return evaluated(false);

    const tags = context.tags(unit.id);

    return tags.kind === 'value' ? evaluated(hasTag(tags.value, tag)) : tags;
  }),
  defineCondition({
    name: KERNEL_CONDITIONS.same,
    params: { left: ROLE_SCHEMA, right: ROLE_SCHEMA },
  }, (node, context) => {
    const left = context.subjects[roleParam(node, 'left')];
    const right = context.subjects[roleParam(node, 'right')];

    return evaluated(left !== undefined && right !== undefined && sameTarget(left, right));
  }),
  defineCondition(
    { name: KERNEL_CONDITIONS.subjectIs, params: { kind: { enum: [...SUBJECT_KINDS] }, of: ROLE_SCHEMA } },
    (node, context) => {
      const kind = SUBJECT_KINDS.find((known) => known === node.kind);

      if (kind === undefined) throw contentError(node, `needs ${SUBJECT_KINDS.join(', ')} in "kind"`);

      return evaluated(context.subjects[roleParam(node, 'of')]?.kind === kind);
    },
  ),
  defineCondition(
    {
      name: KERNEL_CONDITIONS.eventIs,
      params: { path: listSchema(NAME_SCHEMA), value: { type: ['boolean', 'integer', 'string'] } },
    },
    (node, context) => {
      const expected = node.value;

      if (!(typeof expected === 'boolean' || typeof expected === 'string' || Number.isSafeInteger(expected))) {
        throw contentError(node, 'needs a boolean, a safe integer or a string in "value"');
      }

      return evaluated(eventField(node, context) === expected);
    },
  ),
  defineCondition(
    { name: KERNEL_CONDITIONS.eventNames, params: { of: ROLE_SCHEMA, path: listSchema(NAME_SCHEMA) } },
    (node, context) => {
      const subject = context.subjects[roleParam(node, 'of')];
      const found = eventField(node, context);

      if (subject?.kind === 'unit') return evaluated(found === subject.unit);

      return evaluated(subject?.kind === 'side' && found === subject.side);
    },
  ),
  defineCondition(
    {
      name: KERNEL_CONDITIONS.variableIs,
      params: { value: { type: ['boolean', 'integer', 'string'] }, variable: NAME_SCHEMA },
    },
    (node, context) => {
      const variable = stringParam(node, 'variable');
      const expected = node.value;
      const actual = ownValue(context.state.variables, variable);

      if (!(typeof expected === 'boolean' || typeof expected === 'string' || Number.isSafeInteger(expected))) {
        throw contentError(node, 'needs a boolean, a safe integer or a string in "value"');
      }

      if (actual === undefined) {
        throw contentError(node, `refers to the variable ${JSON.stringify(variable)}, which is absent`);
      }

      return evaluated(actual === expected);
    },
  ),
];

function compare(node: ExpressionNode, context: ExpressionContext): Evaluation<boolean> {
  const operator = COMPARISON_OPERATORS.find((known) => known === node.operator);

  if (operator === undefined) throw contentError(node, `needs one of ${COMPARISON_OPERATORS.join(' ')} in "operator"`);

  const left = context.value(formulaParam(node, 'left'));

  if (left.kind !== 'value') return left;

  const right = context.value(formulaParam(node, 'right'));

  if (right.kind !== 'value') return right;

  return evaluated(holds(left.value, operator, right.value));
}

function holds(left: number, operator: (typeof COMPARISON_OPERATORS)[number], right: number): boolean {
  switch (operator) {
    case '<': {
      return left < right;
    }

    case '<=': {
      return left <= right;
    }

    case '=': {
      return left === right;
    }

    case '!=': {
      return left !== right;
    }

    case '>=': {
      return left >= right;
    }

    case '>': {
      return left > right;
    }

    default: {
      throw new ContentError('Unknown comparison.');
    }
  }
}

function sameTarget(left: Target, right: Target): boolean {
  switch (left.kind) {
    case 'cell': {
      return right.kind === 'cell' && right.cell === left.cell;
    }

    case 'side': {
      return right.kind === 'side' && right.side === left.side;
    }

    case 'unit': {
      return right.kind === 'unit' && right.unit === left.unit;
    }

    default: {
      throw new TypeError('Unknown kind of participant.');
    }
  }
}
