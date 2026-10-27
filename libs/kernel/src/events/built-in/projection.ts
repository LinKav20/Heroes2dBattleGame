import type { JsonValue } from '../../json/index.ts';
import type { BattleState } from '../../model/index.ts';
import type { KernelEventAppliers } from './appliers.ts';
import { KERNEL_EVENTS } from './names.ts';

/**
 * The payload of `kernel:hidden`: the counters of identifiers after the event the actor does not see, if that event
 * moved them.
 */
export interface HiddenPayload {
  /** The number the kernel gives to the next applied effect, item or summoned unit. */
  readonly nextId?: number;
  /** The number the kernel gives to the next input request. */
  readonly nextRequestId?: number;
}

/**
 * The payload of `kernel:data-changed`: the data of extensions as the projection shows it after an event of a package.
 */
export interface DataChangedPayload {
  /** The new data, by the full name of the extension. */
  readonly changed: Readonly<Record<string, JsonValue>>;
  /** The full names of the extensions whose data the projection no longer shows. */
  readonly removed: readonly string[];
}

/**
 * The payloads of the events that only a projection has.
 */
export interface ProjectionEventPayloads {
  /** An event happened that the actor does not see. */
  readonly [KERNEL_EVENTS.hidden]: HiddenPayload;
  /** An event of a package changed the data of extensions that the projection shows. */
  readonly [KERNEL_EVENTS.dataChanged]: DataChangedPayload;
}

/**
 * How the events that only a projection has change it. A full state does not take them.
 */
export const PROJECTION_EVENTS: KernelEventAppliers<ProjectionEventPayloads> = {
  [KERNEL_EVENTS.hidden]: (state, { nextId, nextRequestId }) => ({
    ...projection(state, KERNEL_EVENTS.hidden),
    nextId: forward(state.nextId, nextId, 'identifiers'),
    nextRequestId: forward(state.nextRequestId, nextRequestId, 'input requests'),
  }),
  [KERNEL_EVENTS.dataChanged]: (state, { changed, removed }) => ({
    ...projection(state, KERNEL_EVENTS.dataChanged),
    extensions: withData(state, changed, removed),
  }),
};

function projection(state: BattleState, type: string): BattleState {
  if (state.visibility === undefined) throw new RangeError(`Only a projection takes ${type}.`);

  return state;
}

function forward(current: number, next: number | undefined, what: string): number {
  if (next === undefined) return current;

  if (!Number.isSafeInteger(next) || next < current) {
    throw new RangeError(`The counter of ${what} cannot go from ${String(current)} to ${String(next)}.`);
  }

  return next;
}

function withData(
  state: BattleState,
  changed: Readonly<Record<string, JsonValue>>,
  removed: readonly string[],
): Readonly<Record<string, JsonValue>> {
  const kept = Object.entries(state.extensions)
    .filter(([name]) => !removed.includes(name) && !Object.hasOwn(changed, name));

  return Object.fromEntries([...kept, ...Object.entries(changed)]);
}
