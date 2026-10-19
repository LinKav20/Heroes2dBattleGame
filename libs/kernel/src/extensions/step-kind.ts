import type { ContentRegistry } from '../content/index.ts';
import type { BattleEvent, BattleState, StepInput } from '../model/index.ts';
import type { Extension } from '../names/index.ts';
import type { Expressions } from './expressions.ts';
import type { Migration } from './migration.ts';
import type { StepResult } from './step-results.ts';
import type { FieldGeometry } from './topology.ts';

/**
 * A kind of step of a command: how the step runs, its format version and the migrations of its older versions.
 *
 * `Params` is the format of the parameters of the step. They are JSON with safe integers; the kernel saves them in
 * the state as they are.
 */
export interface StepKind<Params extends object = object> extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'step';
  /** The current version of the format of the step parameters; it starts at 1. */
  readonly version: number;
  /** One migration for every older version, from version 1 to the version before the current one. */
  readonly migrations: readonly Migration[];
  /**
   * Runs the step. The function has no side effects, never changes its context and gives the same result for the
   * same context: the kernel runs a step again after it receives a value the step asked for.
   *
   * A step that breaks the contract of the kernel is an error of the point of assembly, and the kernel throws a
   * `TypeError` for it; see `StepDone`, `StepRejects` and `StepNeed`. A rejection means only that the rules
   * forbid the command.
   */
  run(context: StepContext<Params>): StepResult;
  /**
   * Returns the parameters with every event of the battle they hold moved to the current version of its format, for a
   * step that keeps events in its parameters, such as a reaction to an event. The kernel calls it when it migrates
   * saved steps, after the migrations of the step; `migrate` moves one event.
   */
  migrateEvents?(params: Params, migrate: (event: BattleEvent) => BattleEvent): Params;
}

/**
 * What a step sees when it runs.
 */
export interface StepContext<Params extends object = object> {
  /**
   * The state with all events of the command so far. The step does not read `steps` and `inputRequest`: they belong
   * to the kernel.
   */
  readonly state: BattleState;
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** The parameters of the step. */
  readonly params: Params;
  /** The values the step has received so far, in the order it asked for them. */
  readonly inputs: readonly StepInput[];
  /**
   * Evaluates formulas and conditions of content. A dice roll in a formula takes the next roll from `inputs`, or makes
   * the evaluation ask for one, so a step that evaluates formulas takes its own rolls through `expressions.roll` too.
   */
  readonly expressions: Expressions;
  /** The field of the state with its units and obstacles, as `FieldGeometry` describes. */
  readonly field: FieldGeometry;
}
