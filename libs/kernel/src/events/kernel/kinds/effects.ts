import type { EventKind } from '../../../kinds/index.ts';
import { changeEffects, removeById, replaceById, takeId } from '../state-changes.ts';
import { KERNEL_EVENTS } from '../names.ts';
import { defineKernelEvent } from './define-kernel-event.ts';

/**
 * The kinds of events of the kernel about applied effects.
 */
export const EFFECT_EVENT_KINDS: readonly EventKind[] = [
  defineKernelEvent(KERNEL_EVENTS.effectApplied, (state, { effect, holder }) => {
    const nextId = takeId(state, effect.id);

    return { ...changeEffects(state, holder, (effects) => [...effects, effect]), nextId };
  }),
  defineKernelEvent(KERNEL_EVENTS.effectChanged, (state, { effect, holder }) =>
    changeEffects(state, holder, (effects) => replaceById(effects, effect, 'applied effect'))),
  defineKernelEvent(KERNEL_EVENTS.effectRemoved, (state, { effect, holder }) =>
    changeEffects(state, holder, (effects) => removeById(effects, effect, 'applied effect'))),
];
