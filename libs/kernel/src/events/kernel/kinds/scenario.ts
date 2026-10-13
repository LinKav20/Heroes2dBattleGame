import type { EventKind } from '../../../kinds/index.ts';
import { KERNEL_EVENTS } from '../names.ts';
import { defineKernelEvent } from './define-kernel-event.ts';

/**
 * The kinds of events of the kernel about scenario variables and triggers.
 */
export const SCENARIO_EVENT_KINDS: readonly EventKind[] = [
  defineKernelEvent(KERNEL_EVENTS.variableSet, (state, { value, variable }) => ({
    ...state,
    variables: { ...state.variables, [variable]: value },
  })),
  defineKernelEvent(KERNEL_EVENTS.triggerFired, (state, { fired, trigger }) => ({
    ...state,
    triggers: { ...state.triggers, [trigger]: { fired } },
  })),
];
