import type { EventKind } from '../../../kinds/index.ts';
import type { BattleState } from '../../../model/index.ts';
import { takeId } from '../state-changes.ts';
import { KERNEL_EVENTS } from '../names.ts';
import { defineKernelEvent } from './define-kernel-event.ts';

/**
 * The kinds of events of the kernel about the course of the battle: phases, input requests, saved steps, rolls and
 * the end.
 */
export const BATTLE_EVENT_KINDS: readonly EventKind[] = [
  defineKernelEvent(KERNEL_EVENTS.phaseChanged, (state, { phase, round }) => ({ ...state, phase, round })),
  defineKernelEvent(KERNEL_EVENTS.battleEnded, (state, { outcome }) => ({
    ...withoutInputRequest(state),
    phase: { kind: 'ended', outcome },
    steps: [],
  })),
  defineKernelEvent(KERNEL_EVENTS.inputRequested, (state, { request }) => {
    if (state.inputRequest !== undefined) {
      throw new RangeError(`The input request ${String(state.inputRequest.id)} is still open.`);
    }

    return { ...state, inputRequest: request, nextId: takeId(state, request.id) };
  }),
  defineKernelEvent(KERNEL_EVENTS.inputClosed, (state, { request }) => {
    if (state.inputRequest?.id !== request) throw new RangeError(`The input request ${String(request)} is not open.`);

    return withoutInputRequest(state);
  }),
  defineKernelEvent(KERNEL_EVENTS.stepsSaved, (state, { steps }) => ({ ...state, steps })),
  defineKernelEvent(KERNEL_EVENTS.rollMade, (state, { counter }) => {
    if (counter === undefined) return state;

    if (state.rng === undefined) throw new RangeError('The battle has no random number generator.');

    if (counter <= state.rng.counter) {
      throw new RangeError(`The counter of the generator cannot go back from ${String(state.rng.counter)}.`);
    }

    return { ...state, rng: { ...state.rng, counter } };
  }),
];

function withoutInputRequest(state: BattleState): BattleState {
  const { inputRequest: closed, ...rest } = state;

  return closed === undefined ? state : rest;
}
