import type { RandomSource } from '../../../content/index.ts';
import type { ContentName } from '../../../ids/index.ts';
import type { BattlePhase, InputRequest, Outcome, Step } from '../../../model/index.ts';

/**
 * The payload of `kernel:phase-changed`.
 */
export interface PhaseChangedPayload {
  /** The current round after the change. */
  readonly round: number;
  /** The phase after the change. */
  readonly phase: BattlePhase;
}

/**
 * The payload of `kernel:battle-ended`.
 */
export interface BattleEndedPayload {
  /** How the battle ended. */
  readonly outcome: Outcome;
}

/**
 * The payload of `kernel:input-requested`.
 */
export interface InputRequestedPayload {
  /** The request; its identifier is the next number of the state. */
  readonly request: InputRequest;
}

/**
 * The payload of `kernel:input-closed`.
 */
export interface InputClosedPayload {
  /** The identifier of the request. */
  readonly request: number;
}

/**
 * The payload of `kernel:steps-saved`.
 */
export interface StepsSavedPayload {
  /** The steps that are not done yet; the last one runs next. Empty when the command is done. */
  readonly steps: readonly Step[];
}

/**
 * The payload of `kernel:roll-made`.
 */
export interface RollMadePayload {
  /** The full name of the random value, for example `core:attack-roll`. */
  readonly value: ContentName;
  /** Where the value came from. */
  readonly source: RandomSource;
  /** The rolled number. */
  readonly result: number;
  /** The value of every die, if the value is a dice roll. */
  readonly dice?: readonly number[];
  /** The counter of the generator after the roll; only a roll of the generator has it. */
  readonly counter?: number;
}
