import { effectDefinition } from '../content/index.ts';
import type { StepContext, StepDraft, StepKind, StepResult, Subjects } from '../extensions/index.ts';
import type { BattleEvent } from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { DONE, operationDrafts, kernelStep } from '../operations/index.ts';
import { withoutKey } from '../shared/index.ts';
import { activity, unlessHolds } from './activity.ts';
import { appliedSubjects, presentEffect } from './applied.ts';
import { removalDraft } from './drafts.ts';
import { reactsTo } from './holders.ts';
import type { Reaction, ReactionBatch, ReactionParams } from './params.ts';

/**
 * Runs the reactions of effects to the events of a step from `next` on: reactions that do nothing are passed over in
 * the same run, and the first one that gives events, adds steps or needs a value ends the run; the rest goes to a new
 * step of this kind after the steps it adds. A reaction runs only if its effect is still in place and the condition of
 * the trigger or of the ending holds; a trigger also needs the condition of activity of its effect. In the conditions
 * and operations `self` is the holder of the effect, `source` the one that applied it and `target` the unit or the side
 * the event is about; they see the effect and the event.
 */
export const REACTION_STEP: StepKind<ReactionParams> = kernelStep(
  KERNEL_STEPS.reaction,
  react,
  (params: ReactionParams, migrate: (event: BattleEvent) => BattleEvent): ReactionParams => {
    const batches = params.batches.map((batch) => {
      const event = migrate(batch.event);

      return event === batch.event ? batch : { ...batch, event };
    });

    return batches.every((batch, position) => batch === params.batches[position]) ? params : { ...params, batches };
  },
);

function react(context: StepContext<ReactionParams>): StepResult {
  const { batches } = context.params;
  let [batch, place] = context.params.next;

  for (;;) {
    const current = batches[batch];

    if (current === undefined) return DONE;

    const reaction = current.reactions[place];

    if (reaction === undefined) {
      batch += 1;
      place = 0;
      continue;
    }

    const result = reactOnce(context, current, reaction);

    place += 1;

    if (result.kind !== 'done') return result;

    if (result.events.length > 0 || (result.steps ?? []).length > 0) {
      return { ...result, steps: [...result.steps ?? [], ...rest(context.params, batch, place)] };
    }
  }
}

function rest(params: ReactionParams, batch: number, place: number): ReadonlyArray<StepDraft<ReactionParams>> {
  const current = params.batches[batch];
  const within = current !== undefined && place < current.reactions.length;
  const next: [number, number] = within ? [batch, place] : [batch + 1, 0];

  return next[0] < params.batches.length ? [{ params: { ...params, next }, type: KERNEL_STEPS.reaction }] : [];
}

function reactOnce(context: StepContext<ReactionParams>, batch: ReactionBatch, reaction: Reaction): StepResult {
  const { content, expressions, state } = context;
  const { holder } = reaction;
  const present = presentEffect(state, content, holder, reaction.effect, reaction.applied);

  if (present === undefined || !reactsTo(state, holder, batch.target)) return DONE;

  const { applied } = present;
  const definition = effectDefinition(content, reaction.effect);
  const trigger = reaction.kind === 'trigger' ? definition.triggers[reaction.index] : undefined;
  const entry = trigger ?? (reaction.kind === 'end' ? definition.endsOn[reaction.index] : undefined);

  if (entry === undefined) throw new TypeError(`The effect ${JSON.stringify(reaction.effect)} has no such reaction.`);

  const inactive = trigger === undefined ? undefined : unlessHolds(activity(expressions, definition, holder, applied));

  if (inactive !== undefined) return inactive;

  const subjects: Subjects = {
    ...withoutKey(appliedSubjects(holder, applied), 'target'),
    ...(batch.target === undefined ? {} : { target: batch.target }),
  };
  const scope = { event: batch.event, subjects, ...(applied === undefined ? {} : { effect: applied }) };
  const { condition } = entry;
  const unmet = condition === undefined ? undefined : unlessHolds(expressions.within(scope).test(condition));

  if (unmet !== undefined) return unmet;

  if (trigger !== undefined) return { events: [], kind: 'done', steps: operationDrafts(trigger.ops, scope) };

  if (applied === undefined) {
    throw new TypeError(`An event ends the effect ${JSON.stringify(reaction.effect)}, which is not applied.`);
  }

  return { events: [], kind: 'done', steps: [removalDraft({ effect: applied.id, holder })] };
}
