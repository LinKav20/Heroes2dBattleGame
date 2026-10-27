import {
  findSide,
  findUnit,
  forbidden,
  REJECTION_REASONS,
  turnHolderOf,
  turnRejection,
  type DefendCommand,
  type EndTurnCommand,
  type WaitCommand,
} from '../model/index.ts';
import { defenseOf, mechanicContext, turnOrderOf } from './mechanics.ts';
import { packagePlan, plannedSteps, settled, type BattlePlan, type PlanContext } from './plan-context.ts';
import { allSpent } from './turn-actions.ts';

/**
 * Checks a command that a unit waits and plans it with the order of turns of the ruleset. The battle must be in a
 * turn, the unit must have the turn, as `turnRejection` tells, and the order of turns must let units wait in turns of
 * units. A projection that hides the unit with the turn rejects the command for the same reason as the full state.
 * After the steps of the order of turns the turn ends as put off.
 *
 * @throws {ContentError} If the ruleset chooses no order of turns.
 * @throws {TypeError} If no package declares the order of turns, or it forbids the command with a reason that
 * `packageRejection` does not allow or plans a step that only the kernel adds.
 */
export function planWait(context: PlanContext, command: WaitCommand): BattlePlan {
  const { mechanics, state } = context;
  const unit = findUnit(state, command.unit);

  if (unit === undefined) return forbidden(REJECTION_REASONS.invalidCommand, { field: 'unit' });

  const turn = turnRejection(state, { kind: 'unit', unit: unit.id });

  if (turn !== undefined) return turn;

  const { params, variant } = turnOrderOf(mechanics, state.ruleset);

  if (variant.wait === undefined || state.phase.kind !== 'turn' || state.phase.unit === undefined) {
    return forbidden(REJECTION_REASONS.notAvailable);
  }

  return packagePlan(variant.name, variant.wait(mechanicContext(context, params), unit.id), 'waited');
}

/**
 * Checks a command that a unit defends and plans it with the defense of the ruleset. The battle must be in a turn,
 * the ruleset must choose a defense, the unit must have the turn and some action of the turn left. The defense may end
 * the turn by its plan.
 *
 * @throws {TypeError} If no package declares the defense, or it forbids the command with a reason that
 * `packageRejection` does not allow or plans a step that only the kernel adds.
 */
export function planDefend(context: PlanContext, command: DefendCommand): BattlePlan {
  const { expressions, mechanics, state } = context;
  const unit = findUnit(state, command.unit);

  if (unit === undefined) return forbidden(REJECTION_REASONS.invalidCommand, { field: 'unit' });

  if (state.phase.kind !== 'turn') return forbidden(REJECTION_REASONS.wrongPhase);

  const defense = defenseOf(mechanics, state.ruleset);

  if (defense === undefined) return forbidden(REJECTION_REASONS.notAvailable);

  const turn = turnRejection(state, { kind: 'unit', unit: unit.id });

  if (turn !== undefined) return turn;

  const spent = settled(allSpent(state, expressions, unit));

  if (spent.kind !== 'value') return spent;

  const [action = ''] = state.ruleset.turn.actions;

  if (spent.value) return forbidden(REJECTION_REASONS.notEnoughActions, { action });

  return packagePlan(defense.variant.name, defense.variant.defend(mechanicContext(context, defense.params), unit.id));
}

/**
 * Checks a command that ends the turn of the side or the unit that has it: the command must name a unit or a side of
 * the battle, not both, of the kind that gets turns by the ruleset, the battle must be in a turn, the ruleset must
 * allow the command, and the unit or the side must be the holder of the turn.
 */
export function planEndTurn(context: PlanContext, command: EndTurnCommand): BattlePlan {
  const { state } = context;
  const { side, unit } = command;
  const owner = state.ruleset.turnOwner;

  if (unit !== undefined && (side !== undefined || owner !== 'unit' || findUnit(state, unit) === undefined)) {
    return forbidden(REJECTION_REASONS.invalidCommand, { field: 'unit' });
  }

  if (unit === undefined && (side === undefined || owner !== 'side' || findSide(state, side) === undefined)) {
    return forbidden(REJECTION_REASONS.invalidCommand, { field: 'side' });
  }

  const holder = turnHolderOf(state.phase);

  if (holder === undefined) return forbidden(REJECTION_REASONS.wrongPhase);

  if (!state.ruleset.turn.endTurn) return forbidden(REJECTION_REASONS.notAvailable);

  const own = holder.kind === 'unit' ? holder.unit === unit : holder.side === side;

  return own ? plannedSteps([], 'ended') : forbidden(REJECTION_REASONS.notYourTurn);
}
