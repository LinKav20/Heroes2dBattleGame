import type { ContentRegistry } from '../content/index.ts';
import type { VisibleTo } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { BattleState, StepInput } from '../model/index.ts';
import type { Extension } from '../names/index.ts';
import type { Migration } from './migration.ts';
import type { StepNeed } from './step-needs.ts';

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
   * `TypeError` for it; see {@link StepDone}, {@link StepRejects} and `StepNeed`. A rejection means only that the rules
   * forbid the command.
   */
  run(context: StepContext<Params>): StepResult;
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
  /**
   * The events of the step in order. The kernel gives them numbers and the cause of the step. A step cannot give the
   * events the kernel gives itself while it runs a command: `kernel:input-requested`, `kernel:input-closed`,
   * `kernel:steps-saved`, `kernel:roll-made` and `kernel:command-aborted`. Numbers in the payloads are safe integers;
   * the kernel does not check them, and a state with other numbers has no hash.
   */
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
 * The rules forbid the command. If the command has not stopped on an input request yet, the kernel rejects it as a
 * whole. If it goes on after an answer, the kernel accepts the answer and aborts the rest of the command with the
 * event `kernel:command-aborted`.
 */
export interface StepRejects {
  /** The kind of result. */
  readonly kind: 'reject';
  /**
   * The full name of the reason with the prefix of a package with extensions, for example `acme-duel:no-target`. A
   * reason without such a name is an error of the extension.
   */
  readonly reason: string;
  /** The details of the reason, as JSON. */
  readonly params?: JsonObject;
}

/**
 * An event a step gives, before the kernel numbers it.
 */
export interface EventDraft<Payload = unknown> {
  /** The full name of the kind of event. */
  readonly type: string;
  /** What happened, in the current version of the format. */
  readonly payload: Payload;
  /** Which sides see the event. */
  readonly visibleTo: VisibleTo;
}

/**
 * A new step a step puts on the stack. Its cause is the first event of the step that adds it, if there is one.
 */
export interface StepDraft<Params extends object = object> {
  /** The full name of the kind of step. */
  readonly type: string;
  /** The parameters of the step, as JSON. */
  readonly params: Params;
}
