import type { ExpressionNode, Predicate, ValueExpr } from '../../content/index.ts';
import type {
  ConditionExtension,
  Evaluation,
  ExpressionContext,
  FormulaExtension,
} from '../../extensions/index.ts';
import type { JsonObject } from '../../json/index.ts';
import { evaluated, outOfRange } from '../results.ts';
import { nodeSchema } from './schema.ts';

/**
 * Declares a node of conditions of the kernel with the schema of its parameters.
 */
export function defineCondition(
  name: string,
  params: Readonly<Record<string, JsonObject>>,
  test: (node: ExpressionNode, context: ExpressionContext) => Evaluation<boolean>,
): ConditionExtension {
  return Object.freeze({ kind: 'condition', name, schema: nodeSchema(name, params), test });
}

/**
 * Declares a node of formulas of the kernel with the schema of its parameters.
 */
export function defineFormula(
  name: string,
  params: Readonly<Record<string, JsonObject>>,
  evaluate: (node: ExpressionNode, context: ExpressionContext) => Evaluation<number>,
): FormulaExtension {
  return Object.freeze({ evaluate, kind: 'formula', name, schema: nodeSchema(name, params) });
}

/**
 * Returns a value of a formula, or the rejection of the command if the value is out of the safe range.
 */
export function checked(node: ExpressionNode, value: number | undefined): Evaluation<number> {
  return value === undefined ? outOfRange(node) : evaluated(value);
}

/**
 * Evaluates formulas one after another and returns their values, or the first result that is not a value.
 */
export function valuesOf(formulas: readonly ValueExpr[], context: ExpressionContext): Evaluation<readonly number[]> {
  const values: number[] = [];

  for (const formula of formulas) {
    const result = context.value(formula);

    if (result.kind !== 'value') return result;

    values.push(result.value);
  }

  return evaluated(values);
}

/**
 * Evaluates conditions one after another and stops at the first one that differs from `until`: so `and` stops at the
 * first false condition and `or` at the first true one.
 */
export function testUntil(
  conditions: readonly Predicate[],
  context: ExpressionContext,
  until: boolean,
): Evaluation<boolean> {
  for (const condition of conditions) {
    const result = context.test(condition);

    if (result.kind !== 'value' || result.value !== until) return result;
  }

  return evaluated(until);
}
