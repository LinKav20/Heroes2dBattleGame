import type { ContentRegistry } from '../content/index.ts';
import { isKernelEvent, KERNEL_EVENTS, RUNNER_EVENTS } from '../events/index.ts';
import type { EventKind, StepDraft } from '../extensions/index.ts';
import type { AppliedEffect, BattleEvent, BattleState } from '../model/index.ts';
import type { Registry } from '../names/index.ts';
import { isRecord } from '../shared/index.ts';
import { actingEffects, effectDefinition } from './holders.ts';
import { KERNEL_STEPS } from './names.ts';
import type { Reaction, ReactionBatch, ReactionParams } from './params.ts';
import type { ReactionIndex } from './reaction-index.ts';

/**
 * What finding the reactions to events needs: the content, the kinds of events and the index of reacting effects.
 */
export interface ReactionSetup {
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** The kinds of events, which tell whom an event is about. */
  readonly events: Registry<EventKind>;
  /** Which effects react to which kinds of events. */
  readonly index: ReactionIndex;
}

interface Candidate {
  readonly first: boolean;
  readonly priority: number;
  readonly order: number;
  readonly reaction: Reaction;
}

/**
 * Returns the step with the reactions of effects to the events of a step, or nothing if no effect reacts. For every
 * event the reacting effects are those in place right after it, in this order: triggers of the side that has the turn
 * first, then by priority, then the effects of definitions before the applied ones, which go in the order they were
 * applied; after the triggers come the endings of effects by the event. An applied effect does not react to the events
 * about itself, and no effect reacts to the events of the runner.
 *
 * @throws {TypeError} If a kind of event names a cell or something else than a unit or a side as its target.
 */
export function reactionsAfter(
  setup: ReactionSetup,
  events: readonly BattleEvent[],
  states: readonly BattleState[],
): StepDraft<ReactionParams> | undefined {
  const batches = events.flatMap((event, position) => {
    const state = states[position];
    const batch = state === undefined ? undefined : batchOf(setup, event, state);

    return batch === undefined ? [] : [batch];
  });

  return batches.length === 0 ? undefined : { params: { batches, next: [0, 0] }, type: KERNEL_STEPS.reaction };
}

function batchOf(setup: ReactionSetup, event: BattleEvent, state: BattleState): ReactionBatch | undefined {
  const { content, events, index } = setup;
  const reacting = index.reacting(content, event.type);

  if (reacting === undefined || RUNNER_EVENTS.some((type) => type === event.type)) return undefined;

  const turn = state.phase.kind === 'turn' ? state.phase.side : undefined;
  const triggers: Candidate[] = [];
  const endings: Candidate[] = [];

  for (const { applied, effect, holder, side } of actingEffects(state, content, reacting)) {
    if (applied !== undefined && aboutItself(event, applied)) continue;

    const definition = effectDefinition(content, effect);
    const base = { effect, holder, ...(applied === undefined ? {} : { applied: applied.id }) };
    const order = applied?.id ?? -1;
    const first = turn !== undefined && side === turn;

    definition.triggers.forEach((trigger, position) => {
      if (trigger.on !== event.type) return;

      const reaction: Reaction = { ...base, index: position, kind: 'trigger' };

      triggers.push({ first, order, priority: trigger.priority, reaction });
    });

    if (applied === undefined) continue;

    definition.endsOn.forEach((ending, position) => {
      if (ending.on !== event.type) return;

      endings.push({ first: false, order, priority: 0, reaction: { ...base, index: position, kind: 'end' } });
    });
  }

  const reactions = [...triggers.toSorted(byTurnPriorityOrder), ...endings.toSorted(byTurnPriorityOrder)]
    .map(({ reaction }) => reaction);

  if (reactions.length === 0) return undefined;

  const target = targetOf(events.get(event.type), event);

  return { event, reactions, ...(target === undefined ? {} : { target }) };
}

function targetOf(kind: EventKind | undefined, event: BattleEvent): ReactionBatch['target'] {
  const target: unknown = kind?.target?.(event.payload);

  if (target === undefined) return undefined;

  if (isRecord(target) && target.kind === 'unit' && typeof target.unit === 'string') {
    return { kind: 'unit', unit: target.unit };
  }

  if (isRecord(target) && target.kind === 'side' && typeof target.side === 'string') {
    return { kind: 'side', side: target.side };
  }

  throw new TypeError(
    `The kind of event ${JSON.stringify(event.type)} names a target that is neither a unit nor a side.`,
  );
}

function aboutItself(event: BattleEvent, applied: AppliedEffect): boolean {
  if (isKernelEvent(event, KERNEL_EVENTS.effectApplied) || isKernelEvent(event, KERNEL_EVENTS.effectChanged)) {
    return event.payload.effect.id === applied.id;
  }

  return isKernelEvent(event, KERNEL_EVENTS.effectRemoved) && event.payload.effect === applied.id;
}

function byTurnPriorityOrder(left: Candidate, right: Candidate): number {
  return Number(right.first) - Number(left.first) || right.priority - left.priority || left.order - right.order;
}
