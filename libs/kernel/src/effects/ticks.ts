import { effectDefinition } from '../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { EventDraft, StepContext, StepDraft, StepKind, StepResult } from '../extensions/index.ts';
import type { EffectHolder } from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { kernelStep } from '../operations/index.ts';
import { removalDraft, turnDraft } from './drafts.ts';
import { allHolders, definitionEffectsOf, effectsOf, type HeldEffects } from './holders.ts';
import type { TickMoment, TickParams } from './params.ts';

/**
 * Counts down the effects at a moment of the battle: the start or the end of the turn of a unit or a side, or the end
 * of a round for every holder. An applied effect with a counted duration that ticks at this moment loses one round or
 * turn and ends when the counter reaches 0. Operations of every turn run in their own steps, one per effect, which
 * check that the effect is still there and acts: for a counted effect at the moment it ticks, for another effect at
 * the turn of its holder. A unit or a side has its turn at its start, and the field and a hazard zone at the end of a
 * round; the effects of the creature, the items and the battlefield run their operations at the turn of their holder.
 */
export const TICK_STEP: StepKind<TickParams> = kernelStep(KERNEL_STEPS.effectTick, tick);

function tick({ content, params, state }: StepContext<TickParams>): StepResult {
  const events: EventDraft[] = [];
  const steps: StepDraft[] = [];

  for (const { effects, holder } of heldAt(params, state)) {
    const turn = isTurnOf(holder, params.moment);

    if (turn) {
      for (const effect of definitionEffectsOf(state, content, holder)) {
        if (effectDefinition(content, effect).onTurn.length > 0) steps.push(turnDraft({ effect, holder }));
      }
    }

    for (const applied of effects) {
      const definition = effectDefinition(content, applied.effect);
      const { duration } = definition;
      const counted = duration.kind === 'rounds' || duration.kind === 'turns';
      const ticks = counted && duration.tick === params.moment;

      if ((ticks || (!counted && turn)) && definition.onTurn.length > 0) {
        steps.push(turnDraft({ applied: applied.id, effect: applied.effect, holder }));
      }

      if (!ticks) continue;

      const remaining = (applied.remaining ?? duration.count) - 1;

      if (remaining > 0) {
        const effect = { ...applied, remaining };

        events.push(kernelEventDraft(KERNEL_EVENTS.effectChanged, { effect, holder }, applied.visibleTo));
      } else {
        steps.push(removalDraft({ effect: applied.id, holder }));
      }
    }
  }

  return { events, kind: 'done', steps };
}

function heldAt(params: TickParams, state: StepContext['state']): readonly HeldEffects[] {
  if (params.moment === 'round-end') return allHolders(state);

  return [{ effects: effectsOf(state, params.holder), holder: params.holder }];
}

function isTurnOf(holder: EffectHolder, moment: TickMoment): boolean {
  return holder.kind === 'field' || holder.kind === 'hazard' ? moment === 'round-end' : moment === 'holder-turn-start';
}
