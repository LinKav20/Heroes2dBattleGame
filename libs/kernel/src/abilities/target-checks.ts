import type { Ability, TargetRule } from '../content/index.ts';
import type { Expressions, FieldGeometry } from '../extensions/index.ts';
import type { CellId } from '../ids/index.ts';
import {
  findSide,
  findUnit,
  REJECTION_REASONS,
  standsOnField,
  TARGET_PROBLEMS,
  targetKey,
  type BattleState,
  type SideTarget,
  type Target,
  type TargetProblem,
  type Unit,
  type UnitTarget,
} from '../model/index.ts';
import { forbidden, whenValue, type AbilityCheck } from './check-results.ts';
import { isDirected } from './definitions.ts';

/**
 * A unit or a side that uses an ability, as the checks of targets see it.
 */
export interface TargetUser {
  /** The user as a participant of formulas. */
  readonly target: SideTarget | UnitTarget;
  /** The unit, if the user is a unit. */
  readonly unit?: Unit;
}

/**
 * Checks the targets of an ability. An ability without targets gets none, and one with targets gets from 1 to their
 * number of different targets of its kind; a unit must be alive and a cell must be on the field. A unit and a cell
 * must be within the range from a cell of the user, if the ability has one, and an area that goes from the user needs
 * a user on the field. Each target must pass the filter with the user as `self` and the target as `target`; for an
 * area the filter applies to the units in it when the ability is used. A failed check names the problem and the place
 * of the target.
 *
 * @throws {ContentError} If the filter rolls dice.
 */
export function targetsCheck(
  state: BattleState,
  field: FieldGeometry,
  ability: Ability,
  user: TargetUser,
  targets: readonly Target[],
  expressions: Expressions,
): AbilityCheck | undefined {
  const rule = ability.target;
  const problem = countProblem(rule, targets);

  if (problem !== undefined) return invalid(ability, problem);

  const seen = new Set<string>();
  const needsCells = rule.range !== undefined || isDirected(rule.area);
  const from = needsCells && user.unit !== undefined ? field.cellsOf(user.unit.id) : [];

  for (const [index, target] of targets.entries()) {
    const key = targetKey(target);
    const found = seen.has(key) ? TARGET_PROBLEMS.duplicate : targetProblem(state, field, rule, target, from);

    seen.add(key);

    if (found !== undefined) return invalid(ability, found, index);
  }

  if (rule.kind === 'area' || rule.filter === undefined) return undefined;

  for (const [index, target] of targets.entries()) {
    const result = whenValue(expressions.test(rule.filter, { self: user.target, target }), (holds) =>
      (holds ? undefined : invalid(ability, TARGET_PROBLEMS.filter, index)));

    if (result !== undefined) return result;
  }

  return undefined;
}

function countProblem(rule: TargetRule, targets: readonly Target[]): TargetProblem | undefined {
  if (rule.kind === 'none' || rule.kind === 'self') return targets.length === 0 ? undefined : TARGET_PROBLEMS.count;

  return targets.length >= 1 && targets.length <= (rule.count ?? 1) ? undefined : TARGET_PROBLEMS.count;
}

function targetProblem(
  state: BattleState,
  field: FieldGeometry,
  rule: TargetRule,
  target: Target,
  from: readonly CellId[],
): TargetProblem | undefined {
  switch (target.kind) {
    case 'cell': {
      if (rule.kind !== 'cell' && rule.kind !== 'area') return TARGET_PROBLEMS.kind;

      if (!field.hasCell(target.cell)) return TARGET_PROBLEMS.offField;

      if (rule.kind === 'area' && isDirected(rule.area) && from.length === 0) return TARGET_PROBLEMS.range;

      return outOfRange(field, rule, from, [target.cell]) ? TARGET_PROBLEMS.range : undefined;
    }

    case 'side': {
      return rule.kind === 'side' && findSide(state, target.side) !== undefined ? undefined : TARGET_PROBLEMS.kind;
    }

    case 'unit': {
      const unit = findUnit(state, target.unit);

      if (rule.kind !== 'unit' || unit === undefined) return TARGET_PROBLEMS.kind;

      if (unit.count === 0) return TARGET_PROBLEMS.dead;

      if (!standsOnField(unit)) return TARGET_PROBLEMS.offField;

      if (rule.range === undefined) return undefined;

      return outOfRange(field, rule, from, field.cellsOf(unit.id)) ? TARGET_PROBLEMS.range : undefined;
    }

    default: {
      return TARGET_PROBLEMS.kind;
    }
  }
}

function outOfRange(field: FieldGeometry, rule: TargetRule, from: readonly CellId[], to: readonly CellId[]): boolean {
  if (rule.range === undefined) return false;

  const distance = field.distanceBetween(from, to);

  return distance === undefined || distance > rule.range;
}

function invalid(ability: Ability, problem: TargetProblem, target?: number): AbilityCheck {
  const place = target === undefined ? {} : { target };

  return forbidden(REJECTION_REASONS.invalidTargets, { ability: ability.name, problem, ...place });
}
