import { type ContentRegistry, effectDefinition } from '../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { EventDraft, StepContext, StepDraft, StepKind, StepResult } from '../extensions/index.ts';
import type { AppliedEffect, EffectHolder } from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { DONE, operationDrafts } from '../operations/index.ts';
import { appliedSubjects } from './applied.ts';
import { effectsOf } from './holders.ts';
import type { RemovalParams } from './params.ts';

/**
 * What removing an applied effect gives: its event and the steps of its operations on removal.
 */
export interface RemovalResult {
  /** The event: the effect is removed. */
  readonly events: readonly EventDraft[];
  /** The operations of the effect on removal; they see the effect as it was. */
  readonly steps: readonly StepDraft[];
}

/**
 * Removes an applied effect from its holder; an effect that is already gone is left alone.
 */
export const REMOVAL_STEP: StepKind<RemovalParams> = Object.freeze({
  kind: 'step',
  migrations: [],
  name: KERNEL_STEPS.effectRemoval,
  run: removeEffect,
  version: 1,
});

/**
 * Returns the events and the steps of removing an applied effect.
 */
export function removal(content: ContentRegistry, holder: EffectHolder, applied: AppliedEffect): RemovalResult {
  const { onRemove } = effectDefinition(content, applied.effect);
  const removed = kernelEventDraft(KERNEL_EVENTS.effectRemoved, { effect: applied.id, holder }, applied.visibleTo);

  return {
    events: [removed],
    steps: operationDrafts(onRemove, { effect: applied, subjects: appliedSubjects(holder, applied) }),
  };
}

function removeEffect({ content, params, state }: StepContext<RemovalParams>): StepResult {
  const applied = effectsOf(state, params.holder).find(({ id }) => id === params.effect);

  return applied === undefined ? DONE : { kind: 'done', ...removal(content, params.holder, applied) };
}
