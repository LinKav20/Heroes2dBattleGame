import type { ContentRegistry } from '../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import { withTagSources } from '../expressions/index.ts';
import type { EventDraft, StepContext, StepDraft, StepKind, StepResult } from '../extensions/index.ts';
import type { AppliedEffect, BattleState, EffectHolder } from '../model/index.ts';
import { operationDrafts } from './drafts.ts';
import { appliedSubjects, effectDefinition, effectsOf } from './holders.ts';
import { KERNEL_STEPS } from './names.ts';
import type { RemovalParams } from './params.ts';

/**
 * What removing an applied effect gives: its events and the steps of its operations on removal.
 */
export interface RemovalResult {
  /** The events: the effect is removed and the tags it gave are taken back. */
  readonly events: readonly EventDraft[];
  /** The operations of the effect on removal. */
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
export function removal(
  state: BattleState,
  content: ContentRegistry,
  holder: EffectHolder,
  applied: AppliedEffect,
): RemovalResult {
  const definition = effectDefinition(content, applied.effect);
  const removed = kernelEventDraft(KERNEL_EVENTS.effectRemoved, { effect: applied.id, holder }, applied.visibleTo);
  const unit = holder.kind === 'unit' ? state.units.find(({ id }) => id === holder.unit) : undefined;
  const tags = unit === undefined || definition.grantsTags.length === 0
    ? []
    : [kernelEventDraft(KERNEL_EVENTS.tagsChanged, {
        tags: withTagSources(unit.tags, definition.grantsTags, 'remove'),
        unit: unit.id,
      }, applied.visibleTo)];

  return {
    events: [removed, ...tags],
    steps: operationDrafts(definition.onRemove, appliedSubjects(holder, applied)),
  };
}

function removeEffect({ content, params, state }: StepContext<RemovalParams>): StepResult {
  const applied = effectsOf(state, params.holder).find(({ id }) => id === params.effect);

  return applied === undefined
    ? { events: [], kind: 'done' }
    : { kind: 'done', ...removal(state, content, params.holder, applied) };
}
