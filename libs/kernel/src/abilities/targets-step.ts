import { abilityDefinition, ContentError, type Ability, type AreaRule } from '../content/index.ts';
import { evaluated } from '../expressions/index.ts';
import type { Evaluation, StepContext, StepDraft, StepKind, StepResult, Subjects } from '../extensions/index.ts';
import type { UnitId } from '../ids/index.ts';
import { findUnit, userTarget, type Target } from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { DONE, operationDrafts } from '../operations/index.ts';
import { isDirected } from './definitions.ts';
import { abilityTargetsDraft } from './drafts.ts';
import type { AbilityTargetsParams } from './params.ts';

/**
 * Runs the operations of an ability for one target and goes on with the next one in a step of its own kind, so the
 * stack holds the operations of one target at a time and every target is taken when its turn comes, after the
 * reactions to the use. In the operations `self` is the user and `target` is the target. An ability without targets
 * runs them once, and an ability for itself runs them with the user as `target`. A unit as a target that is no longer
 * alive is passed over. An ability that targets an area takes the units in the area when the step first runs: the
 * units on the field with a cell in the area, in the order of units, that pass the filter of the ability; the area goes
 * from the cell of the user nearest to the chosen cell. A unit of the area that died or left the area before its turn
 * is passed over. Only the kernel puts the step on the stack.
 *
 * @throws {ContentError} If the content has no such ability, or the filter rolls dice.
 */
export const ABILITY_TARGETS_STEP: StepKind<AbilityTargetsParams> = Object.freeze({
  kind: 'step',
  migrations: [],
  name: KERNEL_STEPS.abilityTargets,
  run: runTargets,
  version: 1,
});

function runTargets(context: StepContext<AbilityTargetsParams>): StepResult {
  const { content, params } = context;
  const ability = abilityDefinition(content, params.ability);
  const self = userTarget(params.user);
  const { kind } = ability.target;

  if (kind === 'none' || kind === 'self') {
    const target = kind === 'self' ? self : undefined;

    if (params.next > 0 || !alive(context, target)) return DONE;

    return runFor(ability, target === undefined ? { self } : { self, target }, []);
  }

  if (kind !== 'area') return step(context, ability, params.targets);

  const units = params.units === undefined ? areaUnits(context, ability) : evaluated(params.units);

  if (units.kind !== 'value') return units;

  return step(context, ability, units.value.map((unit) => ({ kind: 'unit', unit }) as const), units.value);
}

function step(
  context: StepContext<AbilityTargetsParams>,
  ability: Ability,
  targets: readonly Target[],
  units?: readonly UnitId[],
): StepResult {
  const { params } = context;
  const self = userTarget(params.user);
  const area = units === undefined ? undefined : new Set(areaCells(context, ability));
  const rest = { ...params, next: params.next + 1, ...(units === undefined ? {} : { units }) };
  const next = params.next + 1 < targets.length ? [abilityTargetsDraft(rest)] : [];
  const target = targets[params.next];

  if (target === undefined) return DONE;

  const left = area !== undefined && target.kind === 'unit'
    && !context.field.cellsOf(target.unit).some((cell) => area.has(cell));
  const passed = !alive(context, target) || left;

  return passed ? { events: [], kind: 'done', steps: next } : runFor(ability, { self, target }, next);
}

function runFor(ability: Ability, subjects: Subjects, next: readonly StepDraft[]): StepResult {
  return { events: [], kind: 'done', steps: [...operationDrafts(ability.ops, { subjects }), ...next] };
}

function areaUnits(context: StepContext<AbilityTargetsParams>, ability: Ability): Evaluation<readonly UnitId[]> {
  const { expressions, field } = context;
  const { filter } = ability.target;
  const self = userTarget(context.params.user);
  const settled = expressions.within({ rolls: false });
  const chosen: UnitId[] = [];

  for (const unit of field.unitsTouching(areaCells(context, ability))) {
    const target = { kind: 'unit', unit } as const;
    const holds = filter === undefined ? evaluated(true) : settled.test(filter, { self, target });

    if (holds.kind !== 'value') return holds;

    if (holds.value) chosen.push(unit);
  }

  return evaluated(chosen);
}

function areaCells(context: StepContext<AbilityTargetsParams>, ability: Ability): readonly string[] {
  const { field, params } = context;
  const area = areaOf(ability);
  const from = params.user.kind === 'unit' ? field.cellsOf(params.user.unit) : [];

  return params.targets.flatMap((target) => {
    if (target.kind !== 'cell') return [];

    const origin = isDirected(area) ? field.nearestCell(from, target.cell) : undefined;

    return field.area(area, target.cell, origin);
  });
}

function areaOf(ability: Ability): AreaRule {
  const { area } = ability.target;

  if (area === undefined) {
    throw new ContentError(`The ability ${JSON.stringify(ability.name)} targets an area, but has none.`, {
      definition: ability.name,
    });
  }

  return area;
}

function alive(context: StepContext<AbilityTargetsParams>, target: Target | undefined): boolean {
  if (target?.kind !== 'unit') return true;

  return (findUnit(context.state, target.unit)?.count ?? 0) > 0;
}
