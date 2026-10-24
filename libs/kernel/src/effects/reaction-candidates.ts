import { effectDefinition } from '../content/index.ts';
import { isKernelEvent, KERNEL_EVENTS, RUNNER_EVENTS } from '../events/index.ts';
import type { StepDraft } from '../extensions/index.ts';
import type { AppliedEffect, BattleEvent, BattleState } from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { actingEffects, reactsTo } from './holders.ts';
import type { Reaction, ReactionBatch, ReactionParams } from './params.ts';
import type { ReactionIndex } from './reaction-index.ts';
import { EventView, type EventSetup } from './zone-touch.ts';

/**
 * What finding the reactions to events needs: the content, the kinds of events, the index of reacting effects and what
 * the zones of the field need.
 */
export interface ReactionSetup extends EventSetup {
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
 * about itself, and no effect reacts to the events of the runner. A trigger of an effect of a hazard zone fires only on
 * an event about a unit that stands in the zone, and on `kernel:unit-moved` only if the path of the unit, its last
 * cell included, touches the zone, or for a flying unit only if it stops there. On the way the unit keeps the direction
 * it had before the move, and in the last cell it has the direction it ends with.
 *
 * @throws {TypeError} If a kind of event names a cell or something else than a unit or a side as its target.
 */
export function reactionsAfter(
  setup: ReactionSetup,
  events: readonly BattleEvent[],
  states: readonly BattleState[],
  before: BattleState,
): StepDraft<ReactionParams> | undefined {
  const batches = events.flatMap((event, position) => {
    const state = states[position];
    const previous = position === 0 ? before : states[position - 1] ?? before;
    const batch = state === undefined ? undefined : batchOf(setup, event, previous, state);

    return batch === undefined ? [] : [batch];
  });

  return batches.length === 0 ? undefined : { params: { batches, next: [0, 0] }, type: KERNEL_STEPS.reaction };
}

function batchOf(
  setup: ReactionSetup,
  event: BattleEvent,
  before: BattleState,
  state: BattleState,
): ReactionBatch | undefined {
  const { content, index } = setup;
  const reacting = index.reacting(content, event.type);

  if (reacting === undefined || RUNNER_EVENTS.some((type) => type === event.type)) return undefined;

  const turn = state.phase.kind === 'turn' ? state.phase.side : undefined;
  const about = new EventView(setup, event, before, state);
  const triggers: Candidate[] = [];
  const endings: Candidate[] = [];
  const target = about.target();

  for (const { applied, effect, holder, side } of actingEffects(state, content, reacting)) {
    if (applied !== undefined && aboutItself(event, applied)) continue;

    if (!reactsTo(state, holder, target)) continue;

    const definition = effectDefinition(content, effect);
    const base = { effect, holder, ...(applied === undefined ? {} : { applied: applied.id }) };
    const order = applied?.id ?? -1;
    const first = turn !== undefined && side === turn;

    definition.triggers.forEach((trigger, position) => {
      if (trigger.on !== event.type || (holder.kind === 'hazard' && !about.touches(holder.hazard))) return;

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

  return { event, reactions, ...(target === undefined ? {} : { target }) };
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
