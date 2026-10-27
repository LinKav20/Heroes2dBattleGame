import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import { evaluated } from '../expressions/index.ts';
import type { EventDraft, Evaluation, Expressions, StepContext, StepKind, StepResult } from '../extensions/index.ts';
import type { ContentName } from '../ids/index.ts';
import {
  battleUnit,
  fieldUnitsOf,
  REJECTION_REASONS,
  standsOnField,
  type BattleState,
  type SideHolder,
  type TurnHolder,
  type Unit,
  type UnitHolder,
} from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { DONE, kernelStep } from '../operations/index.ts';
import { sortedEntries } from '../shared/index.ts';
import type { SpendActionsParams } from './params.ts';

/**
 * Spends actions of the turn of a unit with `kernel:actions-changed`, which the sides that see the unit see. A step of
 * a package adds it for the cost of an action, for example an attack or a defense. If the unit has fewer actions of a
 * kind left than it spends, the step rejects the command with `kernel:not-enough-actions`. A unit that no longer
 * stands on the field, for example one that died on its way to attack, spends nothing.
 *
 * @throws {TypeError} If the unit is not in the battle or a number of actions is not a whole number from 0.
 */
export const SPEND_ACTIONS_STEP: StepKind<SpendActionsParams> = kernelStep(
  KERNEL_STEPS.spendActions,
  ({ expressions, params, state }: StepContext<SpendActionsParams>): StepResult => {
    const unit = battleUnit(state, params.unit);

    checkSpent(params.spent);

    if (!standsOnField(unit)) return DONE;

    for (const [action, cost] of sortedEntries(params.spent)) {
      const left = actionsLeft(expressions, unit, action);

      if (left.kind !== 'value') return left;

      if (left.value < cost) return { kind: 'reject', params: { action }, reason: REJECTION_REASONS.notEnoughActions };
    }

    return { events: spentEvents(unit, params.spent), kind: 'done' };
  },
);

/**
 * Returns the event with which a unit spends actions of its turn, or none if it spends nothing.
 *
 * @throws {TypeError} If a number of actions is not a whole number from 0.
 */
export function spentEvents(unit: Unit, spent: Readonly<Record<ContentName, number>>): readonly EventDraft[] {
  const costs = sortedEntries(spent).filter(([, cost]) => cost !== 0);

  if (costs.length === 0) return [];

  checkSpent(spent);

  const total = { ...unit.spentActions };

  for (const [action, cost] of costs) {
    total[action] = (total[action] ?? 0) + cost;
  }

  return [kernelEventDraft(KERNEL_EVENTS.actionsChanged, { spent: total, unit: unit.id }, unit.visibleTo)];
}

/**
 * Returns how many actions of a kind a unit has left in its turn: the value of the attribute with the name of the
 * kind, less the actions of the kind it has spent, and not below 0.
 */
export function actionsLeft(expressions: Expressions, unit: Unit, action: ContentName): Evaluation<number> {
  const available = expressions.attribute({ kind: 'unit', unit: unit.id }, action);

  if (available.kind !== 'value') return available;

  return evaluated(Math.max(0, available.value - (unit.spentActions[action] ?? 0)));
}

/**
 * Returns who takes part in a turn: the unit and its side for the turn of a unit, the side and its units on the field
 * for the turn of a side. The counts of durations and uses of the turn go for all of them. If the ruleset gives turns
 * to units, a turn of a side is the turn of a unit a projection hides, and only the side takes part in it.
 *
 * @throws {TypeError} If the unit is not in the battle.
 */
export function turnParticipants(state: BattleState, holder: TurnHolder): readonly TurnHolder[] {
  if (holder.kind === 'unit') {
    const side: SideHolder = { kind: 'side', side: battleUnit(state, holder.unit).side };

    return [holder, side];
  }

  if (state.ruleset.turnOwner === 'unit') return [holder];

  return [holder, ...fieldUnitsOf(state, holder.side).map(({ id }): UnitHolder => ({ kind: 'unit', unit: id }))];
}

/**
 * Tells whether the turn of a side or a unit is over by itself: a unit that has the turn is over if it does not stand
 * on the field or has spent every kind of action of the turn that the ruleset lists; a side is over if none of its
 * units stands on the field or each of them has spent them all. With no kinds of actions listed, only a unit that does
 * not stand on the field or a side without such units is over.
 */
export function turnOver(
  context: Pick<StepContext, 'expressions' | 'state'>,
  holder: TurnHolder,
): Evaluation<boolean> {
  const { expressions, state } = context;
  const units = holder.kind === 'unit' ? [battleUnit(state, holder.unit)] : fieldUnitsOf(state, holder.side);

  if (units.length === 0 || !units.every(standsOnField)) return evaluated(true);

  for (const unit of units) {
    const spent = allSpent(state, expressions, unit);

    if (spent.kind !== 'value' || !spent.value) return spent;
  }

  return evaluated(true);
}

/**
 * Tells whether a unit has spent every kind of action of the turn that the ruleset lists; with none listed, it has not.
 */
export function allSpent(state: BattleState, expressions: Expressions, unit: Unit): Evaluation<boolean> {
  const { actions } = state.ruleset.turn;

  if (actions.length === 0) return evaluated(false);

  for (const action of actions) {
    const left = actionsLeft(expressions, unit, action);

    if (left.kind !== 'value') return left;

    if (left.value > 0) return evaluated(false);
  }

  return evaluated(true);
}

function checkSpent(spent: Readonly<Record<ContentName, number>>): void {
  for (const [action, cost] of sortedEntries(spent)) {
    if (!Number.isSafeInteger(cost) || cost < 0) {
      throw new TypeError(`A unit spends ${String(cost)} of ${JSON.stringify(action)}, not a whole number from 0.`);
    }
  }
}
