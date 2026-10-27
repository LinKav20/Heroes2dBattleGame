import { applyEventOfKind, KERNEL_EVENT_KINDS } from '../events/index.ts';
import type { AttackRequest, AttackVariant } from '../extensions/index.ts';
import { sideSees } from '../ids/index.ts';
import {
  findUnit,
  forbidden,
  REJECTION_REASONS,
  standsOnField,
  TARGET_PROBLEMS,
  turnRejection,
  type AttackCommand,
  type BattleState,
  type Forbidden,
  type ShootCommand,
  type Unit,
} from '../model/index.ts';
import { moveDraft } from './drafts.ts';
import { attackOf, mechanicContext, type ChosenVariant } from './mechanics.ts';
import { moveStepEvents, plannedMove } from './movement.ts';
import type { MoveParams } from './params.ts';
import { packagePlan, planContext, type BattlePlan, type PlanContext } from './plan-context.ts';

interface CheckedAttack<Plan> {
  readonly kind: 'checked';
  readonly plan: Plan;
  readonly variant: ChosenVariant<AttackVariant>;
  readonly unit: Unit;
  readonly request: AttackRequest;
}

/**
 * Checks a command that a unit attacks another one and plans it with the attack of the ruleset. The battle must be in
 * a turn, the ruleset must choose an attack, the unit or its side must have the turn, the unit must stand on the field,
 * and the target must be another unit of the battle that the side of the unit sees, alive and standing on the field; a
 * target the side does not see is rejected as a unit that is not in the battle. A direction without a cell
 * to attack from is invalid. A cell to attack from is checked as the command `move` checks it, and a rejection names
 * the field `from`, unless the unit already stands there facing that way. The move before the strike spends only the
 * actions that count the cost of movement, not the actions of the turn that every move spends, because the approach
 * and the strike are one action. The move runs before the steps of the attack, and the attack is planned in the state
 * after the events of the move, with the path in the request.
 *
 * @throws {TypeError} If no package declares the attack, it returns an unknown plan, forbids the command with a reason
 * that `packageRejection` does not allow or plans a step that only the kernel adds, or planning the move needs a roll.
 */
export function planAttack(context: PlanContext, command: AttackCommand): BattlePlan {
  const checked = checkedAttack(context, command, (variant) => variant.attack.bind(variant));

  if (checked.kind === 'forbidden') return checked;

  const { plan, unit, variant: { params, variant } } = checked;
  const { facing, from } = command;

  if (from === undefined && facing !== undefined) {
    return forbidden(REJECTION_REASONS.invalidCommand, { field: 'facing' });
  }

  if (from === undefined || (from === unit.cell && (facing === undefined || facing === unit.facing))) {
    return packagePlan(variant.name, plan(mechanicContext(context, params), checked.request));
  }

  const move = plannedMove(context, {
    kind: 'game',
    to: from,
    type: 'move',
    unit: unit.id,
    ...(facing === undefined ? {} : { facing }),
  }, { actions: false, field: 'from' });

  if (move.kind !== 'value') return move;

  const moved = planContext(context.setup, movedState(context.state, move.value));
  const request = { ...checked.request, path: move.value.path };
  const planned = packagePlan(variant.name, plan(mechanicContext(moved, params), request));

  return planned.kind === 'steps' ? { ...planned, steps: [moveDraft(move.value), ...planned.steps] } : planned;
}

/**
 * Checks a command that a unit shoots at another one and plans it with the attack of the ruleset, after the same
 * checks as of the command `attack`. The attack must let units shoot.
 *
 * @throws {TypeError} If no package declares the attack, or it returns an unknown plan, forbids the command with a
 * reason that `packageRejection` does not allow or plans a step that only the kernel adds.
 */
export function planShoot(context: PlanContext, command: ShootCommand): BattlePlan {
  const checked = checkedAttack(context, command, (variant) => variant.shoot?.bind(variant));

  if (checked.kind === 'forbidden') return checked;

  const { plan, request, variant: { params, variant } } = checked;

  return packagePlan(variant.name, plan(mechanicContext(context, params), request));
}

const KERNEL_KINDS = new Map(KERNEL_EVENT_KINDS.map((kind) => [kind.name, kind]));

function checkedAttack<Plan>(
  context: PlanContext,
  command: AttackCommand | ShootCommand,
  pick: (variant: AttackVariant) => Plan | undefined,
): CheckedAttack<Plan> | Forbidden {
  const { mechanics, state } = context;
  const unit = findUnit(state, command.unit);

  if (unit === undefined) return forbidden(REJECTION_REASONS.invalidCommand, { field: 'unit' });

  const target = findUnit(state, command.target);

  const unseen = target !== undefined && !sideSees(unit.side, target.visibleTo);

  if (target === undefined || target.id === unit.id || unseen) {
    return forbidden(REJECTION_REASONS.invalidCommand, { field: 'target' });
  }

  if (state.phase.kind !== 'turn') return forbidden(REJECTION_REASONS.wrongPhase);

  const variant = attackOf(mechanics, state.ruleset);
  const plan = variant === undefined ? undefined : pick(variant.variant);

  if (variant === undefined || plan === undefined) return forbidden(REJECTION_REASONS.notAvailable);

  const turn = turnRejection(state, { kind: 'unit', unit: unit.id });

  if (turn !== undefined) return turn;

  if (!standsOnField(unit)) return forbidden(REJECTION_REASONS.notOnField, { unit: unit.id });

  if (target.count === 0) {
    return forbidden(REJECTION_REASONS.invalidTargets, { problem: TARGET_PROBLEMS.dead, target: 0 });
  }

  if (!standsOnField(target)) {
    return forbidden(REJECTION_REASONS.invalidTargets, { problem: TARGET_PROBLEMS.offField, target: 0 });
  }

  return { kind: 'checked', plan, request: { target: target.id, unit: unit.id }, unit, variant };
}

function movedState(state: BattleState, move: MoveParams): BattleState {
  return moveStepEvents(state, move).reduce((current, { payload, type, visibleTo }, id) => {
    const kind = KERNEL_KINDS.get(type);

    if (kind === undefined) throw new TypeError(`The kernel has no kind of event ${JSON.stringify(type)}.`);

    return applyEventOfKind(kind, current, { id, payload, type, version: kind.version, visibleTo });
  }, state);
}
