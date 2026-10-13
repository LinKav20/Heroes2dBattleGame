import type { RandomSource } from '../../content/index.ts';
import type { ContentName } from '../../ids/index.ts';
import type { InputRequest, Rejection, Step } from '../../model/index.ts';
import { withoutKey } from '../../shared/index.ts';
import type { KernelEventAppliers } from './appliers.ts';
import { KERNEL_EVENTS } from './names.ts';
import { takeRequestId } from './state-changes.ts';

/**
 * The payload of `kernel:input-requested`.
 */
export interface InputRequestedPayload {
  /** The request; its identifier is the next number of input requests in the state. */
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
  /** The steps that are not done yet; the last one runs next. */
  readonly steps: readonly Step[];
}

/**
 * The payload of `kernel:roll-made`.
 */
export interface RollMadePayload {
  /** The full name of the random value, for example `core:attack-roll`. */
  readonly name: ContentName;
  /** Where the value came from. */
  readonly source: RandomSource;
  /** The rolled number. */
  readonly result: number;
  /** The value of every die, if the value is a dice roll. */
  readonly dice?: readonly number[];
  /** The counter of the generator after the roll; only a roll of the generator has it. */
  readonly counter?: number;
}

/**
 * The payload of `kernel:command-aborted`.
 */
export interface CommandAbortedPayload {
  /** Why the rules forbid the rest of the command. */
  readonly rejection: Rejection;
}

/**
 * The payloads of the events of the kernel about running commands.
 */
export interface ExecutionEventPayloads {
  /** The kernel needs data from outside and waits. */
  readonly [KERNEL_EVENTS.inputRequested]: InputRequestedPayload;
  /** The open input request was answered, and the kernel took back the saved steps to go on with them. */
  readonly [KERNEL_EVENTS.inputClosed]: InputClosedPayload;
  /** The steps of the current command that are not done yet were saved while the kernel waits for an answer. */
  readonly [KERNEL_EVENTS.stepsSaved]: StepsSavedPayload;
  /** A random value was rolled by the generator or entered from outside. */
  readonly [KERNEL_EVENTS.rollMade]: RollMadePayload;
  /** The rules forbade the rest of a command that went on after an answer; the answer stays accepted. */
  readonly [KERNEL_EVENTS.commandAborted]: CommandAbortedPayload;
}

/**
 * How the events of the kernel about running commands change the state.
 */
export const EXECUTION_EVENTS: KernelEventAppliers<ExecutionEventPayloads> = {
  [KERNEL_EVENTS.inputRequested]: (state, { request }) => {
    if (state.inputRequest !== undefined) {
      throw new RangeError(`The input request ${String(state.inputRequest.id)} is still open.`);
    }

    return { ...state, inputRequest: request, nextRequestId: takeRequestId(state, request.id) };
  },
  [KERNEL_EVENTS.inputClosed]: (state, { request }) => {
    if (state.inputRequest?.id !== request) throw new RangeError(`The input request ${String(request)} is not open.`);

    return { ...withoutKey(state, 'inputRequest'), steps: [] };
  },
  [KERNEL_EVENTS.stepsSaved]: (state, { steps }) => ({ ...state, steps }),
  [KERNEL_EVENTS.rollMade]: (state, { counter }) => {
    if (counter === undefined) return state;

    if (state.rng === undefined) throw new RangeError('The battle has no random number generator.');

    if (counter <= state.rng.counter) {
      throw new RangeError(`The counter of the generator cannot go back from ${String(state.rng.counter)}.`);
    }

    return { ...state, rng: { ...state.rng, counter } };
  },
  [KERNEL_EVENTS.commandAborted]: (state) => state,
};
