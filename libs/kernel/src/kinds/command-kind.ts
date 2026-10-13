import type { ContentRegistry } from '../content/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { BattleState } from '../model/index.ts';
import type { Extension } from '../names/index.ts';
import type { StepDraft } from './step-kind.ts';

/**
 * A kind of game command that a package with extensions declares: the schema of its payload and the steps it starts.
 */
export interface CommandKind<Payload = unknown> extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'command';
  /** The JSON Schema of the payload. */
  readonly schema: JsonObject;
  /** Turns the command into steps, or tells that the rules forbid it. The function has no side effects. */
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
}

/**
 * The rules forbid the command.
 */
export interface CommandRejected {
  /** The kind of plan. */
  readonly kind: 'reject';
  /** The details of the reason. */
  readonly params: JsonObject;
}
