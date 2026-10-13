import type { JsonValue } from '../json/index.ts';

/**
 * A node of a behavior tree in content: an operation, a condition or a formula.
 *
 * `type` is the full name `package:name` of the implementation in a kernel registry, for example
 * `rules-stdlib:damage`. Packs may write short names, and the content loader replaces them with full names before the
 * kernel gets the definitions. The other fields are the parameters of the node; nested nodes are parameters too.
 */
export interface ExpressionNode {
  /** The full name of the implementation in a registry. */
  readonly type: string;
  /** The parameters of the node. */
  readonly [parameter: string]: JsonValue;
}

/**
 * An operation: an action of the engine such as damage, healing, applying an effect or summoning.
 */
export type Op = ExpressionNode;

/**
 * A condition: a logical expression such as "and", "has tag" or "adjacent cell". `true` and `false` are conditions
 * too.
 */
export type Predicate = boolean | ExpressionNode;

/**
 * A formula: a numeric expression such as a dice roll, a reference to an attribute or arithmetic. A safe integer is a
 * formula too.
 */
export type ValueExpr = ExpressionNode | number;
