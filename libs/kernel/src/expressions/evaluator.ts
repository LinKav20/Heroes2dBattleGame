import { ContentError, type ContentRegistry, type ExpressionNode, type Predicate, type ValueExpr }
  from '../content/index.ts';
import type {
  ConditionExtension,
  Evaluation,
  ExpressionContext,
  Expressions,
  FieldGeometry,
  FormulaExtension,
  RollNeed,
  TopologyExtension,
} from '../extensions/index.ts';
import { createFieldGeometry, type FieldCache } from '../geometry/index.ts';
import type { ContentName, Tag, UnitId } from '../ids/index.ts';
import type { BattleState, RollInput, SideTarget, StepInput, UnitTarget } from '../model/index.ts';
import type { Registry } from '../names/index.ts';
import type { AttributeCache } from './attributes/attribute-cache.ts';
import { attributeValue, sourceActivity, type AttributeInput } from './attributes/attribute-value.ts';
import { modifierSources, type ModifierSource } from './attributes/sources.ts';
import { unitTags } from './attributes/unit-tags.ts';
import type { ExpressionEngine } from './engine.ts';
import { isNode } from './params.ts';
import { evaluated, outOfRange } from './results.ts';
import { ScopedExpressions } from './scoped-expressions.ts';

/**
 * The registries of nodes that evaluation needs.
 */
export interface ExpressionRegistries {
  /** Nodes of conditions. */
  readonly conditions: Registry<ConditionExtension>;
  /** Nodes of formulas. */
  readonly formulas: Registry<FormulaExtension>;
  /** Field topologies. */
  readonly topologies: Registry<TopologyExtension>;
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
  /** The values the step has received; rolls among them go to dice rolls in order. */
  readonly inputs: readonly StepInput[];
  /** The values of attributes and tags calculated before, if the kernel keeps them. */
  readonly cache?: AttributeCache;
  /** The cells of fields the kernel has asked topologies for, if the kernel keeps them. */
  readonly fields?: FieldCache;
  /** The field of the state, if the caller has built it; otherwise the evaluation builds it when a node needs it. */
  readonly field?: FieldGeometry;
}

/**
 * Creates the evaluation of formulas and conditions for one run of a step. Rolls the step has received go to the dice
 * rolls in the order they are asked for.
 */
export function createExpressions(setup: ExpressionSetup): Expressions {
  return new ScopedExpressions(new Evaluator(setup), {});
}

class Evaluator implements ExpressionEngine, AttributeInput {
  readonly state: BattleState;

  readonly content: ContentRegistry;

  private readonly setup: ExpressionSetup;

  private readonly rolls: readonly RollInput[];

  private readonly computing = new Set<string>();

  private readonly asked = new WeakSet<RollNeed>();

  private readonly found = new Map<string, readonly ModifierSource[]>();

  private readonly activity = new WeakMap<ModifierSource, Evaluation<boolean>>();

  private readonly scopes = new WeakMap<ModifierSource, Expressions>();

  private readonly settled: Expressions;

  private used = 0;

  private geometry?: FieldGeometry;

  constructor(setup: ExpressionSetup) {
    this.setup = setup;
    this.state = setup.state;
    this.content = setup.content;
    this.rolls = setup.inputs.filter((input): input is RollInput => input.kind === 'roll');
    this.settled = new ScopedExpressions(this, { rolls: false });
  }

  get field(): FieldGeometry {
    const { content, fields, registries, state } = this.setup;

    this.geometry ??= this.setup.field ?? createFieldGeometry(state, content, registries.topologies, fields);

    return this.geometry;
  }

  formula(formula: ValueExpr, context: ExpressionContext): Evaluation<number> {
    const value: unknown = formula;

    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) throw new ContentError(`The formula ${String(value)} is not a safe integer.`);

