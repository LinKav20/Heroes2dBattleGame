import type { ActivePhase, BattleState, Outcome } from '../../model/index.ts';
import { withoutKey } from '../../shared/index.ts';
import type { KernelEventAppliers } from './appliers.ts';
import { KERNEL_EVENTS } from './names.ts';

/**
 * The payload of `kernel:phase-changed`.
 */
export interface PhaseChangedPayload {
  /** The current round after the change. */
  readonly round: number;
  /** The phase after the change; the battle ends only with `kernel:battle-ended`. */
  readonly phase: ActivePhase;
}

/**
 * The payload of `kernel:battle-ended`.
 */
export interface BattleEndedPayload {
  /** How the battle ended. */
  readonly outcome: Outcome;
}

/**
 * The payloads of the events of the kernel about the course of the battle.
 */
export interface BattleEventPayloads {
  /** The round or the phase of a battle that goes on changed. */
  readonly [KERNEL_EVENTS.phaseChanged]: PhaseChangedPayload;
  /** The battle is over; the stack of steps is empty, no input request is open, and the remaining steps do not run. */
  readonly [KERNEL_EVENTS.battleEnded]: BattleEndedPayload;
}

/**
 * How the events of the kernel about the course of the battle change the state.
 */
export const BATTLE_EVENTS: KernelEventAppliers<BattleEventPayloads> = {
  [KERNEL_EVENTS.phaseChanged]: (state, { phase, round }) => ({ ...goingOn(state), phase, round }),
  [KERNEL_EVENTS.battleEnded]: (state, { outcome }) => ({
    ...withoutKey(goingOn(state), 'inputRequest'),
    phase: { kind: 'ended', outcome },
    steps: [],
  }),
};

function goingOn(state: BattleState): BattleState {
  if (state.phase.kind === 'ended') throw new RangeError('The battle is over.');

  return state;
}
