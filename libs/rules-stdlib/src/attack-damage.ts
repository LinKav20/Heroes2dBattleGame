import {
  ContentError,
  creatureDefinition,
  MAX_DIE_SIDES,
  REJECTION_REASONS,
  type ContentName,
  type ContentRegistry,
  type EvaluatedValue,
  type Evaluation,
  type Expressions,
  type Rounding,
  type StepContext,
  type Unit,
} from '@heroes2dgame/kernel';
import { DEFAULT_ROLLED, type BonusParams, type StackParams } from './attack-params.ts';
import { chanceHit, chanceNeed, chosenChance } from './chances.ts';
import type { AttackedPayload } from './events.ts';
import { taggedWith } from './helpers.ts';
import { RULES_STDLIB_MECHANICS, RULES_STDLIB_NAMES } from './names.ts';

/**
 * The damage of a strike before it is checked against the safe integers, and the luck that changed it.
 */
export interface StrikeDamage {
  /** The damage as counted; the strike deals at least 1. */
  readonly damage: bigint;
  /** Whether luck raised or lowered the damage, if it did. */
  readonly luck?: 'bad' | 'good';
}

interface StrikeAttributes {
  readonly least: number;
  readonly greatest: number;
  readonly attack: number;
  readonly defense: number;
}

interface LuckRoll {
  readonly kind: 'bad' | 'good';
  readonly percent: number;
}

/**
 * Counts the damage of a strike of the attack of stacks: the rolled damage of the creatures, grown in proportion for
 * a bigger stack, changed by the difference of attack and defense, by the penalties of shots and by luck. It asks for
 * the roll of the damage first and the roll of luck second, and rejects with `kernel:out-of-range` if a formula of an
 * attribute or a tag does, or if the damage spreads over `MAX_DIE_SIDES` or more.
 */
export function strikeDamage(
  context: StepContext,
  rules: StackParams,
  attacker: Unit,
  target: Unit,
  kind: AttackedPayload['kind'],
): Evaluation<StrikeDamage> {
  const { expressions, state } = context;
  const read = strikeAttributes(expressions, rules, attacker, target);

  if (read.kind !== 'value') return read;

  const { attack, defense, greatest, least } = read.value;
  const rolled = Math.min(attacker.count, rules.damage.rolled ?? DEFAULT_ROLLED);
  const base = rolledDamage(context, rules, attacker, rolled, least, greatest);

  if (base.kind !== 'value') return base;

  const luck = luckOf(context, rules, attacker, greatest > least ? 1 : 0);

  if (luck.kind !== 'value') return luck;

  const penalty = penalties(context, rules, attacker, target, kind);

  if (penalty.kind !== 'value') return penalty;

  const { rounding } = state.ruleset;
  const scaled = attacker.count > rolled
    ? divided(base.value * BigInt(attacker.count), BigInt(rolled), rounding)
    : base.value;
  const percents = [...penalty.value, ...(luck.value === undefined ? [] : [luck.value.percent])];
  const damage = percents.reduce(
    (value, percent) => divided(value * BigInt(percent), 100n, rounding),
    divided(scaled * bonusFactor(rules.bonus, BigInt(attack) - BigInt(defense)), 1000n, rounding),
  );

  return valueOf({ damage, ...(luck.value === undefined ? {} : { luck: luck.value.kind }) });
}

/**
 * Tells whether a unit has a resource and at least 1 of it left.
 */
export function hasLeft(content: ContentRegistry, unit: Unit, resource: ContentName): boolean {
  return Object.hasOwn(creatureDefinition(content, unit.creature).resources, resource)
    && (unit.resources[resource] ?? 0) > 0;
}

function strikeAttributes(
  expressions: Expressions,
  rules: StackParams,
  attacker: Unit,
  target: Unit,
): Evaluation<StrikeAttributes> {
  const least = expressions.attribute({ kind: 'unit', unit: attacker.id }, rules.damage.min);

  if (least.kind !== 'value') return least;

  const greatest = expressions.attribute({ kind: 'unit', unit: attacker.id }, rules.damage.max);

  if (greatest.kind !== 'value') return greatest;

  const attack = expressions.attribute({ kind: 'unit', unit: attacker.id }, rules.attack);

  if (attack.kind !== 'value') return attack;

  const defense = expressions.attribute({ kind: 'unit', unit: target.id }, rules.defense);

  if (defense.kind !== 'value') return defense;

  return valueOf({ attack: attack.value, defense: defense.value, greatest: greatest.value, least: least.value });
}

