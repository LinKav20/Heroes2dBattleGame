import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { EventDraft, StepContext, StepDraft, StepKind, StepResult } from '../extensions/index.ts';
import { operationDrafts, removalDraft } from './drafts.ts';
import { allHolders, appliedSubjects, effectDefinition, effectsOf, type HeldEffects } from './holders.ts';
import { KERNEL_STEPS } from './names.ts';
import type { TickParams } from './params.ts';

/**
 * Counts down the effects at a moment of the battle: the start or the end of the turn of a unit or a side, or the end
 * of a round for every holder. An effect with a counted duration that ticks at this moment loses one round or turn,
 * runs its operations of every turn and ends when the counter reaches 0. Any other effect runs its operations of every
 * turn at the start of the turn of its holder. An effect runs them only while its condition of activity holds.
 */
export const TICK_STEP: StepKind<TickParams> = Object.freeze({
  kind: 'step',
  migrations: [],
  name: KERNEL_STEPS.effectTick,
  run: tick,
  version: 1,
});

const ACTIVE = Object.freeze({ kind: 'value', value: true } as const);

function tick(context: StepContext<TickParams>): StepResult {
  const { content, expressions, params } = context;
  const events: EventDraft[] = [];
  const steps: StepDraft[] = [];

  for (const { effects, holder } of heldAt(context)) {
    for (const applied of effects) {
      const definition = effectDefinition(content, applied.effect);
      const { duration } = definition;
      const counted = duration.kind === 'rounds' || duration.kind === 'turns';
      const ticks = counted && duration.tick === params.moment;
      const subjects = appliedSubjects(holder, applied);

      if (ticks || (!counted && params.moment === 'holder-turn-start')) {
        const active = definition.activeWhile === undefined
          ? ACTIVE
          : expressions.test(definition.activeWhile, subjects);

        if (active.kind !== 'value') return active;

        if (active.value) steps.push(...operationDrafts(definition.onTurn, subjects));
      }

      if (ticks) {
        const remaining = (applied.remaining ?? duration.count) - 1;

        if (remaining > 0) {
          const effect = { ...applied, remaining };

          events.push(kernelEventDraft(KERNEL_EVENTS.effectChanged, { effect, holder }, applied.visibleTo));
        } else {
          steps.push(removalDraft(holder, applied.id));
        }
      }
    }
  }

  return { events, kind: 'done', steps };
}

function heldAt({ params, state }: StepContext<TickParams>): readonly HeldEffects[] {
  if (params.moment === 'round-end') return allHolders(state);

  if (params.holder === undefined) throw new TypeError(`The moment ${params.moment} needs a unit or a side.`);

  return [{ effects: effectsOf(state, params.holder), holder: params.holder }];
}
