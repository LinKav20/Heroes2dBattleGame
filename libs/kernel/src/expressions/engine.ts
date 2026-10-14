import type { ContentRegistry, Predicate, ValueExpr } from '../content/index.ts';
import type { Evaluation, ExpressionContext, RollNeed } from '../extensions/index.ts';
import type { ContentName, Tag, UnitId } from '../ids/index.ts';
import type { BattleState, SideTarget, UnitTarget } from '../model/index.ts';

/**
 * What every scope and every node of one run of a step share: the state, the content, the registries of nodes, the
 * queue of rolls and the values of attributes and tags.
 */
export interface ExpressionEngine {
  /** The state the step sees. */
  readonly state: BattleState;
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** Evaluates a formula in the context of a node. */
  formula(formula: ValueExpr, context: ExpressionContext): Evaluation<number>;
  /** Evaluates a condition in the context of a node. */
  condition(condition: Predicate, context: ExpressionContext): Evaluation<boolean>;
  /** Returns the value of an attribute of a unit or a side. */
  attribute(of: SideTarget | UnitTarget, attribute: ContentName): Evaluation<number>;
  /** Returns the tags of a unit with the number of their sources. */
  tags(unit: UnitId): Evaluation<Readonly<Record<Tag, number>>>;
  /** Takes the next roll, or returns the need of the roll; `allowed` is `false` where rolls are forbidden. */
  roll(need: RollNeed, allowed: boolean): Evaluation<number>;
}
