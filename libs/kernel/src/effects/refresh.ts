import { effectDefinition } from '../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { EventDraft, StepContext, StepKind, StepResult } from '../extensions/index.ts';
import type { EffectHolder } from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { activity } from './activity.ts';

/**
 * Brings the marks of activity of the effects of units up to date: an effect is marked active while its condition of
 * activity holds, or always if it has none. The effects of sides, the field and hazard zones keep their marks, because
 * their conditions are checked for every unit separately.
 *
 * @throws {ContentError} If a condition of activity rolls dice or is described wrongly.
 */
export const REFRESH_STEP: StepKind = Object.freeze({
  kind: 'step',
  migrations: [],
  name: KERNEL_STEPS.effectRefresh,
  run: refresh,
  version: 1,
});

function refresh({ content, expressions, state }: StepContext): StepResult {
  const events: EventDraft[] = [];

  for (const unit of state.units) {
    const holder: EffectHolder = { kind: 'unit', unit: unit.id };

    for (const applied of unit.effects) {
      const active = activity(expressions, effectDefinition(content, applied.effect), holder, applied);

      if (active.kind !== 'value') return active;

      if (active.value !== applied.active) {
        const effect = { ...applied, active: active.value };

        events.push(kernelEventDraft(KERNEL_EVENTS.effectChanged, { effect, holder }, applied.visibleTo));
      }
    }
  }

  return { events, kind: 'done' };
}
