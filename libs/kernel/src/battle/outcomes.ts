import { ContentError, scenarioDefinition, type OutcomeCondition } from '../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { EventDraft, StepContext, StepKind, StepResult, Subjects } from '../extensions/index.ts';
import { VISIBLE_TO_ALL, type SideId } from '../ids/index.ts';
import type { BattleState, Outcome } from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { DONE, kernelStep } from '../operations/index.ts';

/**
 * Checks the outcome conditions of the scenario in the order they are listed, with the side of a condition as `self`,
 * and ends the battle with the first one that holds: the side wins, or loses and every other side wins, or nobody wins
 * in a draw. Only the kernel puts the step on the stack.
 *
 * @throws {ContentError} If the content has no scenario of the battle, or a condition is described wrongly or rolls
 * dice.
 */
export const OUTCOME_CHECK_STEP: StepKind = kernelStep(KERNEL_STEPS.outcomeCheck, checkOutcomes);

/**
 * Returns the event that ends the battle with an outcome.
 */
export function battleEnded(outcome: Outcome): EventDraft {
  return kernelEventDraft(KERNEL_EVENTS.battleEnded, { outcome }, VISIBLE_TO_ALL);
}

/**
 * Returns the sides of the battle other than the given one, in the order of the scenario.
 */
export function otherSides(state: BattleState, side: SideId): readonly SideId[] {
  return state.sides.filter(({ id }) => id !== side).map(({ id }) => id);
}

function checkOutcomes({ content, expressions, state }: StepContext): StepResult {
  const { outcomes } = scenarioDefinition(content, state.scenario);

  for (const condition of outcomes) {
    const subjects: Subjects = condition.side === undefined ? {} : { self: { kind: 'side', side: condition.side } };
    const holds = expressions.within({ rolls: false, subjects }).test(condition.condition);

    if (holds.kind !== 'value') return holds;

    if (holds.value) return { events: [battleEnded(outcomeOf(state, condition))], kind: 'done' };
  }

  return DONE;
}

function outcomeOf(state: BattleState, condition: OutcomeCondition): Outcome {
  const { id, outcome, side } = condition;

  if (outcome === 'draw') return { condition: id, kind: 'draw', winners: [] };

  if (side === undefined) {
    throw new ContentError(`The outcome ${JSON.stringify(id)} names no side.`, { definition: state.scenario });
  }

  const winners = outcome === 'victory' ? [side] : otherSides(state, side);

  return { condition: id, kind: outcome, side, winners };
}