function rolledDamage(
  context: StepContext,
  rules: StackParams,
  attacker: Unit,
  rolled: number,
  least: number,
  greatest: number,
): Evaluation<bigint> {
  if (greatest <= least) return valueOf(BigInt(rolled) * BigInt(least));

  if (greatest - least >= MAX_DIE_SIDES) {
    return {
      kind: 'reject',
      params: { attribute: rules.damage.max, unit: attacker.id },
      reason: REJECTION_REASONS.outOfRange,
    };
  }

  const roll = context.inputs[0];

  if (roll?.kind !== 'roll') {
    return {
      kind: 'need',
      need: {
        count: rolled,
        kind: 'roll',
        name: rules.damage.roll,
        side: attacker.side,
        sides: greatest - least + 1,
        unit: attacker.id,
        visibleTo: attacker.visibleTo,
      },
    };
  }

  return valueOf(BigInt(roll.result) + BigInt(rolled) * BigInt(least - 1));
}

function luckOf(
  context: StepContext,
  rules: StackParams,
  attacker: Unit,
  input: number,
): Evaluation<LuckRoll | undefined> {
  if (rules.luck === undefined) return valueOf(undefined);

  const luck = chosenChance(context.mechanic(RULES_STDLIB_MECHANICS.luck));
  const found = luck?.variant.chance(luck.context, attacker);

  if (found !== undefined && found.kind !== 'value') return found;

  const chance = found?.value;

  if (chance === undefined) return valueOf(undefined);

  const roll = context.inputs[input];

  if (roll === undefined) return { kind: 'need', need: chanceNeed(chance, attacker) };

  return valueOf(chanceHit(chance, roll) ? { kind: chance.kind, percent: rules.luck[chance.kind] } : undefined);
}

function penalties(
  context: StepContext,
  rules: StackParams,
  attacker: Unit,
  target: Unit,
  kind: AttackedPayload['kind'],
): Evaluation<readonly number[]> {
  const { content, expressions, field } = context;
  const { shots } = rules;

  if (shots === undefined) return valueOf([]);

  const sharp = taggedWith(expressions, attacker, shots.noPenalty ?? [], RULES_STDLIB_NAMES.strike);

  if (sharp.kind !== 'value') return sharp;

  if (sharp.value) return valueOf([]);

  if (kind !== 'shot') return valueOf(hasLeft(content, attacker, shots.resource) ? [shots.meleePercent] : []);

  const distance = field.distanceBetween(field.cellsOf(attacker.id), field.cellsOf(target.id));

  return valueOf(distance !== undefined && distance > shots.far ? [shots.farPercent] : []);
}

function divided(value: bigint, divisor: bigint, rounding: Rounding): bigint {
  switch (rounding) {
    case 'down': {
      return floorDivide(value, divisor);
    }

    case 'up': {
      return -floorDivide(-value, divisor);
    }

    case 'nearest': {
      return floorDivide(2n * value + divisor, 2n * divisor);
    }

    default: {
      throw new ContentError(`The ruleset has an unknown rounding ${JSON.stringify(rounding)}.`);
    }
  }
}

function bonusFactor(bonus: BonusParams, difference: bigint): bigint {
  if (difference >= 0n) {
    const rise = difference * BigInt(bonus.attack);

    return 1000n + (rise < BigInt(bonus.attackMax) ? rise : BigInt(bonus.attackMax));
  }

  const fall = -difference * BigInt(bonus.defense);

  return 1000n - (fall < BigInt(bonus.defenseMax) ? fall : BigInt(bonus.defenseMax));
}

function floorDivide(value: bigint, divisor: bigint): bigint {
  const truncated = value / divisor;

  return value % divisor < 0n ? truncated - 1n : truncated;
}

function valueOf<Value>(value: Value): EvaluatedValue<Value> {
  return { kind: 'value', value };
}
