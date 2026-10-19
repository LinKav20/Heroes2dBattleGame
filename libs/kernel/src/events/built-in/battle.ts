import type { ActivePhase, BattleState, Outcome, TurnRecord } from '../../model/index.ts';
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
 * The payload of `kernel:turn-ended`: the turn that ended, as the turns of the round record it.
 */
export type TurnEndedPayload = TurnRecord;

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
  /**
   * The round or the phase of a battle that goes on changed; a new round starts with no ended turns. After a turn the
   * battle goes between turns by `kernel:turn-ended`, not by this event.
   */
  readonly [KERNEL_EVENTS.phaseChanged]: PhaseChangedPayload;
  /**
   * The turn of a side or a unit ended: the kernel records it among the turns of the round, and nobody has the turn
   * until the next one starts.
   */
  readonly [KERNEL_EVENTS.turnEnded]: TurnEndedPayload;
  /** The battle is over; the stack of steps is empty, no input request is open, and the remaining steps do not run. */
  readonly [KERNEL_EVENTS.battleEnded]: BattleEndedPayload;
}

/**
 * How the events of the kernel about the course of the battle change the state.
 */
export const BATTLE_EVENTS: KernelEventAppliers<BattleEventPayloads> = {
  [KERNEL_EVENTS.phaseChanged]: (state, { phase, round }) => {
    const turns = round === state.round ? state.turns : [];

    return { ...goingOn(state), phase, round, turns };
  },
  [KERNEL_EVENTS.turnEnded]: (state, { holder, skipped, waited }) => ({
    ...goingOn(state),
    phase: { kind: 'between-turns' },
    turns: [...state.turns, { holder, skipped, waited }],
  }),
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
