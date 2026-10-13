import type { GameCommand } from './game-commands.ts';
import type { Target } from './input-requests.ts';
import type { StateEditCommand } from './state-edits.ts';

/**
 * What to do with a battle. The kernel does not know who sent the command. There are three kinds: game commands, which
 * the kernel checks against the rules of the game; answers to input requests, which it checks against the request;
 * and state edits, which change the battle bypassing the rules.
 */
export type Command = GameCommand | InputAnswer | StateEditCommand;

/**
 * An answer to the open input request.
 */
export interface InputAnswer {
  /** The kind of command. */
  readonly kind: 'answer';
  /** The identifier of the request. */
  readonly request: number;
  /** The answer. */
  readonly value: InputValue;
}

/**
 * The value of an answer, of the same kind as the request.
 */
export type InputValue = ChoiceValue | RollValue | TargetValue;

/**
 * The result of a dice roll: the value of every die.
 */
export interface RollValue {
  /** The kind of answer. */
  readonly kind: 'roll';
  /** The value of every die, in any order. */
  readonly dice: readonly number[];
}

/**
 * The chosen option.
 */
export interface ChoiceValue {
  /** The kind of answer. */
  readonly kind: 'choice';
  /** The option. */
  readonly option: string;
}

/**
 * The chosen targets.
 */
export interface TargetValue {
  /** The kind of answer. */
  readonly kind: 'target';
  /** The targets. */
  readonly targets: readonly Target[];
}
