import type { ExpressionNode, Op, Predicate, ValueExpr } from '../../content/index.ts';
import type {
  ConditionExtension,
  Evaluation,
  ExpressionContext,
  FormulaExtension,
  OperationContext,
  OperationExtension,
  StepResult,
} from '../../extensions/index.ts';
import type { JsonObject } from '../../json/index.ts';
import { evaluated, outOfRange } from '../results.ts';
import { nodeSchema } from './schema.ts';

/**
 * How a node is declared: its full name, the schemas of its parameters, which of them are optional, its short name
 * and other keys of its schema, such as `oneOf`.
 */
export interface NodeDeclaration {
  /** The full name of the node. */
  readonly name: string;
  /** The JSON Schemas of the parameters by name; every parameter is required unless it is optional. */
  readonly params: Readonly<Record<string, JsonObject>>;
  /** The parameters that may be absent. */
  readonly optional?: readonly string[];
  /** The short name of the node, if it has one. */
  readonly shortName?: string;
  /** Other keys of the schema of the node. */
  readonly schema?: JsonObject;
}

/**
 * Declares a node of conditions with the schema built from its declaration.
 *
 * @throws {TypeError} If a parameter is called `type`, or an optional parameter is not among the parameters.
 */
export function defineCondition<Node extends ExpressionNode = ExpressionNode>(
  declaration: NodeDeclaration,
  test: (node: Node, context: ExpressionContext) => Evaluation<boolean>,
): ConditionExtension<Node> {
  return Object.freeze({ ...extensionOf(declaration), kind: 'condition', test });
}

/**
 * Declares a node of formulas with the schema built from its declaration.
 *
 * @throws {TypeError} If a parameter is called `type`, or an optional parameter is not among the parameters.
 */
export function defineFormula<Node extends ExpressionNode = ExpressionNode>(
  declaration: NodeDeclaration,
  evaluate: (node: Node, context: ExpressionContext) => Evaluation<number>,
): FormulaExtension<Node> {
  return Object.freeze({ ...extensionOf(declaration), evaluate, kind: 'formula' });
}

/**
 * Declares an operation with the schema built from its declaration.
 *
 * @throws {TypeError} If a parameter is called `type`, or an optional parameter is not among the parameters.
 */
export function defineOperation<Node extends Op = Op>(
  declaration: NodeDeclaration,
  run: (node: Node, context: OperationContext) => StepResult,
): OperationExtension<Node> {
  return Object.freeze({ ...extensionOf(declaration), kind: 'operation', run });
}

/**
 * Returns a value of a formula, or the rejection of the command with `kernel:out-of-range` if the value is missing
 * because it left the safe range, as the arithmetic helpers return it.
 */
export function inSafeRange(node: ExpressionNode, value: number | undefined): Evaluation<number> {
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
 * Evaluates conditions one after another and stops at the first false one, as "and" does.
 */
export function everyHolds(conditions: readonly Predicate[], context: ExpressionContext): Evaluation<boolean> {
  return testUntil(conditions, context, true);
}

/**
 * Evaluates conditions one after another and stops at the first true one, as "or" does.
 */
export function someHolds(conditions: readonly Predicate[], context: ExpressionContext): Evaluation<boolean> {
  return testUntil(conditions, context, false);
}

function extensionOf(declaration: NodeDeclaration): { readonly name: string; readonly schema: JsonObject } {
  const { name, optional = [], params, schema = {}, shortName } = declaration;

  const built = nodeSchema(name, params, optional, schema);

  return { name, schema: built, ...(shortName === undefined ? {} : { shortName }) };
}

function testUntil(conditions: readonly Predicate[], context: ExpressionContext, until: boolean): Evaluation<boolean> {
  for (const condition of conditions) {
    const result = context.test(condition);

    if (result.kind !== 'value' || result.value !== until) return result;
  }

  return evaluated(until);
}
