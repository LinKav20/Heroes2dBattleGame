import type { EventKind } from '../../../kinds/index.ts';
import { KERNEL_EVENTS } from '../names.ts';
import { defineKernelEvent } from './define-kernel-event.ts';

/**
 * The kinds of events of the kernel about hazard zones of the field.
 */
export const FIELD_EVENT_KINDS: readonly EventKind[] = [
  defineKernelEvent(KERNEL_EVENTS.hazardAdded, (state, { cells, hazard, visibleTo }) => {
    if (state.field.hazards.some(({ id }) => id === hazard)) {
      throw new RangeError(`The field already has a hazard zone "${hazard}".`);
    }

    const hazards = [...state.field.hazards, { cells, effects: [], id: hazard, visibleTo }];

    return { ...state, field: { ...state.field, hazards } };
  }),
  defineKernelEvent(KERNEL_EVENTS.hazardRemoved, (state, { hazard }) => {
    if (!state.field.hazards.some(({ id }) => id === hazard)) {
      throw new RangeError(`The field has no hazard zone "${hazard}".`);
    }

    return { ...state, field: { ...state.field, hazards: state.field.hazards.filter(({ id }) => id !== hazard) } };
  }),
];
