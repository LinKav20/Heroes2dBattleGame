import type { BattleState } from '../../model/index.ts';

/**
 * How every kind of event from a table of payloads changes the state, by the full name of the kind.
 */
export type KernelEventAppliers<Payloads> = {
  readonly [Type in keyof Payloads]: (state: BattleState, payload: Payloads[Type]) => BattleState;
};
