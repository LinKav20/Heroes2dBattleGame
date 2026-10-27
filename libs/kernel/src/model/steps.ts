import type { ContentName } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { ChoiceValue, TargetValue } from './commands.ts';

/**
 * A part of a command that the kernel has not done yet: pay the cost, walk the path, strike, end the turn. A step
 * holds only data, so the stack of steps is saved with the state.
 */
export interface Step {
  /** The full name of the kind of step in a kernel registry. */
  readonly type: string;
  /**
   * The version of the format of this kind of step. The package that declares the step migrates old versions, and
   * the versions of all kinds of steps are part of the version of the state format.
   */
  readonly version: number;
  /** The parameters of the step. */
  readonly params: JsonObject;
  /** The values the step has received so far: rolls, chosen options and chosen targets, in the order it asked. */
  readonly inputs?: readonly StepInput[];
  /**
   * The number of the event in the current batch that caused the step, if any. A step that waits for an answer to an
   * input request is saved without it, because the answer starts a new batch.
   */
  readonly cause?: number;
  /**
   * Marks a step of the course of the battle that the kernel runs on its own after the action of the command, such as
   * the end of the action, the start of the next turn and everything they add. Such a step cannot reject the command.
   */
  readonly flow?: true;
  /**
   * Marks a step of a state edit and every step it adds: effects do not react to their events, and scenario triggers
   * do not wait for them.
   */
  readonly quiet?: true;
}

/**
 * A value a step has received: a roll, a chosen option or chosen targets.
 */
export type StepInput = ChoiceValue | RollInput | TargetValue;

/**
 * A roll a step has received, from the generator or from outside.
 */
export interface RollInput {
  /** The kind of value. */
  readonly kind: 'roll';
  /** The full name of the random value the roll is for. */
  readonly name: ContentName;
  /** The value of every die. */
  readonly dice: readonly number[];
  /** The sum of the dice. */
  readonly result: number;
}
