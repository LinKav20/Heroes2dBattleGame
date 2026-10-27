import { creatureDefinition, scenarioDefinition } from '../content/index.ts';
import { applicationDraft, areaRefreshDraft, effectsOf, refreshDraft, removalDraft } from '../effects/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { StepContext, StepDraft, StepKind, StepRejects } from '../extensions/index.ts';
import type { JsonObject } from '../json/index.ts';
import {
  battleUnit,
  findSide,
  findUnit,
  forbidden,
  REJECTION_REASONS,
  turnHolderOf,
  type ApplyEffectEdit,
  type BattleState,
  type Forbidden,
  type MoveUnitEdit,
  type RemoveEffectEdit,
  type SetHealthEdit,
  type SetResourceEdit,
  type SideHolder,
  type StateEdit,
  type UnitHolder,
} from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { DONE, kernelStep } from '../operations/index.ts';
import { placeProblem } from './deployment.ts';
import { moveDraft, outcomeCheckDraft, turnCheckDraft } from './drafts.ts';
import { settled, type PlanContext } from './plan-context.ts';

/**
 * The steps of a state edit: the steps of the change, which nothing reacts to and an abort drops; the tail, which
 * brings auras, zones and the marks of activity of effects up to date, which nothing reacts to either and which runs
 * even after an abort; and then the checks that the battle runs after it: the outcomes and the end of the turn.
 */
export interface PlannedEdit {
  /** The kind of plan. */
  readonly kind: 'steps';
  /** The steps of the change, in the order they run. */
  readonly steps: readonly StepDraft[];
  /** The refresh of auras and zones, except during deployment, and of the marks of activity of effects. */
  readonly tail: readonly StepDraft[];
  /** The checks of the course of the battle after the change, in the order they run. */
  readonly checks: readonly StepDraft[];
}

interface Change {
  readonly kind: 'steps';
  readonly steps: readonly StepDraft[];
}

type EditPlanner<Edit extends StateEdit> = (context: PlanContext, edit: Edit) => Change | Forbidden | StepRejects;

type EditPlanners = { readonly [Type in StateEdit['type']]: EditPlanner<Extract<StateEdit, { readonly type: Type }>> };

/**
 * Sets the number of creatures and the health of a unit, or a resource of a unit, as a state edit tells. Only the
 * kernel puts the step on the stack, after the command has checked the edit.
 */
export const STATE_EDIT_STEP: StepKind<JsonObject> = kernelStep(KERNEL_STEPS.stateEdit, setValues);

/**
 * Checks a state edit and plans it. The edit bypasses the rules of the game, and the kernel checks only that the state
 * stays consistent:
 * - `set-health` needs a unit of the battle, a number of creatures from 0 to the number it started with, and health 0
 *   for no creatures or from 1 to the full health of one creature otherwise; a dead unit comes back only if it has a
 *   cell and can stand there;
 * - `set-resource` needs a resource the creature has and a value from 0 to its limit;
 * - `apply-effect` needs a unit or a side of the battle and an effect of the content, and applies the effect as an
 *   operation does: immunity, stacking and the operations of the effect when it is applied;
 * - `remove-effect` needs an applied effect of the unit or the side and removes it as the end of the effect does;
 * - `move-unit` needs a living unit on the field, a cell of the field and a direction the field has, and a cell where
 *   the unit can stand; it puts the unit there at once, and an edit that neither moves the unit nor turns it is
 *   invalid.
 *
 * After the change the kernel brings auras and zones up to date, except during deployment, and the marks of activity
 * of effects, even if the rest of the edit is aborted after an input request; then it checks the outcomes and the end
 * of the turn, except during deployment. Effects do not react to the events of the change and of these refreshes, and
 * scenario triggers do not wait for them, so an edit starts no chain of reactions; what the checks do, such as the end
 * of the turn and the next turn, goes as usual.
 */
export function planEdit(context: PlanContext, edit: StateEdit): Forbidden | PlannedEdit | StepRejects {
  const change = changeOf(context, edit);

  if (change.kind !== 'steps') return change;

  return { checks: checksAfter(context), kind: 'steps', steps: change.steps, tail: tailAfter(context.state) };
}

const EDIT_PLANNERS: EditPlanners = {
  'apply-effect': applyEffect,
  'move-unit': moveUnit,
  'remove-effect': removeEffect,
  'set-health': setHealth,
  'set-resource': setResource,
};

function changeOf(context: PlanContext, edit: StateEdit): Change | Forbidden | StepRejects {
  const planner = EDIT_PLANNERS[edit.type] as EditPlanner<StateEdit> | undefined;

  if (planner === undefined) return forbidden(REJECTION_REASONS.invalidCommand, { field: 'type' });

  return planner(context, edit);
}

function setHealth(context: PlanContext, edit: SetHealthEdit): Change | Forbidden | StepRejects {
  const { expressions, field, state } = context;
  const unit = findUnit(state, edit.unit);

  if (unit === undefined) return forbidden(REJECTION_REASONS.invalidCommand, { field: 'unit' });

  const { count, health } = edit;

  if (!Number.isSafeInteger(count) || count < 0 || count > unit.startCount) {
    return forbidden(REJECTION_REASONS.invalidCommand, { field: 'count' });
  }

  const full = settled(expressions.attribute({ kind: 'unit', unit: unit.id }, state.ruleset.healthAttribute));

  if (full.kind !== 'value') return full;

  const fits = count === 0 ? health === 0 : Number.isSafeInteger(health) && health >= 1 && health <= full.value;

  if (!fits) return forbidden(REJECTION_REASONS.invalidCommand, { field: 'health' });

  if (unit.count === 0 && count > 0) {
    if (unit.cell === undefined) return forbidden(REJECTION_REASONS.notOnField, { unit: unit.id });

    if (!field.canStand(unit.id, unit.cell, unit.facing)) {
      return forbidden(REJECTION_REASONS.cannotStand, { cell: unit.cell });
    }
  }

  return { kind: 'steps', steps: [valuesDraft(edit)] };
}

