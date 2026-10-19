import type { ContentRegistry } from '../content/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { BattleState } from '../model/index.ts';
import type { Extension } from '../names/index.ts';
import type { Expressions } from './expressions.ts';
import type { StepDraft } from './step-results.ts';
import type { FieldGeometry } from './topology.ts';

/**
 * A kind of game command that a package with extensions declares: the schema of its payload and the steps it starts.
 */
export interface CommandKind<Payload = unknown> extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'command';
  /** The JSON Schema of the payload. */
  readonly schema: JsonObject;
  /**
   * Turns the command into steps, or tells that the rules forbid it. The function has no side effects. In a turn the
   * kernel ends the command with `kernel:action-end` after the steps, which brings auras and zones up to date, checks
   * scenario triggers and outcomes and ends the turn if it is over or the plan says so, so the plan may hold one step
   * less than the depth of the stack. The steps may not be steps that only the kernel adds. To check whether a unit
   * or a side may act now, the plan calls `turnRejection` and returns its reason.
   */
  plan(context: CommandContext<Payload>): CommandPlan;
}

/**
 * What a kind of command sees when it plans a command.
 */
export interface CommandContext<Payload = unknown> {
  /** The state before the command. */
  readonly state: BattleState;
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** The payload of the command. */
  readonly payload: Payload;
  /** The field of the state with its units and obstacles. */
  readonly field: FieldGeometry;
  /** Evaluates formulas and conditions of content; dice cannot be rolled, and a formula with dice is an error. */
  readonly expressions: Expressions;
}

/**
 * The steps of a command in the order they run, or the reason the rules forbid it.
 */
export type CommandPlan = CommandRejected | CommandSteps;

/**
 * The steps of the command.
 */
export interface CommandSteps {
  /** The kind of plan. */
  readonly kind: 'steps';
  /** The steps in the order they run. */
  readonly steps: readonly StepDraft[];
  /**
   * Whether the command ends the turn of the holder after its steps, even if the holder could still act. Without it,
   * the kernel ends the turn only if it is over.
   */
  readonly endsTurn?: true;
}

/**
 * The rules forbid the command.
 */
export interface CommandRejected {
  /** The kind of plan. */
  readonly kind: 'reject';
  /**
   * The full name of the reason with the prefix of a package with extensions, for example `acme-duel:no-target`, or
   * one of the reasons of the turn of the kernel: `kernel:unit-dead`, `kernel:wrong-phase`, `kernel:not-your-turn` or
   * `kernel:not-enough-actions`. Another reason is an error of the extension.
   */
  readonly reason: string;
  /** The details of the reason, as JSON. */
  readonly params?: JsonObject;
}
