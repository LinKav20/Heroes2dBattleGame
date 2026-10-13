import type { ContentRegistry } from '../content/index.ts';
import type { ContentName, SideId, UnitId, VisibleTo } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { BattleState, StepInput, Target } from '../model/index.ts';
import type { Extension } from '../names/index.ts';
import type { Migration } from './event-kind.ts';

/**
 * A kind of step of a command: how the step runs, its format version and the migrations of its older versions.
 */
export interface StepKind extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'step';
  /** The current version of the format of the step parameters; it starts at 1. */
  readonly version: number;
  /** One migration for every older version, from version 1 to the version before the current one. */
  readonly migrations: readonly Migration[];
  /**
   * Runs the step. The function has no side effects and gives the same result for the same context: the kernel may
   * run a step again after it receives a value the step asked for.
   */
  run(context: StepContext): StepResult;
}

/**
 * What a step sees when it runs.
 */
export interface StepContext {
  /** The state with all events of the command so far. */
  readonly state: BattleState;
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** The parameters of the step. */
  readonly params: JsonObject;
  /** The values the step has received so far, in the order it asked for them. */
  readonly inputs: readonly StepInput[];
}

/**
 * What a step does: it is done and gives events and new steps, it needs a value first, or the rules forbid the
 * command.
 */
export type StepResult = StepDone | StepNeedsValue | StepRejects;

/**
 * The step is done.
 */
export interface StepDone {
  /** The kind of result. */
  readonly kind: 'done';
  /** The events of the step in order. The kernel gives them numbers and the cause of the step. */
  readonly events: readonly EventDraft[];
  /** New steps in the order they run; the kernel puts them on top of the stack. */
  readonly steps?: readonly StepDraft[];
}

/**
 * The step needs a value before it can go on. The kernel runs the step again with the value in `inputs`.
 */
export interface StepNeedsValue {
  /** The kind of result. */
  readonly kind: 'need';
  /** The value the step needs. */
  readonly need: StepNeed;
}

/**
 * The rules forbid the command; the kernel rejects it as a whole.
 */
export interface StepRejects {
  /** The kind of result. */
  readonly kind: 'reject';
  /** The details of the reason. */
  readonly params: JsonObject;
}

/**
 * A value a step needs: a roll, a choice of an option or a choice of targets.
 */
export type StepNeed = ChoiceNeed | RollNeed | TargetNeed;

/**
 * A roll of dice. The ruleset tells whether the generator rolls it or it comes from outside.
 */
export interface RollNeed {
  /** The kind of value. */
  readonly kind: 'roll';
  /** The full name of the random value, for example `core:attack-roll`. */
  readonly value: ContentName;
  /** How many dice to roll. */
  readonly dice: number;
  /** How many sides every die has. */
  readonly sides: number;
  /** Which sides see the roll; all sides if not given. */
  readonly visibleTo?: VisibleTo;
  /** The side the roll belongs to; an input request goes to it. */
  readonly side?: SideId;
  /** The unit the roll belongs to. */
  readonly unit?: UnitId;
}

/**
 * A choice of one option, which always comes from outside.
 */
export interface ChoiceNeed {
  /** The kind of value. */
  readonly kind: 'choice';
  /** The options to choose from. */
  readonly options: readonly string[];
  /** The side that chooses. */
  readonly side?: SideId;
  /** The unit the choice belongs to. */
  readonly unit?: UnitId;
}

/**
 * A choice of targets, which always comes from outside.
 */
export interface TargetNeed {
  /** The kind of value. */
  readonly kind: 'target';
  /** The targets to choose from. */
  readonly targets: readonly Target[];
  /** How many targets to choose. */
  readonly count: number;
  /** The side that chooses. */
  readonly side?: SideId;
  /** The unit the choice belongs to. */
  readonly unit?: UnitId;
}

/**
 * An event a step gives, before the kernel numbers it.
 */
export interface EventDraft {
  /** The full name of the kind of event. */
  readonly type: string;
  /** What happened, in the current version of the format. */
  readonly payload: unknown;
  /** Which sides see the event. */
  readonly visibleTo: VisibleTo;
}

/**
 * A new step a step puts on the stack. Its cause is the first event of the step that adds it, if there is one.
 */
export interface StepDraft {
  /** The full name of the kind of step. */
  readonly type: string;
  /** The parameters of the step. */
  readonly params: JsonObject;
}
