import type { ContentRegistry, ExpressionNode, Predicate, ValueExpr } from '../content/index.ts';
import type { ContentName, UnitId } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { BattleState, Target } from '../model/index.ts';
import type { Extension } from '../names/index.ts';
import type { RollNeed } from './step-needs.ts';
import type { StepNeedsValue, StepRejects } from './step-results.ts';

/**
 * The participants a formula or a condition refers to: `self` is the unit or the side whose effect, ability or item
 * it is, `source` is the one that applied the effect, and `target` is the target of the action.
 */
export interface Subjects {
  /** The unit or the side whose effect, ability or item it is. */
  readonly self?: Target;
  /** The unit or the side that applied the effect. */
  readonly source?: Target;
  /** The target of the action. */
  readonly target?: Target;
}

/**
 * A participant a formula or a condition refers to by its role.
 */
export type SubjectRole = keyof Subjects;

/**
 * The result of evaluating a formula or a condition: the value, a value the evaluation needs first, such as a dice
 * roll, or the rejection of the command because a result is out of the allowed range. A step returns a result that is
 * not a value as its own result.
 */
export type Evaluation<Value> = EvaluatedValue<Value> | StepNeedsValue | StepRejects;

/**
 * The value of a formula or a condition.
 */
export interface EvaluatedValue<Value> {
  /** The kind of result. */
  readonly kind: 'value';
  /** The value. */
  readonly value: Value;
}

/**
 * Evaluates formulas and conditions of content for one run of a step.
 *
 * A formula or a condition that content describes wrongly, for example a node that no package declares, a dice roll
 * with a wrong number of dice or sides, or a division by zero, is an error of the content, and the evaluation throws a
 * `TypeError`.
 */
export interface Expressions {
  /** Evaluates a formula with the given participants. */
  value(formula: ValueExpr, subjects?: Subjects): Evaluation<number>;
  /** Evaluates a condition with the given participants. */
  test(condition: Predicate, subjects?: Subjects): Evaluation<boolean>;
}

/**
 * What a node of a formula or a condition sees when it is evaluated.
 */
export interface ExpressionContext {
  /** The state with all events of the command so far. */
  readonly state: BattleState;
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** The participants of the formula or the condition. */
  readonly subjects: Subjects;
  /** Evaluates a nested formula with the same participants. */
  value(formula: ValueExpr): Evaluation<number>;
  /** Evaluates a nested condition with the same participants. */
  test(condition: Predicate): Evaluation<boolean>;
  /**
   * Returns the value of an attribute of a unit by the full name of the attribute: the base value of its creature
   * changed by the modifiers of the effects that act on it.
   */
  attribute(unit: UnitId, attribute: ContentName): Evaluation<number>;
  /**
   * Returns the sum of a dice roll: the next roll the step has received, or the need of the roll if there is none yet.
   */
  roll(need: RollNeed): Evaluation<number>;
}

/**
 * A node of conditions in content, such as "and", "has tag" or "adjacent cell".
 */
export interface ConditionExtension extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'condition';
  /** The JSON Schema of the node with its parameters; the content loader checks nodes by it. */
  readonly schema: JsonObject;
  /** Evaluates the node. The function has no side effects. */
  test(node: ExpressionNode, context: ExpressionContext): Evaluation<boolean>;
}

/**
 * A node of formulas in content, such as a dice roll, a reference to an attribute or a sum.
 */
export interface FormulaExtension extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'formula';
  /** The JSON Schema of the node with its parameters; the content loader checks nodes by it. */
  readonly schema: JsonObject;
  /** Evaluates the node to a safe integer. The function has no side effects. */
  evaluate(node: ExpressionNode, context: ExpressionContext): Evaluation<number>;
}
