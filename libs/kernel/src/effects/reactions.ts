import type { ContentRegistry } from '../content/index.ts';
import { RUNNER_EVENTS } from '../events/index.ts';
import { battlefieldEffects, itemEffects } from '../expressions/index.ts';
import type { StepContext, StepDraft, StepKind, StepResult, Subjects } from '../extensions/index.ts';
import type { ContentName } from '../ids/index.ts';
import type { AppliedEffect, BattleEvent, BattleState, EffectHolder, Target } from '../model/index.ts';
import { isRecord, ownValue } from '../shared/index.ts';
import { operationDrafts, removalDraft } from './drafts.ts';
import { allHolders, appliedSubjects, effectDefinition, effectsOf, sideOf } from './holders.ts';
import { KERNEL_STEPS } from './names.ts';
import type { ReactionParams } from './params.ts';

interface Candidate {
  readonly first: boolean;
  readonly priority: number;
  readonly order: number;
  readonly params: ReactionParams;
}

interface Acting {
  readonly effect: ContentName;
  readonly holder: EffectHolder;
  readonly applied?: AppliedEffect;
}

/**
 * Runs a reaction of an effect to an event: a trigger runs its operations, or the event ends the effect, if the
 * effect still acts and the condition holds. `self` is the holder of the effect, `source` the one that applied it and
 * `target` the unit or the side the event is about.
 */
export const REACTION_STEP: StepKind<ReactionParams> = Object.freeze({
  kind: 'step',
  migrations: [],
  name: KERNEL_STEPS.reaction,
  run: react,
  version: 1,
});

/**
 * Returns the reactions of effects to an event, in the order they run: triggers of the side that has the turn first,
 * then by priority, then in the order the effects were applied; after them the endings of effects by the event.
 */
export function reactionDrafts(
  event: BattleEvent,
  state: BattleState,
  content: ContentRegistry,
): ReadonlyArray<StepDraft<ReactionParams>> {
  if (RUNNER_EVENTS.some((type) => type === event.type)) return [];

  const target = eventTarget(event);
  const subjects: Subjects = target === undefined ? {} : { target };
  const turn = state.phase.kind === 'turn' ? state.phase.side : undefined;
  const triggers: Candidate[] = [];
  const endings: Candidate[] = [];

  for (const { effect, holder, applied } of acting(state, content)) {
    const definition = effectDefinition(content, effect);
    const base = { effect, holder, subjects, ...(applied === undefined ? {} : { applied: applied.id }) };
    const order = applied?.id ?? -1;
    const first = turn !== undefined && sideOf(state, holder) === turn;

    definition.triggers.forEach((trigger, index) => {
      if (trigger.on !== event.type) return;

      triggers.push({ first, order, params: { ...base, index, kind: 'trigger' }, priority: trigger.priority });
    });

    if (applied === undefined) continue;

    definition.endsOn.forEach((ending, index) => {
      if (ending.on !== event.type) return;

      endings.push({ first: false, order, params: { ...base, index, kind: 'end' }, priority: 0 });
    });
  }

  return [...triggers.toSorted(byTurnPriorityOrder), ...endings.toSorted(byTurnPriorityOrder)]
    .map(({ params }) => ({ params, type: KERNEL_STEPS.reaction }));
}

const DONE: StepResult = Object.freeze({ events: [], kind: 'done' });

function react({ content, expressions, params, state }: StepContext<ReactionParams>): StepResult {
  const definition = effectDefinition(content, params.effect);
  const applied = params.applied === undefined
    ? undefined
    : effectsOf(state, params.holder).find(({ id }) => id === params.applied);

  if (params.applied !== undefined && applied === undefined) return DONE;

  const subjects = { ...appliedSubjects(params.holder, applied), ...params.subjects };
  const trigger = params.kind === 'trigger' ? definition.triggers[params.index] : undefined;
  const entry = trigger ?? (params.kind === 'end' ? definition.endsOn[params.index] : undefined);

  if (entry === undefined) throw new TypeError(`The effect ${JSON.stringify(params.effect)} has no such reaction.`);

  for (const condition of [definition.activeWhile, entry.condition]) {
    if (condition === undefined) continue;

    const holds = expressions.test(condition, subjects);

    if (holds.kind !== 'value') return holds;

    if (!holds.value) return DONE;
  }

  if (trigger !== undefined) return { events: [], kind: 'done', steps: operationDrafts(trigger.ops, subjects) };

  return applied === undefined ? DONE : ended(params.holder, applied);
}

function ended(holder: EffectHolder, applied: AppliedEffect): StepResult {
  return { events: [], kind: 'done', steps: [removalDraft(holder, applied.id)] };
}

function acting(state: BattleState, content: ContentRegistry): readonly Acting[] {
  const field: EffectHolder = { kind: 'field' };

  return [
    ...battlefieldEffects(state, content).map((effect) => ({ effect, holder: field })),
    ...state.units.flatMap((unit) => {
      const holder: EffectHolder = { kind: 'unit', unit: unit.id };
      const creature = ownValue(content.creatures, unit.creature)?.effects ?? [];

      return [...creature, ...itemEffects(content, unit)].map((effect) => ({ effect, holder }));
    }),
    ...allHolders(state).flatMap(({ effects, holder }) =>
      effects.map((applied) => ({ applied, effect: applied.effect, holder }))),
  ];
}

function eventTarget(event: BattleEvent): Target | undefined {
  const { payload } = event;

  if (!isRecord(payload)) return undefined;

  if (typeof payload.unit === 'string') return { kind: 'unit', unit: payload.unit };

  if (isRecord(payload.holder) && payload.holder.kind === 'unit' && typeof payload.holder.unit === 'string') {
    return { kind: 'unit', unit: payload.holder.unit };
  }

  if (isRecord(payload.holder) && payload.holder.kind === 'side' && typeof payload.holder.side === 'string') {
    return { kind: 'side', side: payload.holder.side };
  }

  return typeof payload.side === 'string' ? { kind: 'side', side: payload.side } : undefined;
}

function byTurnPriorityOrder(left: Candidate, right: Candidate): number {
  return Number(right.first) - Number(left.first) || right.priority - left.priority || left.order - right.order;
}
