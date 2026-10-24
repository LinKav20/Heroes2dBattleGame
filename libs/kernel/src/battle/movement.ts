import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { EvaluatedValue, EventDraft, StepContext, StepKind, StepRejects } from '../extensions/index.ts';
import {
  battleUnit,
  findUnit,
  forbidden,
  REJECTION_REASONS,
  standsOnField,
  turnRejection,
  type Forbidden,
  type BattleState,
  type MoveCommand,
  type Unit,
} from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { kernelStep } from '../operations/index.ts';
import { sortedEntries } from '../shared/index.ts';
import { placeProblem } from './deployment.ts';
import { moveDraft } from './drafts.ts';
import type { MoveParams } from './params.ts';
import { plannedSteps, settled, type BattlePlan, type PlanContext } from './plan-context.ts';
import { actionsLeft, spentEvents } from './turn-actions.ts';

/**
 * Moves a unit along a path: spends the actions of the turn the move costs with `kernel:actions-changed`, then gives
 * `kernel:unit-moved`, or `kernel:unit-turned` if the path is empty and the unit faces a new direction. The events are
 * seen by the sides that see the unit. The step trusts its path; a package that adds it checks the path first.
 *
 * @throws {TypeError} If the unit is not in the battle or a number of actions is not a whole number from 0.
 */
export const MOVE_STEP: StepKind<MoveParams> = kernelStep(
  KERNEL_STEPS.move,
  ({ params, state }: StepContext<MoveParams>) => {
    return { events: moveStepEvents(state, params), kind: 'done' };
  },
);

/**
 * Checks a command to move a unit and plans the move, as `plannedMove` tells.
 */
export function planMove(context: PlanContext, command: MoveCommand): BattlePlan {
  const move = plannedMove(context, command);

  return move.kind === 'value' ? plannedSteps([moveDraft(move.value)]) : move;
}

/**
 * Checks a move of a unit and returns the parameters of `kernel:move` for it: the path and the actions of the turn it
 * spends. The unit must have the turn, be alive and stand on the field, the ruleset must let units move, the cell must
 * be on the field and the direction one of the field, and the unit must have the actions of the turn that every move
 * spends. The unit goes along the cheapest path to a cell where it can stop, at most as far as the actions that count
 * the cost of movement it has left allow, and faces the given direction at the end. A move that neither moves the unit
 * nor turns it is invalid. A package that moves a unit as a part of its own command plans the move this way and adds
 * `moveDraft` with the parameters. `options.field` is the field of the command with the cell, which a rejection
 * names, `to` if not given. With `options.actions` false, the move neither needs nor spends the actions of the turn
 * that every move spends, only the actions that count the cost of movement, as the move before a strike of `attack`.
 *
 * @throws {TypeError} If an evaluation needs a roll.
 */
export function plannedMove(
  context: Pick<PlanContext, 'expressions' | 'field' | 'state'>,
  command: MoveCommand,
  options: { readonly field?: 'from' | 'to'; readonly actions?: boolean } = {},
): EvaluatedValue<MoveParams> | Forbidden | StepRejects {
  const { expressions, field, state } = context;
  const unit = findUnit(state, command.unit);

  if (unit === undefined) return forbidden(REJECTION_REASONS.invalidCommand, { field: 'unit' });

  const turn = turnRejection(state, { kind: 'unit', unit: unit.id });

  if (turn !== undefined) return turn;

  if (!standsOnField(unit)) return forbidden(REJECTION_REASONS.notOnField, { unit: unit.id });

  const { movement } = state.ruleset.turn;

  if (movement === undefined) return forbidden(REJECTION_REASONS.notAvailable);

  const { facing, to } = command;
  const name = options.field ?? 'to';
  const problem = placeProblem(field, to, facing, name);

  if (problem !== undefined) return problem;

  const actions = options.actions === false ? {} : movement.actions;

  for (const [action, cost] of sortedEntries(actions)) {
    const left = settled(actionsLeft(expressions, unit, action));

    if (left.kind !== 'value') return left;

    if (left.value < cost) return forbidden(REJECTION_REASONS.notEnoughActions, { action });
  }

  const points = settled(actionsLeft(expressions, unit, movement.points));

  if (points.kind !== 'value') return points;

  const budget = points.value;
  const route = field.path(unit.id, to, facing === undefined ? { budget } : { budget, facing });

  if (route === undefined) return forbidden(REJECTION_REASONS.unreachable, { cell: to });

  if (route.cells.length === 0 && (facing === undefined || facing === unit.facing)) {
    return forbidden(REJECTION_REASONS.invalidCommand, { field: name });
  }

  const spent = { ...actions, [movement.points]: route.cost };

  const value = { path: route.cells, spent, unit: unit.id, ...(facing === undefined ? {} : { facing }) };

  return { kind: 'value', value };
}

/**
 * Returns the events of `kernel:move` with the parameters in a state: the actions the move spends, then the move or
 * the turn of the unit.
 *
 * @throws {TypeError} If the unit is not in the battle or a number of actions is not a whole number from 0.
 */
export function moveStepEvents(state: BattleState, params: MoveParams): readonly EventDraft[] {
  const unit = battleUnit(state, params.unit);

  return [...spentEvents(unit, params.spent), ...moveEvents(unit, params)];
}

function moveEvents(unit: Unit, params: MoveParams): readonly EventDraft[] {
  const { facing, path } = params;

  if (path.length > 0) {
    const moved = { path, unit: unit.id, ...(facing === undefined ? {} : { facing }) };

    return [kernelEventDraft(KERNEL_EVENTS.unitMoved, moved, unit.visibleTo)];
  }

  if (facing === undefined || facing === unit.facing) return [];

  return [kernelEventDraft(KERNEL_EVENTS.unitTurned, { facing, unit: unit.id }, unit.visibleTo)];
}
