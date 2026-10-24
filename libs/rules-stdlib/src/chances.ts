import {
  MAX_DIE_SIDES,
  type ChosenMechanic,
  type ContentName,
  type EvaluatedValue,
  type JsonObject,
  type MechanicContext,
  type MechanicExtension,
  type RollNeed,
  type StepInput,
  type StepRejects,
  type Tag,
  type Unit,
} from '@heroes2dgame/kernel';
import { rollNeed, taggedWith, withoutRoll } from './helpers.ts';
import { RULES_STDLIB_MECHANICS, RULES_STDLIB_NAMES } from './names.ts';
import { DIE_SCHEMA, FULL_NAME_SCHEMA, TAGS_SCHEMA } from './schemas.ts';

/**
 * The parameters of a chance of morale or of luck: the attribute that gives it, the random value that decides it,
 * the sides of the die for a good and for a bad chance, the largest value that counts, and the tags that take the
 * chance away.
 */
export interface ChanceParams extends JsonObject {
  /** The attribute of the unit, for example `core:morale`; a positive value gives a good chance. */
  readonly attribute: ContentName;
  /** The full name of the random value that decides the chance, for example `core:morale-roll`. */
  readonly roll: ContentName;
  /** The sides of the die for a good chance: with 24, a morale of 2 succeeds on 2 of the 24 sides. */
  readonly good: number;
  /** The sides of the die for a bad chance. */
  readonly bad: number;
  /** The largest value that counts, for example 3; a larger one counts as this. */
  readonly max: number;
  /** A unit with one of these tags, or a tag below them, has no chance at all, for example `Creature.Undead`. */
  readonly blockedBy?: readonly Tag[];
  /** A unit with one of these tags, or a tag below them, has no good chance, for example a unit that defends. */
  readonly goodBlockedBy?: readonly Tag[];
}

/**
 * A chance a unit has: good or bad, how many sides of the die succeed, the sides of the die, and the random value that
 * decides it.
 */
export interface Chance {
  /** Whether the chance is good or bad. */
  readonly kind: 'bad' | 'good';
  /** How many sides of the die succeed, from 1 to all of them. */
  readonly hits: number;
  /** How many sides the die has. */
  readonly sides: number;
  /** The full name of the random value. */
  readonly roll: ContentName;
}

/**
 * The chance a unit has, or nothing if it has none, or the rejection of a formula that the chance depends on.
 */
export type ChanceResult = EvaluatedValue<Chance | undefined> | StepRejects;

/**
 * A variant of morale or of luck: the chance a unit has now.
 */
export interface ChanceVariant extends MechanicExtension {
  /** The mechanic the variant belongs to. */
  readonly mechanic: typeof RULES_STDLIB_MECHANICS.luck | typeof RULES_STDLIB_MECHANICS.morale;
  /**
   * Returns the chance of a unit, or nothing if it has none, or rejects as a formula of an attribute or of a tag it
   * reads rejects, for example with `kernel:out-of-range`. The function rolls no dice.
   */
  readonly chance: (context: MechanicContext, unit: Unit) => ChanceResult;
}

interface ChosenChance {
  readonly context: MechanicContext;
  readonly variant: ChanceVariant;
}

/**
 * Morale as a chance: the attribute of the unit, up to `max` either way, succeeds on so many sides of a die of `good`
 * sides if it is positive, and of `bad` sides if it is negative. The order of turns by speed asks it, see
 * `SPEED_ORDER`.
 */
export const CHANCE_MORALE: ChanceVariant = chanceVariant(
  RULES_STDLIB_MECHANICS.morale,
  RULES_STDLIB_NAMES.chanceMorale,
);

/**
 * Luck as a chance, counted as morale is. The attack of stacks rolls it for every strike if its parameters have
 * `luck`: good luck raises the damage, and bad luck lowers it.
 */
export const CHANCE_LUCK: ChanceVariant = chanceVariant(RULES_STDLIB_MECHANICS.luck, RULES_STDLIB_NAMES.chanceLuck);

/**
 * Returns the variant of morale or of luck that the ruleset chose, or nothing if it chose none. The function
 * `chance` of the returned variant checks every chance the variant gives.
 *
 * @throws {TypeError} If the chosen variant has no function `chance`, or later, if it gives a chance that is not good
 *   or bad, with sides not from 1 to `MAX_DIE_SIDES` or with hits not from 1 to the sides.
 */
