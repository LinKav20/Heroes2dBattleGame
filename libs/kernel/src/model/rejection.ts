import type { JsonObject } from '../json/index.ts';

/**
 * Why the kernel rejected a command. The code tells the kind of reason, and the parameters give the details, such as
 * `reason` from {@link REJECTION_REASONS}; the user interface picks the text in the right language.
 */
export interface Rejection {
  /** The code of the reason. */
  readonly code: RejectionCode;
  /** The details of the reason. */
  readonly params: JsonObject;
}

/**
 * The code of a reason why the kernel rejects a command.
 */
export type RejectionCode = (typeof REJECTION_CODES)[keyof typeof REJECTION_CODES];

/**
 * A reason the kernel itself gives in `Rejection.params.reason`. Extensions may give reasons of their own.
 */
export type RejectionReason = (typeof REJECTION_REASONS)[keyof typeof REJECTION_REASONS];

/**
 * The codes of the reasons why the kernel rejects a command: the command answers an input request that is not open,
 * or the rules do not allow it.
 */
export const REJECTION_CODES = Object.freeze({
  nothingToAnswer: 'nothing-to-answer',
  ruleViolation: 'rule-violation',
} as const);

/**
 * The reasons the kernel itself gives for `rule-violation`.
 */
export const REJECTION_REASONS = Object.freeze({
  inputPending: 'input-pending',
  invalidAnswer: 'invalid-answer',
  invalidRoll: 'invalid-roll',
  noGenerator: 'no-generator',
  notAvailable: 'not-available',
  rngExhausted: 'rng-exhausted',
  stepLimit: 'step-limit',
  unknownCommand: 'unknown-command',
} as const);
