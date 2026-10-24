import { contentError, type ExpressionNode } from '../../content/index.ts';
import type { Evaluation, ExpressionContext, FormulaExtension } from '../../extensions/index.ts';
import { ownValue } from '../../shared/index.ts';
import { optionalFormulaParam, stringParam } from '../params.ts';
import { evaluated } from '../results.ts';
import { defineFormula } from './define.ts';
import { eventField, eventPath } from './event-fields.ts';
import { KERNEL_FORMULAS } from './names.ts';
import { FORMULA_SCHEMA, listSchema, NAME_SCHEMA } from './schema.ts';

/**
 * The nodes of formulas that the kernel registers itself for the scope of an evaluation: a parameter and the number of
 * stacks of the applied effect the formula belongs to, and a number from the payload of the event a reaction reacts
 * to. A missing value gives the formula in `default`, if the node has one.
 */
export const SCOPE_KINDS: readonly FormulaExtension[] = [
  defineFormula(
    {
      name: KERNEL_FORMULAS.effectParam,
      optional: ['default'],
      params: { default: FORMULA_SCHEMA, param: NAME_SCHEMA },
    },
    (node, context) => {
      const param = stringParam(node, 'param');
      const params = context.effect?.params;
      const found = params === undefined ? undefined : ownValue(params, param);

      return orDefault(node, context, found, `the parameter ${JSON.stringify(param)} of an applied effect`);
    },
  ),
  defineFormula({ name: KERNEL_FORMULAS.effectStacks, params: {} }, (node, context) => {
    if (context.effect === undefined) throw contentError(node, 'is evaluated outside of an applied effect');

    return evaluated(context.effect.stacks);
  }),
  defineFormula(
    {
      name: KERNEL_FORMULAS.eventValue,
      optional: ['default'],
      params: { default: FORMULA_SCHEMA, path: listSchema(NAME_SCHEMA) },
    },
    (node, context) => {
      const what = `the field ${JSON.stringify(eventPath(node).join('.'))} of an event`;

      return orDefault(node, context, eventField(node, context), what);
    },
  ),
];

function orDefault(node: ExpressionNode, context: ExpressionContext, found: unknown, what: string): Evaluation<number> {
  if (Number.isSafeInteger(found)) return evaluated(Number(found));

  if (found !== undefined) throw contentError(node, `needs ${what} as a safe integer, not ${JSON.stringify(found)}`);

  const fallback = optionalFormulaParam(node, 'default');

  if (fallback === undefined) throw contentError(node, `needs ${what}, but there is none`);

  return context.value(fallback);
}