      return evaluated(value);
    }

    if (!isNode(value)) throw new ContentError(`${JSON.stringify(value)} is not a formula.`);

    const kind = this.setup.registries.formulas.get(value.type);

    if (kind === undefined) {
      throw new ContentError(`The kernel has no node of formulas ${JSON.stringify(value.type)}.`, { node: value.type });
    }

    const result = this.own(value, kind.evaluate(value, context));

    if (result.kind !== 'value') return result;

    if (!Number.isInteger(result.value)) {
      throw new TypeError(`The node ${JSON.stringify(value.type)} gave ${String(result.value)}, not an integer.`);
    }

    return Number.isSafeInteger(result.value) ? result : outOfRange(value);
  }

  condition(condition: Predicate, context: ExpressionContext): Evaluation<boolean> {
    const value: unknown = condition;

    if (typeof value === 'boolean') return evaluated(value);

    if (!isNode(value)) throw new ContentError(`${JSON.stringify(value)} is not a condition.`);

    const kind = this.setup.registries.conditions.get(value.type);

    if (kind === undefined) {
      const problem = `The kernel has no node of conditions ${JSON.stringify(value.type)}.`;

      throw new ContentError(problem, { node: value.type });
    }

    const result = this.own(value, kind.test(value, context));
    const found: unknown = result.kind === 'value' ? result.value : false;

    if (typeof found !== 'boolean') {
      throw new TypeError(`The node ${JSON.stringify(value.type)} gave ${JSON.stringify(found)}, not true or false.`);
    }

    return result;
  }

  attribute(of: SideTarget | UnitTarget, attribute: ContentName): Evaluation<number> {
    const { cache, content, state } = this.setup;
    const cached = cache?.attribute(content, state, of, attribute);

    if (cached !== undefined) return evaluated(cached);

    return this.guarded(`${holderKey(of)} ${attribute}`, () => {
      const result = attributeValue(this, of, attribute);

      if (result.kind === 'value') cache?.setAttribute(content, state, of, attribute, result.value);

      return result;
    }, () => `The attribute ${JSON.stringify(attribute)} of ${describe(of)} depends on itself.`);
  }

  tags(unit: UnitId): Evaluation<Readonly<Record<Tag, number>>> {
    const { cache, content, state } = this.setup;
    const cached = cache?.tags(content, state, unit);

    if (cached !== undefined) return evaluated(cached);

    return this.guarded(`tags ${unit}`, () => {
      const result = unitTags(this, unit);

      if (result.kind === 'value') cache?.setTags(content, state, unit, result.value);

      return result;
    }, () => `The tags of the unit ${JSON.stringify(unit)} depend on themselves.`);
  }

  roll(need: RollNeed, allowed: boolean): Evaluation<number> {
    if (!allowed) {
      throw new ContentError(
        `A formula rolls ${JSON.stringify(need.name)} where the kernel only checks or reads values, so dice cannot `
        + 'be rolled there: for example in a modifier, a condition of activity or a requirement of an ability.',
      );
    }

    const roll = this.rolls[this.used];

    if (roll === undefined) {
      this.asked.add(need);

      return { kind: 'need', need };
    }

    if (roll.name !== need.name || roll.dice.length !== need.count || roll.dice.some((die) => die > need.sides)) {
      throw new TypeError(
        `A roll of ${String(roll.dice.length)} dice for ${JSON.stringify(roll.name)} came where `
        + `${String(need.count)} dice with ${String(need.sides)} sides for ${JSON.stringify(need.name)} are asked.`,
      );
    }

    this.used += 1;

    return evaluated(roll.result);
  }

  sources(of: SideTarget | UnitTarget): readonly ModifierSource[] {
    const key = holderKey(of);
    const known = this.found.get(key);

    if (known !== undefined) return known;

    const sources = modifierSources(this.state, this.content, of);

    this.found.set(key, sources);

    return sources;
  }

  active(source: ModifierSource): Evaluation<boolean> {
    const known = this.activity.get(source);

    if (known !== undefined) return known;

    const active = sourceActivity(this.scope(source), source);

    this.activity.set(source, active);

    return active;
  }

  scope(source: ModifierSource): Expressions {
    const known = this.scopes.get(source);

    if (known !== undefined) return known;

    const scope = this.settled.within({
      subjects: source.subjects,
      ...(source.applied === undefined ? {} : { effect: source.applied }),
    });

    this.scopes.set(source, scope);

    return scope;
  }

  private own<Value>(node: ExpressionNode, result: Evaluation<Value>): Evaluation<Value> {
    if (result.kind === 'need' && !this.asked.has(result.need)) {
      throw new TypeError(`The node ${JSON.stringify(node.type)} needs a value it did not ask for through roll.`);
    }

    return result;
  }

  private guarded<Value>(key: string, compute: () => Evaluation<Value>, problem: () => string): Evaluation<Value> {
    if (this.computing.has(key)) throw new ContentError(problem());

    this.computing.add(key);

    try {
      return compute();
    } finally {
      this.computing.delete(key);
    }
  }
}

function holderKey(of: SideTarget | UnitTarget): string {
  return of.kind === 'unit' ? `unit ${of.unit}` : `side ${of.side}`;
}

function describe(of: SideTarget | UnitTarget): string {
  return of.kind === 'unit' ? `the unit ${JSON.stringify(of.unit)}` : `the side ${JSON.stringify(of.side)}`;
}
