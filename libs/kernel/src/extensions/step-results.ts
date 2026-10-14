import type { VisibleTo } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { StepNeed } from './step-needs.ts';

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
   * The full name of the reason: a reason of the package, for example `acme-duel:no-target`, or `kernel:out-of-range`
   * that an evaluation of a formula gave. Any other reason is an error of the extension.
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
