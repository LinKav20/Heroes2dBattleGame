import type { CommandRejected, StepRejects } from '../extensions/index.ts';
import type { JsonObject } from '../json/index.ts';
import {
  packageRejection,
  REJECTION_CODES,
  REJECTION_REASONS,
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
 * Returns the rejection of a command that the rules do not allow, with a reason of the kernel and its parameters.
 */
export function ruleViolation(reason: RejectionReason, params: JsonObject = {}): ExecuteRejected {
  return rejected({ code: REJECTION_CODES.ruleViolation, params, reason });
}

/**
 * Returns the rejection of a command that the rules do not allow, with the reason a step or a command of an
 * extension gave, as `packageRejection` allows it.
 *
 * @throws {TypeError} If the reason is not allowed.
 */
export function extensionViolation(
  source: string,
  rejection: CommandRejected | StepRejects,
  from: 'command' | 'step' = 'step',
): ExecuteRejected {
  return rejected(packageRejection(source, rejection, from));
}

/**
 * Returns the rejection of an answer to an input request that is not open.
 */
export function nothingToAnswer(request: number): ExecuteRejected {
  const reason = REJECTION_REASONS.noOpenRequest;

  return rejected({ code: REJECTION_CODES.nothingToAnswer, params: { request }, reason });
}

function rejected(rejection: Rejection): ExecuteRejected {
  return { ok: false, rejection };
}
