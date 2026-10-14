import type { ExpressionNode } from '../../content/index.ts';
import type { ExpressionContext, FormulaExtension } from '../../extensions/index.ts';
import { difference, percentOf, product, quotient, sum } from '../arithmetic.ts';
import { contentError, formulaParam, isFormula, listParam } from '../params.ts';
import { checked, defineFormula, valuesOf } from './define.ts';
import { KERNEL_FORMULAS } from './names.ts';
import { FORMULA_SCHEMA, listSchema } from './schema.ts';

/**
 * The nodes of formulas that the kernel registers itself for arithmetic: sum, difference, product, quotient, percent,
 * smallest and largest value. Every result is a safe integer, and a quotient or a percent is rounded as the ruleset
 * says.
 */
export const ARITHMETIC_KINDS: readonly FormulaExtension[] = [
  ofList(KERNEL_FORMULAS.add, (values) => sum(values)),
  ofList(KERNEL_FORMULAS.multiply, (values) => product(values)),
  ofList(KERNEL_FORMULAS.min, (values) => Math.min(...values)),
  ofList(KERNEL_FORMULAS.max, (values) => Math.max(...values)),
  ofPair(KERNEL_FORMULAS.subtract, ['left', 'right'], (left, right) => difference(left, right)),
  ofPair(KERNEL_FORMULAS.divide, ['left', 'right'], (left, right, node, context) => {
    if (right === 0) throw contentError(node, 'divides by 0');

    return quotient(left, right, context.state.ruleset.rounding);
  }),
  ofPair(KERNEL_FORMULAS.percent, ['value', 'percent'], (value, percent, node, context) =>
    percentOf(value, percent, context.state.ruleset.rounding)),
];

function ofList(name: string, combine: (values: readonly number[]) => number | undefined): FormulaExtension {
  return defineFormula(name, { values: listSchema(FORMULA_SCHEMA) }, (node, context) => {
    const values = valuesOf(listParam(node, 'values', isFormula), context);

    return values.kind === 'value' ? checked(node, combine(values.value)) : values;
  });
}

function ofPair(
  name: string,
  [first, second]: readonly [string, string],
  combine: (left: number, right: number, node: ExpressionNode, context: ExpressionContext) => number | undefined,
): FormulaExtension {
  return defineFormula(name, { [first]: FORMULA_SCHEMA, [second]: FORMULA_SCHEMA }, (node, context) => {
    const values = valuesOf([formulaParam(node, first), formulaParam(node, second)], context);

    if (values.kind !== 'value') return values;

    const [left = 0, right = 0] = values.value;

    return checked(node, combine(left, right, node, context));
  });
}
