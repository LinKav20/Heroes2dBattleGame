import type { ExpressionNode } from '../../content/index.ts';
import type { ConditionExtension, Evaluation, ExpressionContext } from '../../extensions/index.ts';
import type { Target } from '../../model/index.ts';
import { ownValue } from '../../shared/index.ts';
import { conditionParam, contentError, formulaParam, isCondition, listParam, roleParam, stringParam }
  from '../params.ts';
import { evaluated } from '../results.ts';
import { subjectUnit } from '../subjects.ts';
import { hasTag } from '../tags.ts';
import { defineCondition, testUntil } from './define.ts';
import { COMPARISON_OPERATORS, KERNEL_CONDITIONS } from './names.ts';
import { CONDITION_SCHEMA, FORMULA_SCHEMA, listSchema, NAME_SCHEMA, ROLE_SCHEMA } from './schema.ts';

/**
 * The nodes of conditions that the kernel registers itself: logical connectives, a comparison of numbers, a check of
 * a tag, a check that two participants are the same and a check of a scenario variable.
 */
export const CONDITION_KINDS: readonly ConditionExtension[] = [
  defineCondition(
    KERNEL_CONDITIONS.and,
    { conditions: listSchema(CONDITION_SCHEMA) },
    (node, context) => testUntil(listParam(node, 'conditions', isCondition), context, true),
  ),
  defineCondition(
    KERNEL_CONDITIONS.or,
    { conditions: listSchema(CONDITION_SCHEMA) },
    (node, context) => testUntil(listParam(node, 'conditions', isCondition), context, false),
  ),
  defineCondition(KERNEL_CONDITIONS.not, { condition: CONDITION_SCHEMA }, (node, context) => {
    const result = context.test(conditionParam(node, 'condition'));

    return result.kind === 'value' ? evaluated(!result.value) : result;
  }),
  defineCondition(
    KERNEL_CONDITIONS.compare,
    { left: FORMULA_SCHEMA, operator: { enum: [...COMPARISON_OPERATORS] }, right: FORMULA_SCHEMA },
    compare,
  ),
  defineCondition(KERNEL_CONDITIONS.hasTag, { of: ROLE_SCHEMA, tag: NAME_SCHEMA }, (node, context) => {
    const tag = stringParam(node, 'tag');
    const { tags } = subjectUnit(node, context, roleParam(node, 'of'));

    return evaluated(hasTag(tags, tag));
  }),
  defineCondition(KERNEL_CONDITIONS.same, { left: ROLE_SCHEMA, right: ROLE_SCHEMA }, (node, context) => {
    const left = context.subjects[roleParam(node, 'left')];
    const right = context.subjects[roleParam(node, 'right')];

    return evaluated(left !== undefined && right !== undefined && sameTarget(left, right));
  }),
  defineCondition(
    KERNEL_CONDITIONS.variableIs,
    { value: { type: ['boolean', 'integer', 'string'] }, variable: NAME_SCHEMA },
    (node, context) => {
      const variable = stringParam(node, 'variable');
      const expected = node.value;
      const actual = ownValue(context.state.variables, variable);

      if (!['boolean', 'number', 'string'].includes(typeof expected)) {
        throw contentError(node, 'needs a boolean, a number or a string in "value"');
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
      throw new TypeError('Unknown comparison.');
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
