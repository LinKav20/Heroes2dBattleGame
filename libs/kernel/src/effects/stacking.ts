import { ContentError, type Effect } from '../content/index.ts';
import { EFFECT_NOT_APPLIED_REASONS, KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { Expressions, StepContext, StepResult } from '../extensions/index.ts';
import { canonicalJson } from '../json/index.ts';
import type { AppliedEffect } from '../model/index.ts';
import { operationDrafts } from '../operations/index.ts';
import { withoutKey } from '../shared/index.ts';
import { appliedSubjects, remainingOf } from './applied.ts';
import { applyNew, notApplied, removedByTags, strengthOf } from './new-effect.ts';
import type { ApplicationParams } from './params.ts';

/**
 * Applies an effect to a holder that already has it, by its mode of stacking: the new one is ignored, refreshes the
 * duration, adds a stack up to the largest number of stacks, replaces the old one, or replaces it only if it is
 * stronger. A refresh or a stack takes the source and the parameters of the new application; an application that
 * changes nothing gives `kernel:effect-not-applied`.
 *
 * @throws {ContentError} If the mode of stacking is unknown.
 */
export function applyAgain(
  context: StepContext<ApplicationParams>,
  definition: Effect,
  existing: AppliedEffect,
  draft: AppliedEffect,
  expressions: Expressions,
): StepResult {
  switch (definition.stacking) {
    case 'ignore': {
      return notApplied(context, definition, EFFECT_NOT_APPLIED_REASONS.stacking);
    }

    case 'refresh': {
      return changed(context, definition, existing, draft, existing.stacks, []);
    }

    case 'stack': {
      const full = definition.maxStacks !== undefined && existing.stacks >= definition.maxStacks;

      return full
        ? changed(context, definition, existing, draft, existing.stacks, [])
        : changed(context, definition, existing, draft, existing.stacks + 1, definition.onApply);
    }

    case 'strongest': {
      const strength = strengthOf(definition, expressions);

      if (strength.kind !== 'value') return strength;

      return strength.value > (existing.strength ?? 0)
        ? applyNew(context, definition, draft, existing, expressions, strength.value)
        : notApplied(context, definition, EFFECT_NOT_APPLIED_REASONS.stacking);
    }

    case 'replace': {
      return applyNew(context, definition, draft, existing, expressions);
    }

    default: {
      throw new ContentError(
        `The effect ${JSON.stringify(definition.name)} has an unknown mode of stacking.`,
        { definition: definition.name },
      );
    }
  }
}

function changed(
  context: StepContext<ApplicationParams>,
  definition: Effect,
  existing: AppliedEffect,
  draft: AppliedEffect,
  stacks: number,
  onApply: Effect['onApply'],
): StepResult {
  const { holder } = context.params;
  const effect: AppliedEffect = {
    ...withoutKey(withoutKey(existing, 'sourceSide'), 'sourceUnit'),
    ...remainingOf(definition),
    params: draft.params,
    stacks,
    ...(draft.sourceSide === undefined ? {} : { sourceSide: draft.sourceSide }),
    ...(draft.sourceUnit === undefined ? {} : { sourceUnit: draft.sourceUnit }),
  };
  const steps = [
    ...removedByTags(context, definition, existing),
    ...operationDrafts(onApply, { effect, subjects: appliedSubjects(holder, effect) }),
  ];

  if (canonicalJson(effect) === canonicalJson(existing)) {
    return notApplied(context, definition, EFFECT_NOT_APPLIED_REASONS.stacking, steps);
  }

  return {
    events: [kernelEventDraft(KERNEL_EVENTS.effectChanged, { effect, holder }, existing.visibleTo)],
    kind: 'done',
    steps,
  };
}
