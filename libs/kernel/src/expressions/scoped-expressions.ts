import type { ContentRegistry, Predicate, ValueExpr } from '../content/index.ts';
import type {
  Evaluation,
  ExpressionContext,
  Expressions,
  ExpressionScope,
  FieldGeometry,
  RollNeed,
  Subjects,
} from '../extensions/index.ts';
import type { ContentName, Tag, UnitId } from '../ids/index.ts';
import type { AppliedEffect, BattleEvent, BattleState, SideTarget, UnitTarget } from '../model/index.ts';
import type { ExpressionEngine } from './engine.ts';
import { rollOwner } from './subjects.ts';

/**
 * The evaluation of formulas and conditions within a scope: the current participants, the applied effect, the event
 * and whether rolls are allowed.
 */
export class ScopedExpressions implements Expressions {
  protected readonly engine: ExpressionEngine;

  protected readonly scope: ExpressionScope;

  constructor(engine: ExpressionEngine, scope: ExpressionScope) {
    this.engine = engine;
    this.scope = scope;
  }

  get field(): FieldGeometry {
    return this.engine.field;
  }

  value(formula: ValueExpr, subjects?: Subjects): Evaluation<number> {
    return this.engine.formula(formula, this.nodeContext(subjects));
  }

  test(condition: Predicate, subjects?: Subjects): Evaluation<boolean> {
    return this.engine.condition(condition, this.nodeContext(subjects));
  }

  attribute(of: SideTarget | UnitTarget, attribute: ContentName): Evaluation<number> {
    return this.engine.attribute(of, attribute);
  }

  tags(unit: UnitId): Evaluation<Readonly<Record<Tag, number>>> {
    return this.engine.tags(unit);
  }

  forbiddenTags(of: SideTarget | UnitTarget): Evaluation<readonly Tag[]> {
    return this.engine.forbiddenTags(of);
  }

  roll(need: RollNeed): Evaluation<number> {
    const owner = rollOwner(this.engine.state, this.scope.subjects ?? {});

    return this.engine.roll({ ...owner, ...need }, this.scope.rolls !== false);
  }

  within(scope: ExpressionScope): Expressions {
    const rolls = this.scope.rolls !== false && scope.rolls !== false;

    return new ScopedExpressions(this.engine, { ...this.scope, ...scope, rolls });
  }

  protected nodeContext(subjects: Subjects | undefined): NodeContext {
    return new NodeContext(this.engine, this.scope, subjects ?? this.scope.subjects ?? {});
  }
}

/**
 * What a node sees: the evaluation within the scope of the node with its participants as the current ones, the state,
 * the content and the effect and the event of the scope.
 */
export class NodeContext extends ScopedExpressions implements ExpressionContext {
  readonly state: BattleState;

  readonly content: ContentRegistry;

  readonly subjects: Subjects;

  readonly effect?: AppliedEffect;

  readonly event?: BattleEvent;

  constructor(engine: ExpressionEngine, scope: ExpressionScope, subjects: Subjects) {
    super(engine, { ...scope, subjects });
    this.state = engine.state;
    this.content = engine.content;
    this.subjects = subjects;

    if (scope.effect !== undefined) this.effect = scope.effect;

    if (scope.event !== undefined) this.event = scope.event;
  }

  protected override nodeContext(subjects: Subjects | undefined): NodeContext {
    return subjects === undefined ? this : super.nodeContext(subjects);
  }
}
