import type { ContentRegistry, ExpressionNode, Predicate, ValueExpr } from '../content/index.ts';
import type { ContentName, Tag, UnitId } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { AppliedEffect, BattleEvent, BattleState, SideTarget, Target, UnitTarget } from '../model/index.ts';
import type { Extension } from '../names/index.ts';
import type { RollNeed } from './step-needs.ts';
import type { StepRejects } from './step-results.ts';
import type { FieldGeometry } from './topology.ts';

/**
 * The participants a formula or a condition refers to: `self` is the unit or the side whose effect, ability or item
 * it is, `source` is the one that applied the effect, and `target` is the target of the action or the unit or the side
 * an event is about. A participant may be absent.
 */
export interface Subjects {
  /** The unit or the side whose effect, ability or item it is. */
  readonly self?: Target;
  /** The unit or the side that applied the effect. */
  readonly source?: Target;
  /** The target of the action: a unit, a side or a cell; or the unit or the side an event is about. */
  readonly target?: Target;
}

/**
 * A participant a formula or a condition refers to by its role.
 */
export type SubjectRole = keyof Subjects;

/**
 * The result of evaluating a formula or a condition: the value, a dice roll the evaluation needs first, or the
 * rejection of the command. An evaluation of the kernel rejects only with `kernel:out-of-range`, when a result is out
 * of the safe range, and with `kernel:not-on-field`, when `kernel:distance` measures to a unit that does not stand on
 * the field; a node of a package may also reject with a reason of its package. A step returns a result that is not a
 * value as its own result.
 */
export type Evaluation<Value> = EvaluatedValue<Value> | NeedsRoll | StepRejects;

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
 * The evaluation needs a dice roll first; the step runs again with the roll in its inputs.
 */
export interface NeedsRoll {
  /** The kind of result. */
  readonly kind: 'need';
  /** The roll. */
  readonly need: RollNeed;
}

/**
 * What formulas and conditions are evaluated for besides the participants given to each call.
 */
export interface ExpressionScope {
  /** The participants of a formula or a condition evaluated without its own participants. */
  readonly subjects?: Subjects;
  /** The applied effect the formulas and conditions belong to, if any. */
  readonly effect?: AppliedEffect;
  /** The event a reaction of an effect reacts to, if any. */
  readonly event?: BattleEvent;
  /** `false` forbids dice rolls: a roll becomes an error of content. */
  readonly rolls?: boolean;
}

/**
 * What both the evaluation of a step and a node can do: evaluate formulas and conditions, read attributes and tags,
 * and take dice rolls.
 *
 * Rolls are given out in order for the whole run of a step: every dice roll of every formula, and every call of
 * `roll`, takes the next roll the step has received, or makes the evaluation ask for one. So evaluating the same
 * formula twice takes two rolls. A roll that does not fit what is asked, by its name or its dice, is an error of the
 * step, and the evaluation throws a `TypeError`.
 *
 * A formula or a condition that content describes wrongly, for example a node that no package declares, a dice roll
 * with a wrong number of dice or sides, or a division by zero, is an error of content, and the evaluation throws a
 * `ContentError`.
 */