function setResource(context: PlanContext, edit: SetResourceEdit): Change | Forbidden | StepRejects {
  const { content, expressions, state } = context;
  const unit = findUnit(state, edit.unit);

  if (unit === undefined) return forbidden(REJECTION_REASONS.invalidCommand, { field: 'unit' });

  const { resources } = creatureDefinition(content, unit.creature);
  const rule = Object.hasOwn(resources, edit.resource) ? resources[edit.resource] : undefined;

  if (rule === undefined) return forbidden(REJECTION_REASONS.invalidCommand, { field: 'resource' });

  const limit = settled(expressions.attribute({ kind: 'unit', unit: unit.id }, rule.limit));

  if (limit.kind !== 'value') return limit;

  if (!Number.isSafeInteger(edit.value) || edit.value < 0 || edit.value > Math.max(0, limit.value)) {
    return forbidden(REJECTION_REASONS.invalidCommand, { field: 'value' });
  }

  return { kind: 'steps', steps: [valuesDraft(edit)] };
}

function applyEffect({ content, state }: PlanContext, edit: ApplyEffectEdit): Change | Forbidden {
  if (!hasHolder(state, edit.target)) return forbidden(REJECTION_REASONS.invalidCommand, { field: 'target' });

  if (!Object.hasOwn(content.effects, edit.effect)) {
    return forbidden(REJECTION_REASONS.invalidCommand, { field: 'effect' });
  }

  const draft = applicationDraft({ effect: edit.effect, holder: edit.target, params: edit.params });

  return { kind: 'steps', steps: [draft] };
}

function removeEffect({ state }: PlanContext, edit: RemoveEffectEdit): Change | Forbidden {
  if (!hasHolder(state, edit.target)) return forbidden(REJECTION_REASONS.invalidCommand, { field: 'target' });

  if (!effectsOf(state, edit.target).some(({ id }) => id === edit.effect)) {
    return forbidden(REJECTION_REASONS.invalidCommand, { field: 'effect' });
  }

  return { kind: 'steps', steps: [removalDraft({ effect: edit.effect, holder: edit.target })] };
}

function moveUnit({ field, state }: PlanContext, edit: MoveUnitEdit): Change | Forbidden {
  const unit = findUnit(state, edit.unit);

  if (unit === undefined) return forbidden(REJECTION_REASONS.invalidCommand, { field: 'unit' });

  if (unit.count === 0) return forbidden(REJECTION_REASONS.unitDead, { unit: unit.id });

  if (unit.cell === undefined) return forbidden(REJECTION_REASONS.notOnField, { unit: unit.id });

  const { cell, facing } = edit;
  const problem = placeProblem(field, cell, facing, 'cell');

  if (problem !== undefined) return problem;

  if (cell === unit.cell && (facing === undefined || facing === unit.facing)) {
    return forbidden(REJECTION_REASONS.invalidCommand, { field: 'cell' });
  }

  if (!field.canStand(unit.id, cell, facing ?? unit.facing)) return forbidden(REJECTION_REASONS.cannotStand, { cell });

  const turned = facing === undefined || facing === unit.facing ? {} : { facing };
  const path = cell === unit.cell ? [] : [cell];

  return { kind: 'steps', steps: [moveDraft({ path, spent: {}, unit: unit.id, ...turned })] };
}

function checksAfter({ content, state }: PlanContext): readonly StepDraft[] {
  if (state.phase.kind === 'deployment') return [];

  const outcomes = scenarioDefinition(content, state.scenario).outcomes.length > 0 ? [outcomeCheckDraft()] : [];
  const holder = turnHolderOf(state.phase);

  return [...outcomes, ...(holder === undefined ? [] : [turnCheckDraft({ holder })])];
}

function tailAfter(state: BattleState): readonly StepDraft[] {
  return [...(state.phase.kind === 'deployment' ? [] : [areaRefreshDraft()]), refreshDraft()];
}

function setValues({ params, state }: StepContext<JsonObject>): ReturnType<StepKind['run']> {
  const edit: unknown = params;
  const values = edit as SetHealthEdit | SetResourceEdit;
  const unit = battleUnit(state, values.unit);

  if (values.type === 'set-health') {
    if (values.count === unit.count && values.health === unit.health) return DONE;

    const payload = { count: values.count, health: values.health, unit: unit.id };

    return { events: [kernelEventDraft(KERNEL_EVENTS.healthChanged, payload, unit.visibleTo)], kind: 'done' };
  }

  if ((unit.resources[values.resource] ?? 0) === values.value) return DONE;

  const payload = { resource: values.resource, unit: unit.id, value: values.value };

  return { events: [kernelEventDraft(KERNEL_EVENTS.resourceChanged, payload, unit.visibleTo)], kind: 'done' };
}

function valuesDraft(edit: SetHealthEdit | SetResourceEdit): StepDraft {
  const params: unknown = edit;

  return { params: params as JsonObject, type: KERNEL_STEPS.stateEdit };
}

function hasHolder(state: BattleState, holder: SideHolder | UnitHolder): boolean {
  if (holder.kind === 'unit') return findUnit(state, holder.unit) !== undefined;

  return findSide(state, holder.side) !== undefined;
}
