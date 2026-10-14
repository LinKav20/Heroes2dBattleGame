import type { Effect } from '../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft, type EffectNotAppliedReason } from '../events/index.ts';
import { evaluated, matchesAny } from '../expressions/index.ts';
import type { Evaluation, Expressions, StepContext, StepDraft, StepResult } from '../extensions/index.ts';
import type { AppliedEffect } from '../model/index.ts';
import { activity } from './activity.ts';
import { appliedSubjects, remainingOf, visibilityOf } from './applied.ts';
import { operationDrafts, removalDraft } from './drafts.ts';
import { effectDefinition, effectsOf } from './holders.ts';
import type { ApplicationParams } from './params.ts';
import { removal } from './removal.ts';

/**
 * Returns the effect as it would be applied now: the next identifier, the parameters and the source of the
 * application, one stack, the counter of its duration and its visibility. Conditions and formulas of the application
 * see it as their applied effect.
 */
export function draftOf(context: StepContext<ApplicationParams>, definition: Effect): AppliedEffect {
  const { params, state } = context;

  return {
    active: true,
    effect: definition.name,
    id: state.nextId,
    params: params.params ?? {},
    stacks: 1,
    visibleTo: visibilityOf(definition, state, params.holder),
    ...remainingOf(definition),
    ...sourceFields(params),
  };
}

/**
 * Applies the effect anew: replaces the old one if any, removes the effects it removes by tags and runs its operations
 * on application. The strength is evaluated unless it is known already.
 */
export function applyNew(
  context: StepContext<ApplicationParams>,
  definition: Effect,
  draft: AppliedEffect,
  replaced: AppliedEffect | undefined,
  expressions: Expressions,
  known?: number,
): StepResult {
  const { content, params } = context;
  const { holder } = params;
  const strength = known === undefined ? strengthOf(definition, expressions) : evaluated(known);

  if (strength.kind !== 'value') return strength;

  const strong = definition.strength === undefined ? draft : { ...draft, strength: strength.value };
  const active = holder.kind === 'unit' ? activity(context.expressions, definition, holder, strong) : evaluated(true);

  if (active.kind !== 'value') return active;

  const effect = { ...strong, active: active.value };
  const old = replaced === undefined ? { events: [], steps: [] } : removal(content, holder, replaced);

  return {
    events: [...old.events, kernelEventDraft(KERNEL_EVENTS.effectApplied, { effect, holder }, effect.visibleTo)],
    kind: 'done',
    steps: [
      ...old.steps,
      ...removedByTags(context, definition, replaced),
      ...operationDrafts(definition.onApply, { effect, subjects: appliedSubjects(holder, effect) }),
    ],
  };
}

/**
 * Returns the steps that remove the effects of the holder with the tags the effect removes, except the kept one.
 */
export function removedByTags(
  context: StepContext<ApplicationParams>,
  definition: Effect,
  kept: AppliedEffect | undefined,
): readonly StepDraft[] {
  const { content, params, state } = context;

  if (definition.removes.length === 0) return [];

  return effectsOf(state, params.holder)
    .filter((other) => other !== kept)
    .filter((other) => matchesAny(effectDefinition(content, other.effect).tags, definition.removes))
    .map((other) => removalDraft({ effect: other.id, holder: params.holder }));
}

/**
 * Returns the event that the effect is not applied, seen by the sides that would see the effect.
 */
export function notApplied(
  context: StepContext<ApplicationParams>,
  definition: Effect,
  reason: EffectNotAppliedReason,
  steps: readonly StepDraft[] = [],
): StepResult {
  const { holder } = context.params;
  const visibleTo = visibilityOf(definition, context.state, holder);
  const payload = { effect: definition.name, holder, reason };
  const event = kernelEventDraft(KERNEL_EVENTS.effectNotApplied, payload, visibleTo);

  return { events: [event], kind: 'done', ...(steps.length === 0 ? {} : { steps }) };
}

/**
 * Evaluates the strength of an effect, or gives 0 for an effect without a formula of strength.
 */
export function strengthOf(definition: Effect, expressions: Expressions): Evaluation<number> {
  return definition.strength === undefined ? evaluated(0) : expressions.value(definition.strength);
}

/**
 * Returns the fields of an applied effect that name its source.
 */
export function sourceFields(params: ApplicationParams): Pick<AppliedEffect, 'sourceSide' | 'sourceUnit'> {
  const { source } = params;

  if (source?.kind === 'unit') return { sourceUnit: source.unit };

  return source?.kind === 'side' ? { sourceSide: source.side } : {};
}
