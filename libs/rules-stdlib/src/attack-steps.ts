import {
  DONE,
  findUnit,
  KERNEL_MECHANICS,
  KERNEL_OPERATIONS,
  operationDrafts,
  REJECTION_REASONS,
  standsOnField,
  visibleToBoth,
  type ChosenMechanic,
  type ContentName,
  type FieldGeometry,
  type StepContext,
  type StepDraft,
  type StepKind,
  type StepResult,
  type Unit,
  type UnitId,
} from '@heroes2dgame/kernel';
import { hasLeft, strikeDamage } from './attack-damage.ts';
import type { StackParams } from './attack-params.ts';
import type { AttackedPayload } from './events.ts';
import { nextTo, stepKind, taggedWith } from './helpers.ts';
import { RULES_STDLIB_NAMES } from './names.ts';

/**
 * The parameters of `rules-stdlib:strike`: who strikes whom and how.
 */
export interface StrikeParams {
  /** The unit that strikes. */
  readonly attacker: UnitId;
  /** The unit it strikes. */
  readonly target: UnitId;
  /** How it strikes. */
  readonly kind: AttackedPayload['kind'];
}

interface RetaliateParams {
  readonly unit: UnitId;
  readonly target: UnitId;
}

/**
 * The steps of the attack of stacks: a strike and a strike back.
 */
export const ATTACK_STEPS: readonly StepKind[] = Object.freeze([
  stepKind(RULES_STDLIB_NAMES.strike, strike),
  stepKind(RULES_STDLIB_NAMES.retaliate, retaliate),
]);

/**
 * Returns the step of a strike.
 */
export function strikeDraft(attacker: UnitId, target: UnitId, kind: AttackedPayload['kind']): StepDraft<StrikeParams> {
  return { params: { attacker, kind, target }, type: RULES_STDLIB_NAMES.strike };
}

/**
 * Returns the steps with which a unit spends 1 of a resource.
 */
export function spentResource(unit: UnitId, resource: ContentName): readonly StepDraft[] {
  return operationDrafts([{ amount: -1, resource, to: 'self', type: KERNEL_OPERATIONS.changeResource }], {
    subjects: { self: { kind: 'unit', unit } },
  });
}

function strike(context: StepContext<StrikeParams>): StepResult {
  const { field, mechanic, params, state } = context;
  const rules = stackRules(mechanic(KERNEL_MECHANICS.attack));
  const attacker = findUnit(state, params.attacker);
  const target = findUnit(state, params.target);

  if (attacker === undefined || target === undefined || !reaches(field, rules, attacker, target, params.kind)) {
    return DONE;
  }

  const counted = strikeDamage(context, rules, attacker, target, params.kind);

  if (counted.kind !== 'value') return counted;

  const { damage, luck } = counted.value;

  if (damage > BigInt(Number.MAX_SAFE_INTEGER)) {
    return params.kind === 'retaliation'
      ? DONE
      : { kind: 'reject', params: { unit: attacker.id }, reason: REJECTION_REASONS.outOfRange };
  }

  const payload: AttackedPayload = {
    attacker: attacker.id,
    damage: Math.max(1, Number(damage)),
    kind: params.kind,
    target: target.id,
    ...(luck === undefined ? {} : { luck }),
  };
  const hit = operationDrafts([{ amount: payload.damage, to: 'target', type: KERNEL_OPERATIONS.damage }], {
    subjects: { self: { kind: 'unit', unit: attacker.id }, target: { kind: 'unit', unit: target.id } },
  });
  const back: readonly StepDraft[] = params.kind === 'melee' && rules.retaliation !== undefined
    ? [{ params: { target: attacker.id, unit: target.id }, type: RULES_STDLIB_NAMES.retaliate }]
    : [];
  const visibleTo = visibleToBoth(attacker.visibleTo, target.visibleTo);
  const event = { payload, type: RULES_STDLIB_NAMES.attacked, visibleTo };

  return { events: [event], kind: 'done', steps: [...hit, ...back] };
}

function retaliate(context: StepContext<RetaliateParams>): StepResult {
  const { content, expressions, field, mechanic, params, state } = context;
  const back = stackRules(mechanic(KERNEL_MECHANICS.attack)).retaliation;
  const unit = findUnit(state, params.unit);
  const target = findUnit(state, params.target);

  if (back === undefined || unit === undefined || target === undefined || !nextTo(field, unit.id, target.id)) {
    return DONE;
  }

  if (!hasLeft(content, unit, back.resource)) return DONE;

  const blocked = taggedWith(expressions, target, back.blockedBy ?? [], RULES_STDLIB_NAMES.retaliate);

  if (blocked.kind !== 'value') return blocked;

  if (blocked.value) return DONE;

  const steps = [...spentResource(unit.id, back.resource), strikeDraft(unit.id, target.id, 'retaliation')];

  return { events: [], kind: 'done', steps };
}

function reaches(
  field: FieldGeometry,
  rules: StackParams,
  attacker: Unit,
  target: Unit,
  kind: AttackedPayload['kind'],
): boolean {
  if (!standsOnField(attacker) || !standsOnField(target)) return false;

  if (kind !== 'shot') return nextTo(field, attacker.id, target.id);

  return rules.shots?.sight !== true || field.sees(field.cellsOf(attacker.id), field.cellsOf(target.id));
}

function stackRules(chosen: ChosenMechanic | undefined): StackParams {
  if (chosen?.variant.name !== RULES_STDLIB_NAMES.stacks) {
    throw new TypeError(`The steps of ${RULES_STDLIB_NAMES.stacks} need it as the attack of the ruleset.`);
  }

  return chosen.context.params as StackParams;
}
