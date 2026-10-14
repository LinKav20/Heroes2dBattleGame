import type { ContentRegistry, Op } from '../content/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { BattleState, StepInput } from '../model/index.ts';
import type { Extension } from '../names/index.ts';
import type { Expressions, Subjects } from './expressions.ts';
import type { StepResult } from './step-results.ts';

/**
 * What an operation sees when it runs. An operation runs as a step of the command, so it may give events, add steps
 * and ask for values like any step.
 */
export interface OperationContext {
  /** The state with all events of the command so far. */
  readonly state: BattleState;
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** The values the operation has received so far, in the order it asked for them. */
  readonly inputs: readonly StepInput[];
  /** Evaluates formulas and conditions; rolls in formulas take the values in `inputs`. */
  readonly expressions: Expressions;
  /** The participants of the operation: the holder of the effect or the user of the ability, its target and source. */
  readonly subjects: Subjects;
}

/**
 * A node of operations in content, such as damage, healing, applying an effect or summoning.
 */
export interface OperationExtension extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'operation';
  /** The JSON Schema of the node with its parameters; the content loader checks nodes by it. */
  readonly schema: JsonObject;
  /**
   * Runs the operation. The function has no side effects and gives the same result for the same context, because the
   * kernel runs it again after it receives a value the operation asked for.
   */
  run(node: Op, context: OperationContext): StepResult;
}
