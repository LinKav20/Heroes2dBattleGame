import { type Effect, effectDefinition } from '../content/index.ts';
import { EFFECT_NOT_APPLIED_REASONS } from '../events/index.ts';
import { evaluated, isBlocked } from '../expressions/index.ts';
import type { Evaluation, Expressions, StepContext, StepKind, StepResult } from '../extensions/index.ts';
import { battleUnit } from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { operationDrafts } from '../operations/index.ts';
import { appliedSubjects } from './applied.ts';
import { checkEffect } from './effect-checks.ts';
import { effectsOf } from './holders.ts';
import { applyNew, draftOf, notApplied, removedByTags } from './new-effect.ts';
import type { ApplicationParams } from './params.ts';
import { applyAgain } from './stacking.ts';

/**
 * Applies an effect to a holder. The effect is not applied, with `kernel:effect-not-applied`, if the holder is immune
 * to it or its condition of application does not hold. An instant effect only removes effects by tags and runs its
 * operations on application. If the holder already has the effect, its mode of stacking decides what happens; a new
 * effect removes the effects of the holder that it removes by tags and runs its operations on application. The
 * condition of application, the formula of strength and the operations see the effect with the parameters of the
 * application as their applied effect.
 */
export const APPLICATION_STEP: StepKind<ApplicationParams> = Object.freeze({
  kind: 'step',
  migrations: [],
  name: KERNEL_STEPS.effectApplication,
  run: applyEffect,
  version: 1,
});

function applyEffect(context: StepContext<ApplicationParams>): StepResult {
  const { content, expressions, params } = context;
  const { holder } = params;
  const definition = effectDefinition(content, params.effect);
  const draft = draftOf(context, definition);
  const subjects = appliedSubjects(holder, draft);
  const scoped = expressions.within({ effect: draft, subjects });

  checkEffect(definition, holder);

  const immune = immunity(context, definition, scoped);

  if (immune.kind !== 'value') return immune;

  if (immune.value) return notApplied(context, definition, EFFECT_NOT_APPLIED_REASONS.immune);

  if (definition.condition !== undefined) {
    const holds = scoped.test(definition.condition);

    if (holds.kind !== 'value') return holds;

    if (!holds.value) return notApplied(context, definition, EFFECT_NOT_APPLIED_REASONS.condition);
  }

  if (definition.duration.kind === 'instant') {
    const operations = operationDrafts(definition.onApply, { effect: draft, subjects });

    return { events: [], kind: 'done', steps: [...removedByTags(context, definition, undefined), ...operations] };
  }

  const existing = effectsOf(context.state, holder).find(({ effect }) => effect === params.effect);

  return existing === undefined
    ? applyNew(context, definition, draft, undefined, scoped)
    : applyAgain(context, definition, existing, draft, scoped);
}

function immunity(
  context: StepContext<ApplicationParams>,
  definition: Effect,
  expressions: Expressions,
): Evaluation<boolean> {
  const { holder } = context.params;

  if (holder.kind !== 'unit') return evaluated(false);

  battleUnit(context.state, holder.unit);

  const tags = expressions.tags(holder.unit);

  return tags.kind === 'value' ? evaluated(isBlocked(tags.value, definition.blockedBy)) : tags;
}
