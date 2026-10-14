import type { Effect } from '../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import { isBlocked, matchesAny, withTagSources } from '../expressions/index.ts';
import type { EventDraft, StepContext, StepKind, StepResult, Subjects } from '../extensions/index.ts';
import type { AppliedEffect, BattleState, EffectHolder } from '../model/index.ts';
import { operationDrafts, removalDraft } from './drafts.ts';
import { appliedSubjects, asTarget, effectDefinition, effectsOf, visibilityOf } from './holders.ts';
import { KERNEL_STEPS } from './names.ts';
import type { ApplicationParams } from './params.ts';
import { removal } from './removal.ts';

/**
 * Applies an effect to a holder. The effect is not applied if the holder is immune to it or its condition does not
 * hold. An instant effect only runs its operations on application. If the holder already has the effect, its mode of
 * stacking decides: the new one is ignored, refreshes the duration, adds a stack, replaces the old one, or replaces it
 * only if it is stronger. A new effect removes the effects of the holder that it removes by tags and runs its
 * operations on application.
 */
export const APPLICATION_STEP: StepKind<ApplicationParams> = Object.freeze({
  kind: 'step',
  migrations: [],
  name: KERNEL_STEPS.effectApplication,
  run: applyEffect,
  version: 1,
});

const DONE: StepResult = Object.freeze({ events: [], kind: 'done' });

function applyEffect(context: StepContext<ApplicationParams>): StepResult {
  const { content, expressions, params, state } = context;
  const { holder } = params;
  const definition = effectDefinition(content, params.effect);
  const source = params.source === undefined ? undefined : asTarget(params.source);
  const subjects: Subjects = { ...appliedSubjects(holder), ...(source === undefined ? {} : { source }) };
  const unit = holder.kind === 'unit' ? state.units.find(({ id }) => id === holder.unit) : undefined;

  if (holder.kind === 'unit' && unit === undefined) throw new TypeError(`The battle has no unit "${holder.unit}".`);

  if (unit !== undefined && isBlocked(unit.tags, definition.blockedBy)) return DONE;

  if (definition.condition !== undefined) {
    const holds = expressions.test(definition.condition, subjects);

    if (holds.kind !== 'value') return holds;

    if (!holds.value) return DONE;
  }

  if (definition.duration.kind === 'instant') {
    return { events: [], kind: 'done', steps: operationDrafts(definition.onApply, subjects) };
  }

  const strength = definition.strength === undefined
    ? evaluatedZero()
    : expressions.value(definition.strength, subjects);

  if (strength.kind !== 'value') return strength;

  const existing = effectsOf(state, holder).find(({ effect }) => effect === params.effect);

  if (existing !== undefined) {
    switch (definition.stacking) {
      case 'ignore': {
        return DONE;
      }

      case 'refresh': {
        return changed(holder, existing, refreshed(definition, existing));
      }

      case 'stack': {
        return changed(holder, existing, { ...refreshed(definition, existing), stacks: existing.stacks + 1 });
      }

      case 'strongest': {
        return strength.value > strengthOf(existing) ? applyNew(context, definition, strength.value, existing) : DONE;
      }

      case 'replace': {
        return applyNew(context, definition, strength.value, existing);
      }

      default: {
        throw new TypeError(`Unknown stacking of the effect ${JSON.stringify(definition.name)}.`);
      }
    }
  }

  return applyNew(context, definition, strength.value, undefined);
}

function applyNew(
  context: StepContext<ApplicationParams>,
  definition: Effect,
  strength: number,
  replaced: AppliedEffect | undefined,
): StepResult {
  const { content, expressions, params, state } = context;
  const { holder } = params;
  const subjects = appliedSubjects(holder);
  const active = definition.activeWhile === undefined
    ? evaluatedTrue()
    : expressions.test(definition.activeWhile, subjects);

  if (active.kind !== 'value') return active;

  const effect: AppliedEffect = {
    active: active.value,
    effect: definition.name,
    id: state.nextId,
    params: { ...params.params, ...(definition.strength === undefined ? {} : { strength }) },
    stacks: 1,
    visibleTo: visibilityOf(definition, state, holder),
    ...remainingOf(definition),
    ...(params.source?.kind === 'unit' ? { sourceUnit: params.source.unit } : {}),
    ...(params.source?.kind === 'side' ? { sourceSide: params.source.side } : {}),
  };
  const old = replaced === undefined ? { events: [], steps: [] } : removal(state, content, holder, replaced);
  const removedByTags = effectsOf(state, holder)
    .filter((other) => other !== replaced)
    .filter((other) => matchesAny(effectDefinition(content, other.effect).tags, definition.removes))
    .map((other) => removalDraft(holder, other.id));

  return {
    events: [
      ...old.events,
      kernelEventDraft(KERNEL_EVENTS.effectApplied, { effect, holder }, effect.visibleTo),
      ...grantedTags(state, holder, definition, replaced, effect),
    ],
    kind: 'done',
    steps: [...old.steps, ...removedByTags, ...operationDrafts(definition.onApply, appliedSubjects(holder, effect))],
  };
}

function grantedTags(
  state: BattleState,
  holder: EffectHolder,
  definition: Effect,
  replaced: AppliedEffect | undefined,
  effect: AppliedEffect,
): readonly EventDraft[] {
  const unit = holder.kind === 'unit' ? state.units.find(({ id }) => id === holder.unit) : undefined;

  if (unit === undefined || definition.grantsTags.length === 0 || replaced !== undefined) return [];

  const tags = withTagSources(unit.tags, definition.grantsTags, 'add');

  return [kernelEventDraft(KERNEL_EVENTS.tagsChanged, { tags, unit: unit.id }, effect.visibleTo)];
}

function changed(holder: EffectHolder, existing: AppliedEffect, next: AppliedEffect): StepResult {
  return {
    events: [kernelEventDraft(KERNEL_EVENTS.effectChanged, { effect: next, holder }, existing.visibleTo)],
    kind: 'done',
  };
}

function refreshed(definition: Effect, existing: AppliedEffect): AppliedEffect {
  return { ...existing, ...remainingOf(definition) };
}

function remainingOf(definition: Effect): { readonly remaining?: number } {
  const { duration } = definition;

  return duration.kind === 'rounds' || duration.kind === 'turns' ? { remaining: duration.count } : {};
}

function strengthOf(applied: AppliedEffect): number {
  const { strength } = applied.params;

  return typeof strength === 'number' ? strength : 0;
}

function evaluatedZero(): { readonly kind: 'value'; readonly value: number } {
  return { kind: 'value', value: 0 };
}

function evaluatedTrue(): { readonly kind: 'value'; readonly value: boolean } {
  return { kind: 'value', value: true };
}
