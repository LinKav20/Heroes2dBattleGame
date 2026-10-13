import type { AppliedEffect, EffectHolder } from '../../../model/index.ts';

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