export function chosenChance(chosen: ChosenMechanic | undefined): ChosenChance | undefined {
  if (chosen === undefined) return undefined;

  const { context, variant } = chosen;

  if (!isChanceVariant(variant)) {
    throw new TypeError(`The variant ${JSON.stringify(variant.name)} of ${variant.mechanic} has no function chance.`);
  }

  const checked: ChanceVariant = variant;

  function chance(inner: MechanicContext, unit: Unit): ChanceResult {
    return checkedChance(checked, checked.chance(inner, unit));
  }

  return { context, variant: { ...checked, chance } };
}

/**
 * Returns the roll that decides a chance of a unit, seen by the sides that see the unit.
 */
export function chanceNeed(chance: Chance, unit: Unit): RollNeed {
  return rollNeed(unit, chance.roll, chance.sides);
}

/**
 * Tells whether a roll decided a chance for it. A good chance succeeds on the highest sides of the die, and a bad one
 * on the lowest, so the highest roll gives the best outcome and the lowest the worst.
 *
 * @throws {TypeError} If the input is not a roll of the chance.
 */
export function chanceHit(chance: Chance, input: StepInput): boolean {
  if (input.kind !== 'roll' || input.name !== chance.roll) {
    throw new TypeError(`A chance needs a roll of ${JSON.stringify(chance.roll)}.`);
  }

  return chance.kind === 'good' ? input.result > chance.sides - chance.hits : input.result <= chance.hits;
}

const NO_CHANCE: ChanceResult = Object.freeze({ kind: 'value', value: undefined });

const NOT_TAGGED: EvaluatedValue<boolean> = Object.freeze({ kind: 'value', value: false });

function chanceVariant(mechanic: ChanceVariant['mechanic'], name: string): ChanceVariant {
  return Object.freeze({
    chance: (context: MechanicContext, unit: Unit) => chanceOf(context, unit, name),
    kind: 'mechanic',
    mechanic,
    name,
    schema: chanceSchema(),
  });
}

function isChanceVariant(variant: MechanicExtension): variant is ChanceVariant {
  return 'chance' in variant && typeof variant.chance === 'function';
}

function checkedChance(variant: ChanceVariant, result: ChanceResult): ChanceResult {
  if (result.kind !== 'value' || result.value === undefined) return result;

  const chance = result.value;

  const { hits, kind, sides } = chance;
  const kinds: readonly string[] = ['bad', 'good'];
  const valid = kinds.includes(kind) && Number.isSafeInteger(sides) && sides >= 1
    && sides <= MAX_DIE_SIDES && Number.isSafeInteger(hits) && hits >= 1 && hits <= sides;

  if (!valid) {
    throw new TypeError(`The variant ${JSON.stringify(variant.name)} gives a wrong chance ${JSON.stringify(chance)}.`);
  }

  return result;
}

function chanceOf(context: MechanicContext, unit: Unit, source: string): ChanceResult {
  const params = context.params as ChanceParams;
  const { expressions } = context;
  const blocked = taggedWith(expressions, unit, params.blockedBy ?? [], source);

  if (blocked.kind !== 'value' || blocked.value) return blocked.kind === 'value' ? NO_CHANCE : blocked;

  const attribute = withoutRoll(expressions.attribute({ kind: 'unit', unit: unit.id }, params.attribute), source);

  if (attribute.kind !== 'value') return attribute;

  const value = attribute.value;
  const sides = value > 0 ? params.good : params.bad;
  const hits = Math.min(Math.abs(value), params.max, sides);

  if (hits === 0) return NO_CHANCE;

  const goodBlocked = value > 0 ? taggedWith(expressions, unit, params.goodBlockedBy ?? [], source) : NOT_TAGGED;

  if (goodBlocked.kind !== 'value' || goodBlocked.value) return goodBlocked.kind === 'value' ? NO_CHANCE : goodBlocked;

  return { kind: 'value', value: { hits, kind: value > 0 ? 'good' : 'bad', roll: params.roll, sides } };
}

function chanceSchema(): JsonObject {
  return {
    additionalProperties: false,
    properties: {
      attribute: FULL_NAME_SCHEMA,
      bad: DIE_SCHEMA,
      blockedBy: TAGS_SCHEMA,
      good: DIE_SCHEMA,
      goodBlockedBy: TAGS_SCHEMA,
      max: { minimum: 0, type: 'integer' },
      roll: FULL_NAME_SCHEMA,
    },
    required: ['attribute', 'bad', 'good', 'max', 'roll'],
    type: 'object',
  };
}
