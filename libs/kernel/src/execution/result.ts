import type { JsonObject } from '../json/index.ts';
import {
  REJECTION_CODES,
  type BattleState,
  type EventBatch,
  type Rejection,
  type RejectionReason,
} from '../model/index.ts';

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
 * Returns the rejection of a command that the rules do not allow, with a reason of the kernel and its details.
 */
export function ruleViolation(reason: RejectionReason, details: JsonObject = {}): ExecuteRejected {
  return rejected({ code: REJECTION_CODES.ruleViolation, params: { ...details, reason } });
}

/**
 * Returns the rejection of a command that the rules do not allow, with the parameters an extension gave.
 */
export function extensionViolation(params: JsonObject): ExecuteRejected {
  return rejected({ code: REJECTION_CODES.ruleViolation, params });
}

/**
 * Returns the rejection of an answer to an input request that is not open.
 */
export function nothingToAnswer(request: number): ExecuteRejected {
  return rejected({ code: REJECTION_CODES.nothingToAnswer, params: { request } });
}

function rejected(rejection: Rejection): ExecuteRejected {
  return { ok: false, rejection };
}
