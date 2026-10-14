import type { ContentName } from '../../ids/index.ts';
import type { AppliedEffect, EffectHolder } from '../../model/index.ts';
import type { KernelEventAppliers } from './appliers.ts';
import { KERNEL_EVENTS } from './names.ts';
import { changeEffects, removeById, replaceById, takeId } from './state-changes.ts';

/**
 * The payload of `kernel:effect-applied`.
 */
export interface EffectAppliedPayload {
  /** What the effect is applied to. */
  readonly holder: EffectHolder;
  /** The applied effect; its identifier is the next number of the state. */
  readonly effect: AppliedEffect;
}

/**
 * The payload of `kernel:effect-changed`.
 */
export interface EffectChangedPayload {
  /** What the effect is applied to. */
  readonly holder: EffectHolder;
  /** The applied effect after the change, with the same identifier. */
  readonly effect: AppliedEffect;
}

/**
 * The payload of `kernel:effect-removed`.
 */
export interface EffectRemovedPayload {
  /** What the effect was applied to. */
  readonly holder: EffectHolder;
  /** The identifier of the applied effect. */
  readonly effect: number;
}

/**
 * Why an effect was not applied.
 */
export type EffectNotAppliedReason = (typeof EFFECT_NOT_APPLIED_REASONS)[keyof typeof EFFECT_NOT_APPLIED_REASONS];

/**
 * The payload of `kernel:effect-not-applied`.
 */
export interface EffectNotAppliedPayload {
  /** What the effect was to be applied to. */
  readonly holder: EffectHolder;
  /** The full name of the effect. */
  readonly effect: ContentName;
  /** Why the effect was not applied. */
  readonly reason: EffectNotAppliedReason;
}

/**
 * The payloads of the events of the kernel about applied effects.
 */
export interface EffectEventPayloads {
  /** An effect was applied to a unit, a side, the field or a hazard zone. */
  readonly [KERNEL_EVENTS.effectApplied]: EffectAppliedPayload;
  /** An applied effect changed: its counter, stacks, activity or parameters. */
  readonly [KERNEL_EVENTS.effectChanged]: EffectChangedPayload;
  /** An applied effect was removed. */
  readonly [KERNEL_EVENTS.effectRemoved]: EffectRemovedPayload;
  /** An effect was not applied; the state does not change. */
  readonly [KERNEL_EVENTS.effectNotApplied]: EffectNotAppliedPayload;
}

/**
 * Why an effect was not applied: `immune` — the holder is immune to it; `condition` — its condition of application does
 * not hold; `stacking` — the holder already has the effect, and applying it again changes nothing.
 */
export const EFFECT_NOT_APPLIED_REASONS = Object.freeze({
  condition: 'condition',
  immune: 'immune',
  stacking: 'stacking',
} as const);

/**
 * How the events of the kernel about applied effects change the state.
 */
export const EFFECT_EVENTS: KernelEventAppliers<EffectEventPayloads> = {
  [KERNEL_EVENTS.effectApplied]: (state, { effect, holder }) => {
    const nextId = takeId(state, effect.id);

    return { ...changeEffects(state, holder, (effects) => [...effects, effect]), nextId };
  },
  [KERNEL_EVENTS.effectChanged]: (state, { effect, holder }) =>
    changeEffects(state, holder, (effects) => replaceById(effects, effect, 'applied effect')),
  [KERNEL_EVENTS.effectRemoved]: (state, { effect, holder }) =>
    changeEffects(state, holder, (effects) => removeById(effects, effect, 'applied effect')),
  [KERNEL_EVENTS.effectNotApplied]: (state) => state,
};
