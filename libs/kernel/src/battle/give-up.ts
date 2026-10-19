import type { StepContext, StepKind } from '../extensions/index.ts';
import { findSide, forbidden, REJECTION_REASONS, type RetreatCommand, type SurrenderCommand } from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { kernelStep } from '../operations/index.ts';
import { giveUpDraft } from './drafts.ts';
import { battleEnded, otherSides } from './outcomes.ts';
import type { GiveUpParams } from './params.ts';
import { plannedSteps, type BattlePlan, type PlanContext } from './plan-context.ts';

/**
 * Ends the battle because a side retreats or surrenders; every other side wins. Only the kernel puts the step on the
 * stack.
 */
export const GIVE_UP_STEP: StepKind<GiveUpParams> = kernelStep(
  KERNEL_STEPS.giveUp,
  ({ params, state }: StepContext<GiveUpParams>) => ({
    events: [battleEnded({ kind: params.kind, side: params.side, winners: otherSides(state, params.side) })],
    kind: 'done',
  }),
);

/**
 * Checks a command that a side retreats or surrenders: the side must be in the battle, and the battle must have
 * started. The battle ends, and every other side wins.
 */
export function planGiveUp(context: PlanContext, command: RetreatCommand | SurrenderCommand): BattlePlan {
  const { side, type } = command;
  const { state } = context;

  if (findSide(state, side) === undefined) return forbidden(REJECTION_REASONS.invalidCommand, { field: 'side' });

  if (state.phase.kind === 'deployment') return forbidden(REJECTION_REASONS.wrongPhase);

  return plannedSteps([giveUpDraft({ kind: type, side })]);
}
