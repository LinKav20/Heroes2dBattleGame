import type { CellId, VisibleTo } from '../../ids/index.ts';
import type { KernelEventAppliers } from './appliers.ts';
import { KERNEL_EVENTS } from './names.ts';
import { hasId, removeById } from './state-changes.ts';

/**
 * The payload of `kernel:hazard-added`.
 */
export interface HazardAddedPayload {
  /** The identifier of the zone. */
  readonly hazard: string;
  /** The cells of the zone. */
  readonly cells: readonly CellId[];
  /** Which sides see the zone. */
  readonly visibleTo: VisibleTo;
}

/**
 * The payload of `kernel:hazard-removed`.
 */
export interface HazardRemovedPayload {
  /** The identifier of the zone. */
  readonly hazard: string;
}

/**
 * The payloads of the events of the kernel about hazard zones of the field.
 */
export interface FieldEventPayloads {
  /** A hazard zone appeared on the field; its effects come with separate events. */
  readonly [KERNEL_EVENTS.hazardAdded]: HazardAddedPayload;
  /** A hazard zone disappeared from the field together with its effects. */
  readonly [KERNEL_EVENTS.hazardRemoved]: HazardRemovedPayload;
}

/**
 * How the events of the kernel about hazard zones change the state.
 */
export const FIELD_EVENTS: KernelEventAppliers<FieldEventPayloads> = {
  [KERNEL_EVENTS.hazardAdded]: (state, { cells, hazard, visibleTo }) => {
    if (hasId(state.field.hazards, hazard)) throw new RangeError(`The field already has a hazard zone "${hazard}".`);

    const hazards = [...state.field.hazards, { cells, effects: [], id: hazard, visibleTo }];

    return { ...state, field: { ...state.field, hazards } };
  },
  [KERNEL_EVENTS.hazardRemoved]: (state, { hazard }) => ({
    ...state,
    field: { ...state.field, hazards: removeById(state.field.hazards, hazard, 'hazard zone') },
  }),
};
