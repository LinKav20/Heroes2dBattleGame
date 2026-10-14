import type { CommandRejected, StepRejects } from '../extensions/index.ts';
import type { JsonObject } from '../json/index.ts';
import {
  REJECTION_CODES,
  REJECTION_REASONS,
  type BattleState,
  type EventBatch,
  type Rejection,
  type RejectionReason,
} from '../model/index.ts';
import { isExtensionName, isKernelName } from '../names/index.ts';

/**
 * The result of a command: its events and the state after them, or the reason the kernel rejected it.
 */
export type ExecuteResult = ExecuteAccepted | ExecuteRejected;

/**
 * The kernel accepted the command.
 */
export interface ExecuteAccepted {
  /** Marks an accepted command. */
  readonly ok: true;
  /** The events of the command in order; applying them to the state before the command gives `state`. */
  readonly events: EventBatch;
  /** The state after the events. */
  readonly state: BattleState;
}

/**
 * The kernel rejected the command; the state does not change.
 */
export interface ExecuteRejected {
  /** Marks a rejected command. */
  readonly ok: false;
  /** Why the kernel rejected the command. */
  readonly rejection: Rejection;
}

/**
 * Returns an accepted result with the events and the state they lead to.
 */
export function accepted(events: EventBatch, state: BattleState): ExecuteAccepted {
  return { events, ok: true, state };
}

/**
 * Returns the rejection of a command that the rules do not allow, with a reason of the kernel and its parameters.
 */
export function ruleViolation(reason: RejectionReason, params: JsonObject = {}): ExecuteRejected {
  return rejected({ code: REJECTION_CODES.ruleViolation, params, reason });
}

/**
 * Returns the rejection of a command that the rules do not allow, with the reason a step or a command of an
 * extension gave: a reason of a package with extensions, or `kernel:out-of-range`, which only a step may give when an
 * evaluation gives it.
 *
 * @throws {TypeError} If the reason is neither.
 */
export function extensionViolation(
  source: string,
  rejection: CommandRejected | StepRejects,
  fromStep = true,
): ExecuteRejected {
  const { params = {}, reason } = rejection;
  const value: unknown = reason;
  const allowed = typeof value === 'string'
    && (isOwnReason(value) || (fromStep && value === REJECTION_REASONS.outOfRange));

  if (!allowed) {
    throw new TypeError(
      `${JSON.stringify(source)} rejects the command with the reason ${JSON.stringify(value)}, but a reason needs `
      + 'a full name with the prefix of a package with extensions.',
    );
  }

  return rejected({ code: REJECTION_CODES.ruleViolation, params, reason });
}

/**
 * Returns the rejection of an answer to an input request that is not open.
 */
export function nothingToAnswer(request: number): ExecuteRejected {
  const reason = REJECTION_REASONS.noOpenRequest;

  return rejected({ code: REJECTION_CODES.nothingToAnswer, params: { request }, reason });
}

function isOwnReason(reason: string): boolean {
  return isExtensionName(reason) && !isKernelName(reason);
}

function rejected(rejection: Rejection): ExecuteRejected {
  return { ok: false, rejection };
}
