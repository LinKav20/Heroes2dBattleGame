import type { ExpressionNode, Predicate, ValueExpr } from '../content/index.ts';
import type { SubjectRole } from '../extensions/index.ts';
import type { JsonValue } from '../json/index.ts';
import { isRecord } from '../shared/index.ts';

/**
 * Returns an error of content about a node: the content describes the node wrongly.
 */
export function contentError(node: ExpressionNode, problem: string): TypeError {
  return new TypeError(`The node ${JSON.stringify(node.type)} ${problem}.`);
}

/**
 * Tells whether a value is a formula: a safe integer or a node.
 */
export function isFormula(value: unknown): value is ValueExpr {
  return typeof value === 'number' || isNode(value);
}

/**
 * Tells whether a value is a condition: `true`, `false` or a node.
 */
export function isCondition(value: unknown): value is Predicate {
  return typeof value === 'boolean' || isNode(value);
}

/**
 * Tells whether a value is a node: an object with the full name of its implementation in `type`.
 */
export function isNode(value: unknown): value is ExpressionNode {
  return isRecord(value) && typeof value.type === 'string';
}

/**
 * Returns a formula parameter of a node.
 *
 * @throws {TypeError} If the parameter is not a formula.
 */
export function formulaParam(node: ExpressionNode, name: string): ValueExpr {
  const value = node[name];

  if (!isFormula(value)) throw contentError(node, `needs a formula in ${JSON.stringify(name)}`);

  return value;
}

/**
 * Returns a condition parameter of a node.
 *
 * @throws {TypeError} If the parameter is not a condition.
 */
export function conditionParam(node: ExpressionNode, name: string): Predicate {
  const value = node[name];

  if (!isCondition(value)) throw contentError(node, `needs a condition in ${JSON.stringify(name)}`);

  return value;
}

/**
 * Returns a list parameter of a node with at least one item of the right kind.
 *
 * @throws {TypeError} If the parameter is not such a list.
 */
export function listParam<Item extends JsonValue>(
  node: ExpressionNode,
  name: string,
  isItem: (value: unknown) => value is Item,
): readonly Item[] {
  const value = node[name];

  if (!Array.isArray(value) || value.length === 0 || !value.every(isItem)) {
    throw contentError(node, `needs a non-empty list in ${JSON.stringify(name)}`);
  }

  return value;
}

/**
 * Returns a string parameter of a node.
 *
 * @throws {TypeError} If the parameter is not a non-empty string.
 */
export function stringParam(node: ExpressionNode, name: string): string {
  const value = node[name];

  if (typeof value !== 'string' || value.length === 0) {
    throw contentError(node, `needs a non-empty string in ${JSON.stringify(name)}`);
  }

  return value;
}

/**
 * Returns a parameter of a node that names a participant: `self`, `source` or `target`.
 *
 * @throws {TypeError} If the parameter names no participant.
 */
export function roleParam(node: ExpressionNode, name: string): SubjectRole {
  const value = node[name];
  const role = SUBJECT_ROLES.find((known) => known === value);

  if (role === undefined) throw contentError(node, `needs ${SUBJECT_ROLES.join(', ')} in ${JSON.stringify(name)}`);

  return role;
}

const SUBJECT_ROLES: readonly SubjectRole[] = ['self', 'source', 'target'];
