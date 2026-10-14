import type { ContentRegistry, Predicate, ValueExpr } from '../content/index.ts';
import type {
  ConditionExtension,
  Evaluation,
  ExpressionContext,
  Expressions,
  FormulaExtension,
  RollNeed,
  Subjects,
} from '../extensions/index.ts';
import type { ContentName, UnitId } from '../ids/index.ts';
import type { BattleState, RollInput, StepInput } from '../model/index.ts';
import type { Registry } from '../names/index.ts';
import type { AttributeCache } from './attributes/attribute-cache.ts';
import { cacheKey } from './attributes/attribute-cache.ts';
import { attributeValue } from './attributes/attribute-value.ts';
import { isNode } from './params.ts';
import { evaluated } from './results.ts';

/**
 * The registries of nodes that evaluation needs.
 */
export interface ExpressionRegistries {
  /** Nodes of conditions. */
  readonly conditions: Registry<ConditionExtension>;
  /** Nodes of formulas. */
  readonly formulas: Registry<FormulaExtension>;
}

/**
 * What evaluation of formulas and conditions for one run of a step needs.
 */
export interface ExpressionSetup {
  /** The registries of nodes. */
  readonly registries: ExpressionRegistries;
  /** The state the step sees. */
  readonly state: BattleState;
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** The values the step has received; rolls among them go to dice rolls of formulas in order. */
  readonly inputs: readonly StepInput[];
  /** The values of attributes calculated before, if the kernel keeps them. */
  readonly cache?: AttributeCache;
}

interface EvaluatorOptions {
  readonly rolls: boolean;
  readonly computing: Set<string>;
}

/**
 * Creates the evaluation of formulas and conditions for one run of a step. Rolls the step has received go to the dice
 * rolls of formulas in the order the formulas ask for them.
 */
export function createExpressions(setup: ExpressionSetup): Expressions {
  return new Evaluator(setup, { computing: new Set(), rolls: true });
}

class Evaluator implements Expressions {
  private readonly setup: ExpressionSetup;

  private readonly options: EvaluatorOptions;

  private readonly rolls: readonly RollInput[];

  private used = 0;

  constructor(setup: ExpressionSetup, options: EvaluatorOptions) {
    this.setup = setup;
    this.options = options;
    this.rolls = setup.inputs.filter((input): input is RollInput => input.kind === 'roll');
  }

  value(formula: ValueExpr, subjects: Subjects = {}): Evaluation<number> {
    return this.formula(formula, new NodeContext(this, this.setup, subjects));
  }

  test(condition: Predicate, subjects: Subjects = {}): Evaluation<boolean> {
    return this.condition(condition, new NodeContext(this, this.setup, subjects));
  }

  formula(formula: ValueExpr, context: ExpressionContext): Evaluation<number> {
    const value: unknown = formula;

    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) throw new TypeError(`The formula ${String(value)} is not a safe integer.`);

      return evaluated(value);
    }

    if (!isNode(value)) throw new TypeError(`${JSON.stringify(value)} is not a formula.`);

    const kind = this.setup.registries.formulas.get(value.type);

    if (kind === undefined) throw new TypeError(`The kernel has no node of formulas ${JSON.stringify(value.type)}.`);

    const result = kind.evaluate(value, context);

    if (result.kind === 'value' && !Number.isSafeInteger(result.value)) {
      throw new TypeError(`The node ${JSON.stringify(value.type)} gave ${String(result.value)}, not a safe integer.`);
    }

    return result;
  }

  condition(condition: Predicate, context: ExpressionContext): Evaluation<boolean> {
    const value: unknown = condition;

    if (typeof value === 'boolean') return evaluated(value);

    if (!isNode(value)) throw new TypeError(`${JSON.stringify(value)} is not a condition.`);

    const kind = this.setup.registries.conditions.get(value.type);

    if (kind === undefined) throw new TypeError(`The kernel has no node of conditions ${JSON.stringify(value.type)}.`);

    return kind.test(value, context);
  }

  attribute(unit: UnitId, attribute: ContentName): Evaluation<number> {
    const { cache, content, state } = this.setup;
    const cached = cache?.get(content, state, unit, attribute);

    if (cached !== undefined) return evaluated(cached);

    const key = cacheKey(unit, attribute);

    if (this.options.computing.has(key)) {
      throw new TypeError(
        `The attribute ${JSON.stringify(attribute)} of the unit ${JSON.stringify(unit)} depends on itself.`,
      );
    }

    this.options.computing.add(key);

    try {
      const effects = new Evaluator({ ...this.setup, inputs: [] }, { computing: this.options.computing, rolls: false });
      const result = attributeValue({
        content,
        state,
        test: (condition, subjects) => effects.test(condition, subjects),
        value: (formula, subjects) => effects.value(formula, subjects),
      }, unit, attribute);

      if (result.kind === 'value') cache?.set(content, state, unit, attribute, result.value);

      return result;
    } finally {
      this.options.computing.delete(key);
    }
  }

  roll(need: RollNeed): Evaluation<number> {
    if (!this.options.rolls) {
      throw new TypeError(
        `A modifier or a condition of an effect rolls ${JSON.stringify(need.name)}, but it cannot roll dice.`,
      );
    }

    const roll = this.rolls[this.used];

    if (roll === undefined) return { kind: 'need', need };

    if (roll.dice.length !== need.count) {
      throw new TypeError(`A roll of ${String(roll.dice.length)} dice came for ${JSON.stringify(need.name)}.`);
    }

    this.used += 1;

    return evaluated(roll.result);
  }
}

class NodeContext implements ExpressionContext {
  readonly state: BattleState;

  readonly content: ContentRegistry;

  readonly subjects: Subjects;

  private readonly evaluator: Evaluator;

  constructor(evaluator: Evaluator, setup: ExpressionSetup, subjects: Subjects) {
    this.evaluator = evaluator;
    this.state = setup.state;
    this.content = setup.content;
    this.subjects = subjects;
  }

  value(formula: ValueExpr): Evaluation<number> {
    return this.evaluator.formula(formula, this);
  }

  test(condition: Predicate): Evaluation<boolean> {
    return this.evaluator.condition(condition, this);
  }

  attribute(unit: UnitId, attribute: ContentName): Evaluation<number> {
    return this.evaluator.attribute(unit, attribute);
  }

  roll(need: RollNeed): Evaluation<number> {
    return this.evaluator.roll(need);
  }
}
