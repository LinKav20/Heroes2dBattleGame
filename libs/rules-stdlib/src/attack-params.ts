import {
  FULL_NAME_PATTERN,
  MAX_DICE_PER_ROLL,
  NAME_SCHEMA,
  type ContentName,
  type JsonObject,
  type Tag,
} from '@heroes2dgame/kernel';

/**
 * The parameters of the attack of stacks. Bonuses are in thousandths of the damage for one point of difference.
 */
export interface StackParams extends JsonObject {
  /** The attribute of attack, for example `core:attack`. */
  readonly attack: ContentName;
  /** The attribute of defense, for example `core:defense`. */
  readonly defense: ContentName;
  /** The kind of action of the turn that an attack and a shot spend, for example `core:action`. */
  readonly action: ContentName;
  /** The damage of one creature. */
  readonly damage: DamageParams;
  /** How the difference of attack and defense changes the damage. */
  readonly bonus: BonusParams;
  /** How luck changes the damage; without it luck does not change the damage even if the ruleset chooses luck. */
  readonly luck?: LuckParams;
  /** The strike back, if units strike back. */
  readonly retaliation?: RetaliationParams;
  /** Shots, if units shoot. */
  readonly shots?: ShotParams;
}

/**
 * The damage of one creature: the attributes of its least and greatest damage, the random value of the roll, and
 * how many creatures of a stack roll at most. A greatest damage below the least counts as the least. A difference
 * between them of `MAX_DIE_SIDES` or more rejects the strike with `kernel:out-of-range`.
 */
export interface DamageParams extends JsonObject {
  /** The attribute of the least damage, for example `core:damage-min`. */
  readonly min: ContentName;
  /** The attribute of the greatest damage, for example `core:damage-max`. */
  readonly max: ContentName;
  /** The full name of the random value, for example `core:damage-roll`. */
  readonly roll: ContentName;
  /** At most this many creatures roll, from 1 to `MAX_DICE_PER_ROLL`, and the sum grows for the rest; 10 by default. */
  readonly rolled?: number;
}

/**
 * How the difference of attack and defense changes the damage, in thousandths for one point, and up to a limit.
 */
export interface BonusParams extends JsonObject {
  /** The rise for one point of attack above defense, for example 50 for 5%. */
  readonly attack: number;
  /** The largest rise, for example 3000 for 300%. */
  readonly attackMax: number;
  /** The fall for one point of defense above attack, for example 25 for 2.5%. */
  readonly defense: number;
  /** The largest fall, at most 1000, for example 700 for 70%. */
  readonly defenseMax: number;
}

/**
 * How luck changes the damage, in percent.
 */
export interface LuckParams extends JsonObject {
  /** The damage with good luck, for example 200. */
  readonly good: number;
  /** The damage with bad luck, for example 50. */
  readonly bad: number;
}

/**
 * The strike back: the resource that counts strikes back, for example one that the definition of the creature
 * restores every round, and the tags of attackers that get none.
 */
export interface RetaliationParams extends JsonObject {
  /** The resource of strikes back, for example `core:retaliations`; a creature without it never strikes back. */
  readonly resource: ContentName;
  /** An attacker with one of these tags, or a tag below them, gets no strike back. */
  readonly blockedBy?: readonly Tag[];
}

/**
 * Shots: the resource that counts them, the penalties of a shot from afar and of a shooter in melee, and what keeps a
 * unit from shooting.
 */
export interface ShotParams extends JsonObject {
  /** The resource of shots, for example `core:shots`; a creature without it does not shoot. */
  readonly resource: ContentName;
  /** A shot at a target farther than this has the damage `farPercent`. */
  readonly far: number;
  /** The damage of a shot from afar, in percent, for example 50. */
  readonly farPercent: number;
  /** The damage of a unit with shots left in melee and in a strike back, in percent, for example 50. */
  readonly meleePercent: number;
  /** Whether an enemy next to a unit that its side sees keeps it from shooting. */
  readonly nearby: boolean;
  /** Whether a unit shoots only at a target it sees. */
  readonly sight: boolean;
  /** A unit with one of these tags, or a tag below them, has no penalties of shots, for example `Ability.Sharp`. */
  readonly noPenalty?: readonly Tag[];
}

/**
 * The parameters of the defense that braces a unit: the effect it gets.
 */
export interface BraceParams extends JsonObject {
  /** The effect the unit gets, for example one that adds defense until its next turn. */
  readonly effect: ContentName;
}

/**
 * How many creatures of a stack roll their damage if the parameters do not say.
 */
export const DEFAULT_ROLLED = 10;

/**
 * Returns the JSON Schema of `StackParams`.
 */
export function stackSchema(): JsonObject {
  const whole = { minimum: 0, type: 'integer' };
  const tags = { items: NAME_SCHEMA, type: 'array' };

  return {
    additionalProperties: false,
    properties: {
      action: FULL_NAME,
      attack: FULL_NAME,
      bonus: objectSchema({
        attack: whole,
        attackMax: whole,
        defense: whole,
        defenseMax: { maximum: 1000, minimum: 0, type: 'integer' },
      }),
      damage: objectSchema({
        max: FULL_NAME,
        min: FULL_NAME,
        roll: FULL_NAME,
        rolled: { maximum: MAX_DICE_PER_ROLL, minimum: 1, type: 'integer' },
      }, ['rolled']),
      defense: FULL_NAME,
      luck: objectSchema({ bad: whole, good: whole }),
      retaliation: objectSchema({ blockedBy: tags, resource: FULL_NAME }, ['blockedBy']),
      shots: objectSchema({
        far: whole,
        farPercent: whole,
        meleePercent: whole,
        nearby: { type: 'boolean' },
        noPenalty: tags,
        resource: FULL_NAME,
        sight: { type: 'boolean' },
      }, ['noPenalty']),
    },
    required: ['action', 'attack', 'bonus', 'damage', 'defense'],
    type: 'object',
  };
}

/**
 * Returns the JSON Schema of `BraceParams`.
 */
export function braceSchema(): JsonObject {
  return objectSchema({ effect: FULL_NAME });
}

const FULL_NAME: JsonObject = { pattern: FULL_NAME_PATTERN, type: 'string' };

function objectSchema(properties: Readonly<Record<string, JsonObject>>, optional: readonly string[] = []): JsonObject {
  return {
    additionalProperties: false,
    properties,
    required: Object.keys(properties).filter((key) => !optional.includes(key)),
    type: 'object',
  };
}