export interface ExpressionReader {
  /**
   * Evaluates a formula. Without participants it gets the current ones; given participants replace all of them, so
   * keep the others with `{ ...context.subjects, target }`.
   */
  value(formula: ValueExpr, subjects?: Subjects): Evaluation<number>;
  /**
   * Evaluates a condition. Without participants it gets the current ones; given participants replace all of them, so
   * keep the others with `{ ...context.subjects, target }`.
   */
  test(condition: Predicate, subjects?: Subjects): Evaluation<boolean>;
  /**
   * Returns the value of an attribute of a unit or a side by the full name of the attribute: the base value of the
   * creature of a unit, or 0 for a side, changed by the modifiers of the effects that act on it.
   *
   * @throws {ContentError} If the creature or the attribute does not exist, or the attribute depends on itself.
   * @throws {TypeError} If the unit or the side is not in the battle.
   */
  attribute(of: SideTarget | UnitTarget, attribute: ContentName): Evaluation<number>;
  /**
   * Returns the tags of a unit with the number of their sources: the tags in the state, the tags of its creature and
   * the tags that the effects acting on it give.
   *
   * @throws {ContentError} If its creature does not exist, or the tags depend on themselves.
   * @throws {TypeError} If the unit is not in the battle.
   */
  tags(unit: UnitId): Evaluation<Readonly<Record<Tag, number>>>;
  /**
   * Returns the tags of abilities that the effects acting on a unit or a side forbid while their condition of activity
   * holds, as `Effect.forbids` lists them; an ability with any of these tags or a tag below them cannot be used.
   *
   * @throws {ContentError} If a definition the unit or the side refers to does not exist, or a condition of activity
   * rolls dice.
   * @throws {TypeError} If the unit or the side is not in the battle.
   */
  forbiddenTags(of: SideTarget | UnitTarget): Evaluation<readonly Tag[]>;
  /**
   * Returns the sum of a dice roll: the next roll the step has received, or the need of the roll if there is none yet.
   * The roll belongs to the side and the unit of the current `self` unless the need names them, so an input request
   * goes to them.
   */
  roll(need: RollNeed): Evaluation<number>;
}

/**
 * Evaluates formulas and conditions of content for one run of a step; the current participants are those of its
 * scope.
 */
export interface Expressions extends ExpressionReader {
  /**
   * Returns the evaluation with other fields of the scope; it takes rolls from the same queue. The fields given replace
   * those of the current scope, and rolls once forbidden stay forbidden.
   */
  within(scope: ExpressionScope): Expressions;
}

/**
 * What a node of a formula or a condition sees when it is evaluated; the current participants are those of the node.
 */
export interface ExpressionContext extends ExpressionReader {
  /** The state with all events of the command so far. */
  readonly state: BattleState;
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** The field of the state with its units and obstacles, as `FieldGeometry` describes. */
  readonly field: FieldGeometry;
  /** The participants of the formula or the condition. */
  readonly subjects: Subjects;
  /** The applied effect the formula or the condition belongs to, if any. */
  readonly effect?: AppliedEffect;
  /** The event a reaction of an effect reacts to, if any. */
  readonly event?: BattleEvent;
}

/**
 * A node of conditions in content, such as "and", "has tag" or "adjacent cell".
 *
 * `Node` is the format of the node with its parameters.
 */
export interface ConditionExtension<Node extends ExpressionNode = ExpressionNode> extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'condition';
  /**
   * The JSON Schema of the node with its parameters; the content loader checks nodes by it. A nested formula,
   * condition or operation is described by `FORMULA_SCHEMA`, `CONDITION_SCHEMA` or `OPERATION_SCHEMA`, and a name of a
   * definition by `referenceSchema`.
   */
  readonly schema: JsonObject;
  /**
   * Evaluates the node to `true` or `false`. The function has no side effects; it takes dice rolls only through
   * `context.roll` and passes a result that is not a value on unchanged.
   */
  test(node: Node, context: ExpressionContext): Evaluation<boolean>;
}

/**
 * A node of formulas in content, such as a dice roll, a reference to an attribute or a sum.
 *
 * `Node` is the format of the node with its parameters.
 */
export interface FormulaExtension<Node extends ExpressionNode = ExpressionNode> extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'formula';
  /**
   * The JSON Schema of the node with its parameters; the content loader checks nodes by it. A nested formula,
   * condition or operation is described by `FORMULA_SCHEMA`, `CONDITION_SCHEMA` or `OPERATION_SCHEMA`, and a name of a
   * definition by `referenceSchema`.
   */
  readonly schema: JsonObject;
  /**
   * Evaluates the node to an integer; an integer out of the safe range rejects the command with
   * `kernel:out-of-range`. The function has no side effects, does not read `state.rng`, takes dice rolls only through
   * `context.roll` and passes a result that is not a value on unchanged.
   */
  evaluate(node: Node, context: ExpressionContext): Evaluation<number>;
}
