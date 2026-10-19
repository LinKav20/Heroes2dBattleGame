import { scenarioDefinition } from '../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { FieldGeometry, StepContext, StepKind } from '../extensions/index.ts';
import { VISIBLE_TO_ALL, type CellId } from '../ids/index.ts';
import {
  battleUnit,
  findSide,
  findUnit,
  forbidden,
  REJECTION_REASONS,
  type FinishDeploymentCommand,
  type Forbidden,
  type PlaceUnitCommand,
} from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { kernelStep } from '../operations/index.ts';
import { fitsZone, fixedUnits, scenarioSide } from './deployment-zones.ts';
import { battleStartDraft, deploymentEndDraft, unitPlaceDraft } from './drafts.ts';
import type { DeploymentEndParams, UnitPlaceParams } from './params.ts';
import { plannedSteps, type BattlePlan, type PlanContext } from './plan-context.ts';

/**
 * Places a unit during deployment with `kernel:unit-placed`, which only the side of the unit sees until the battle
 * starts. Only the kernel puts the step on the stack, after the command has checked the cell.
 *
 * @throws {TypeError} If the unit is not in the battle.
 */
export const UNIT_PLACE_STEP: StepKind<UnitPlaceParams> = kernelStep(
  KERNEL_STEPS.unitPlace,
  ({ params, state }: StepContext<UnitPlaceParams>) => ({
    events: [kernelEventDraft(KERNEL_EVENTS.unitPlaced, params, [battleUnit(state, params.unit).side])],
    kind: 'done',
  }),
);

/**
 * Finishes the deployment of the side that deploys now: the next side deploys, or the battle starts when every side
 * has finished. Only the kernel puts the step on the stack.
 */
export const DEPLOYMENT_END_STEP: StepKind<DeploymentEndParams> = kernelStep(
  KERNEL_STEPS.deploymentEnd,
  ({ params, state }: StepContext<DeploymentEndParams>) => {
    const { phase } = state;
    const pending = phase.kind === 'deployment' ? phase.pending.filter((side) => side !== params.side) : [];
    const event = kernelEventDraft(
      KERNEL_EVENTS.phaseChanged,
      { phase: { kind: 'deployment', pending }, round: state.round },
      VISIBLE_TO_ALL,
    );

    return { events: [event], kind: 'done', steps: pending.length === 0 ? [battleStartDraft()] : [] };
  },
);

/**
 * Checks a command to place a unit during deployment: the side of the unit deploys now, the scenario gives the unit
 * no cell, the unit is alive, the cell is on the field and the direction is one the field has, and the unit can stand
 * in the cell with all its cells in the deployment zone of its side. A unit may be placed again while its side
 * deploys.
 *
 * @throws {ContentError} If the content has no scenario of the battle.
 */
export function planPlaceUnit(context: PlanContext, command: PlaceUnitCommand): BattlePlan {
  const { content, field, state } = context;
  const { phase } = state;
  const unit = findUnit(state, command.unit);

  if (unit === undefined) return forbidden(REJECTION_REASONS.invalidCommand, { field: 'unit' });

  if (phase.kind !== 'deployment') return forbidden(REJECTION_REASONS.wrongPhase);

  if (phase.pending[0] !== unit.side) return forbidden(REJECTION_REASONS.notYourTurn);

  const scenario = scenarioDefinition(content, state.scenario);

  if (fixedUnits(scenario).has(unit.id)) return forbidden(REJECTION_REASONS.unitFixed, { unit: unit.id });

  if (unit.count === 0) return forbidden(REJECTION_REASONS.unitDead, { unit: unit.id });

  const { cell, facing } = command;
  const problem = placeProblem(field, cell, facing, 'cell');

  if (problem !== undefined) return problem;

  const zone = new Set(scenarioSide(scenario, unit.side)?.deploymentZone);

  if (!fitsZone(field, unit.id, cell, facing, zone)) return forbidden(REJECTION_REASONS.cannotStand, { cell });

  return plannedSteps([unitPlaceDraft({ cell, unit: unit.id, ...(facing === undefined ? {} : { facing }) })]);
}

/**
 * Checks a command that a side has finished deployment: the side deploys now and has placed every unit with creatures
 * left.
 */
export function planFinishDeployment(context: PlanContext, command: FinishDeploymentCommand): BattlePlan {
  const { state } = context;
  const { phase } = state;

  if (findSide(state, command.side) === undefined) {
    return forbidden(REJECTION_REASONS.invalidCommand, { field: 'side' });
  }

  if (phase.kind !== 'deployment') return forbidden(REJECTION_REASONS.wrongPhase);

  if (phase.pending[0] !== command.side) return forbidden(REJECTION_REASONS.notYourTurn);

  const units = state.units
    .filter((unit) => unit.side === command.side && unit.count > 0 && unit.cell === undefined)
    .map(({ id }) => id);

  if (units.length > 0) return forbidden(REJECTION_REASONS.unitsNotPlaced, { units });

  return plannedSteps([deploymentEndDraft({ side: command.side })]);
}

/**
 * Checks a command to start a battle in which no side has units to deploy. The arbiter sends it as the first command
 * of such a battle.
 */
export function planStartBattle(context: PlanContext): BattlePlan {
  const { phase } = context.state;

  if (phase.kind !== 'deployment' || phase.pending.length > 0) return forbidden(REJECTION_REASONS.wrongPhase);

  return plannedSteps([battleStartDraft()]);
}

/**
 * Returns why a command that names a cell and a direction is invalid: the cell is not on the field, or the field has
 * no such direction; nothing if both are right. `name` is the field of the command with the cell.
 */
export function placeProblem(
  field: FieldGeometry,
  cell: CellId,
  facing: string | undefined,
  name: 'cell' | 'to',
): Forbidden | undefined {
  if (!field.hasCell(cell)) return forbidden(REJECTION_REASONS.invalidCommand, { field: name });

  if (facing !== undefined && !field.directions.includes(facing)) {
    return forbidden(REJECTION_REASONS.invalidCommand, { field: 'facing' });
  }

  return undefined;
}
