import {
  applicationDraft,
  battleUnit,
  KERNEL_MECHANICS,
  spendActionsDraft,
  sideSees,
  standsOnField,
  type AttackRequest,
  type AttackVariant,
  type CommandPlan,
  type DefenseVariant,
  type MechanicContext,
  type SideId,
  type Unit,
  type UnitId,
} from '@heroes2dgame/kernel';
import { hasLeft } from './attack-damage.ts';
import { braceSchema, stackSchema, type BraceParams, type StackParams } from './attack-params.ts';
import { spentResource, strikeDraft } from './attack-steps.ts';
import { nextTo } from './helpers.ts';
import { RULES_STDLIB_NAMES, RULES_STDLIB_REASONS } from './names.ts';

export type {
  BonusParams,
  BraceParams,
  DamageParams,
  LuckParams,
  RetaliationParams,
  ShotParams,
  StackParams,
} from './attack-params.ts';
export { ATTACK_STEPS } from './attack-steps.ts';

/**
 * The attack of stacks. A unit attacks an enemy next to it and shoots at an enemy while it has shots, an action of
 * the turn at a time; a shot spends one shot. A strike rolls the damage of every creature, at most `rolled` of them,
 * from the least to the greatest damage, and the sum grows in proportion for the rest. The difference of attack and
 * defense raises or lowers it by the bonuses up to their limits, a shot from afar and a unit with shots left in melee
 * lose the damage of the penalties, and luck, if the ruleset chooses it, raises or lowers what comes out. The damage
 * is at least 1, and every step is rounded as the ruleset says. A strike checks again that it reaches the target:
 * in melee the units stand next to each other, and a shot sees the target if the parameters ask for sight; otherwise
 * it does nothing. A damage beyond the safe integers rejects the command with `kernel:out-of-range` naming the unit
 * that strikes, but a strike back with such a damage is lost instead. A formula of an attribute or a tag that rejects
 * rejects the command too. A unit that was struck in melee and still stands next to the attacker strikes back once,
 * spending one strike back, and nobody strikes back at a strike back. Every strike gives `rules-stdlib:attacked`, seen
 * by the sides that see both units; the event of a strike back follows from the event of the strike. The rolls of
 * the damage and of luck are seen by the sides that see the unit that strikes.
 */
export const STACK_ATTACK: AttackVariant<StackParams> = Object.freeze({
  attack: planAttack,
  kind: 'mechanic',
  mechanic: KERNEL_MECHANICS.attack,
  name: RULES_STDLIB_NAMES.stacks,
  schema: stackSchema(),
  shoot: planShot,
});

/**
 * The defense that braces a unit: the unit gets the effect, and its turn ends.
 */
export const BRACE_DEFENSE: DefenseVariant<BraceParams> = Object.freeze({
  defend: ({ params }: MechanicContext<BraceParams>, unit: UnitId) => ({
    endsTurn: true,
    kind: 'steps',
    steps: [applicationDraft({ effect: params.effect, holder: { kind: 'unit', unit } })],
  }),
  kind: 'mechanic',
  mechanic: KERNEL_MECHANICS.defense,
  name: RULES_STDLIB_NAMES.brace,
  schema: braceSchema(),
} satisfies DefenseVariant<BraceParams>);

function planAttack(
  { field, params, state }: MechanicContext<StackParams>,
  { target, unit }: AttackRequest,
): CommandPlan {
  if (battleUnit(state, unit).side === battleUnit(state, target).side) {
    return { kind: 'reject', reason: RULES_STDLIB_REASONS.notAnEnemy };
  }

  if (!nextTo(field, unit, target)) return { kind: 'reject', reason: RULES_STDLIB_REASONS.notAdjacent };

  return { kind: 'steps', steps: [spendAction(unit, params), strikeDraft(unit, target, 'melee')] };
}

function planShot(
  { content, field, params, state }: MechanicContext<StackParams>,
  { target, unit }: AttackRequest,
): CommandPlan {
  const { shots } = params;
  const attacker = battleUnit(state, unit);

  if (shots === undefined || !hasLeft(content, attacker, shots.resource)) {
    return { kind: 'reject', reason: RULES_STDLIB_REASONS.noShots };
  }

  if (attacker.side === battleUnit(state, target).side) {
    return { kind: 'reject', reason: RULES_STDLIB_REASONS.notAnEnemy };
  }

  if (shots.nearby && state.units.some((other) => other.side !== attacker.side && seenBy(other, attacker.side)
    && nextTo(field, unit, other.id))) {
    return { kind: 'reject', reason: RULES_STDLIB_REASONS.enemyNearby };
  }

  if (shots.sight && !field.sees(field.cellsOf(unit), field.cellsOf(target))) {
    return { kind: 'reject', reason: RULES_STDLIB_REASONS.outOfSight };
  }

  return {
    kind: 'steps',
    steps: [spendAction(unit, params), ...spentResource(unit, shots.resource), strikeDraft(unit, target, 'shot')],
  };
}

function spendAction(unit: UnitId, { action }: StackParams): ReturnType<typeof spendActionsDraft> {
  return spendActionsDraft({ spent: { [action]: 1 }, unit });
}

function seenBy(unit: Unit, side: SideId): boolean {
  return standsOnField(unit) && sideSees(side, unit.visibleTo);
}
