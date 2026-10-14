import type { JsonObject } from '../json/index.ts';
import { kernelName } from '../names/index.ts';

/**
 * Why the kernel rejected a command: the code tells the kind of reason, the reason names it exactly, and the
 * parameters give the details. The user interface picks the text in the right language by the reason.
 */
export interface Rejection {
  /** The code of the reason. */
  readonly code: RejectionCode;
  /**
   * The full name of the reason: one of {@link REJECTION_REASONS} or a reason of a package with extensions, for
   * example `acme-duel:no-target`.
   */
  readonly reason: string;
  /** The details of the reason. */
  readonly params: JsonObject;
}

/**
 * The code of a reason why the kernel rejects a command.
 */
export type RejectionCode = (typeof REJECTION_CODES)[keyof typeof REJECTION_CODES];

/**
 * A reason the kernel itself gives. Packages with extensions give reasons of their own.
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
 * The reasons the kernel itself gives, with their parameters:
 * - `battleOver`: a game command after the end of the battle; no parameters;
 * - `inputPending`: a game command while an input request is open; no parameters;
 * - `invalidAnswer`: an answer that does not fit the open request; `request` is its identifier;
 * - `noOpenRequest`: with the code `nothing-to-answer`, an answer to a request that is not open; `request` is the
 *   identifier the answer names;
 * - `notAvailable`: a command the kernel cannot run yet; no parameters;
 * - `outOfRange`: a formula or an attribute gets a value out of the safe range; `formula` is the full name of the
 *   node, or `unit` and `attribute` name the attribute;
 * - `rngExhausted`: the generator has run out of values; `name` is the random value a step needed;
 * - `stepLimit`: the command ran too many steps or built too deep a stack of steps; no parameters;
 * - `unknownCommand`: a game command of an extension that no package declares; `name` is its full name.
 */
export const REJECTION_REASONS = Object.freeze({
  battleOver: kernelName('battle-over'),
  inputPending: kernelName('input-pending'),
  invalidAnswer: kernelName('invalid-answer'),
  noOpenRequest: kernelName('no-open-request'),
  notAvailable: kernelName('not-available'),
  outOfRange: kernelName('out-of-range'),
  rngExhausted: kernelName('rng-exhausted'),
  stepLimit: kernelName('step-limit'),
  unknownCommand: kernelName('unknown-command'),
} as const);
