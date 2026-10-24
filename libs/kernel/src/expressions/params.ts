import { contentError, type ExpressionNode, type Predicate, type ValueExpr } from '../content/index.ts';
import type { SubjectRole } from '../extensions/index.ts';
import type { JsonValue } from '../json/index.ts';
import { isRecord } from '../shared/index.ts';
import { SUBJECT_ROLES } from './subjects.ts';

/**
 * Tells whether a value is a formula: a safe integer or a node.
 */
export function isFormula(value: unknown): value is ValueExpr {
  return Number.isSafeInteger(value) || isNode(value);
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
 * @throws {ContentError} If the parameter is not a formula.
 */
export function formulaParam(node: ExpressionNode, name: string): ValueExpr {
  const value = node[name];

  if (!isFormula(value)) throw contentError(node, `needs a formula in ${JSON.stringify(name)}`);

  return value;
}

/**
 * Returns a condition parameter of a node.
 *
 * @throws {ContentError} If the parameter is not a condition.
 */
export function conditionParam(node: ExpressionNode, name: string): Predicate {
  const value = node[name];

  if (!isCondition(value)) throw contentError(node, `needs a condition in ${JSON.stringify(name)}`);

  return value;
}

/**
 * Returns a list parameter of a node with at least one item of the right kind.
 *
 * @throws {ContentError} If the parameter is not such a list.
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
 * Returns a parameter of a node that is true or false, or false if it is absent.
 *
 * @throws {ContentError} If the parameter is neither true nor false.
 */
export function flagParam(node: ExpressionNode, name: string): boolean {
  const value = node[name];

  if (value !== undefined && typeof value !== 'boolean') {
    throw contentError(node, `needs true or false in ${JSON.stringify(name)}`);
  }

  return value === true;
}

/**
 * Returns a string parameter of a node.
 *
 * @throws {ContentError} If the parameter is not a non-empty string.
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
 * @throws {ContentError} If the parameter names no participant.
 */
export function roleParam(node: ExpressionNode, name: string): SubjectRole {
  const value = node[name];
  const role = SUBJECT_ROLES.find((known) => known === value);

  if (role === undefined) throw contentError(node, `needs ${SUBJECT_ROLES.join(', ')} in ${JSON.stringify(name)}`);

  return role;
}

/**
 * Returns an optional formula parameter of a node, or nothing if the node has no such parameter.
 *
 * @throws {ContentError} If the parameter is there, but is not a formula.
 */
export function optionalFormulaParam(node: ExpressionNode, name: string): ValueExpr | undefined {
  return node[name] === undefined ? undefined : formulaParam(node, name);
}

/**
 * Returns an optional string parameter of a node, or nothing if the node has no such parameter.
 *
 * @throws {ContentError} If the parameter is there, but is not a non-empty string.
 */
export function optionalStringParam(node: ExpressionNode, name: string): string | undefined {
  return node[name] === undefined ? undefined : stringParam(node, name);
}

/**
 * Returns a parameter of a node that is one of the given values, or the fallback if the node has no such parameter.
 *
 * @throws {ContentError} If the parameter is there, but is none of the values.
 */
export function enumParam<Value extends string>(
  node: ExpressionNode,
  name: string,
  values: readonly Value[],
  fallback: Value,
): Value {
  const value = node[name];

  if (value === undefined) return fallback;

  const known = values.find((candidate) => candidate === value);

  if (known === undefined) throw contentError(node, `needs ${values.join(', ')} in ${JSON.stringify(name)}`);

  return known;
}
