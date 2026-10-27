import type { MechanicChoice, RandomSource, ScenarioItem, ScenarioUnit } from '../content/index.ts';
import type { EventKind } from '../extensions/index.ts';
import type { ContentName, SideId, UnitId } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { StateFormatVersion } from '../model/index.ts';
import type { Registry } from '../names/index.ts';
import type { CommandSetup } from './plan-context.ts';

/**
 * What the consumer chooses when a battle is created: the scenario and what changes in it for this battle. The changes
 * apply in this order: the removed units leave the scenario, the added units join their sides after the units of the
 * scenario, the changes of units and sides apply, and at the start the effects of the options follow the effects of the
 * scenario.
 */
export interface BattleOptions {
  /** The full name of the scenario. */
  readonly scenario: ContentName;
  /** Changes to the ruleset of the scenario: other variants of mechanics and sources of random values. */
  readonly ruleset?: RulesetChanges;
  /**
   * The seed of the random number generator as 64 lowercase hexadecimal digits. Without it the battle has no generator,
   * and a roll from the generator is an error of the point of assembly.
   */
  readonly seed?: string;
  /** Changes to units of the scenario and to added units, by the local name of the unit. */
  readonly units?: Readonly<Record<UnitId, UnitChanges>>;
  /**
   * Units of the scenario that do not take part in the battle, by local name, all different. A changed unit cannot be
   * removed.
   */
  readonly removed?: readonly UnitId[];
  /**
   * New units of sides, by the local name of the side, in the format of the units of a scenario and checked as they
   * are, but as options. Their local names differ from every unit of the scenario, a removed one included, and from
   * each other, and every added unit is seen by its side. An added unit with a cell stands there at the start, but its
   * side may place it again while it deploys.
   */
  readonly added?: Readonly<Record<SideId, readonly ScenarioUnit[]>>;
  /** Changes to sides of the scenario, by the local name of the side. */
  readonly sides?: Readonly<Record<SideId, SideChanges>>;
}

/**
 * Changes to a side of a scenario for one battle, for example the bonuses of a commander.
 */
export interface SideChanges {
  /** Effects the side gets at the start, after the effects of the scenario, in this order. */
  readonly effects?: readonly StartingEffect[];
  /** More abilities of the side, after its abilities in the scenario; none of them repeats. */
  readonly abilities?: readonly ContentName[];
}

/**
 * An effect a unit or a side gets at the start of a battle, with the values it is applied with.
 */
export interface StartingEffect {
  /** The full name of the effect. */
  readonly effect: ContentName;
  /** The values the effect is applied with, which formulas read with `kernel:effect-param`; none if not given. */
  readonly params?: JsonObject;
}

/**
 * How much of an ability a unit has already used, for example in the previous battle.
 */
export interface SpentUses {
  /** How many times the ability has been used in the battle, a whole number from 0; 0 if not given. */
  readonly battle?: number;
  /** The turns left until the ability can be used again, a whole number from 0; 0 if not given. */
  readonly cooldown?: number;
}

/**
 * Changes to the ruleset of a scenario for one battle. The parameters of a variant are not checked by the kernel:
 * whoever builds the options checks them by the schema of the variant.
 */
export interface RulesetChanges {
  /** Other variants of mechanics, by the full name of the mechanic. */
  readonly mechanics?: Readonly<Record<string, MechanicChoice>>;
  /** Other sources of random values, by the full name of the value. */
  readonly randomSources?: Readonly<Record<ContentName, RandomSource>>;
}

/**
 * Changes to a unit of a scenario for one battle, for example what is left of it after the previous battle. They
 * apply after the effects of the scenario and win over the values the unit starts with.
 */
export interface UnitChanges {
  /** The number of creatures, from 1; it is also the most that healing that revives brings the unit back to. */
  readonly count?: number;
  /** The health of the creature that takes damage first, from 1 to the full health of one creature. */
  readonly health?: number;
  /** The values of resources, by the full name of the resource; each from 0. */
  readonly resources?: Readonly<Record<ContentName, number>>;
  /** Effects the unit gets at the start, after the effects of the scenario, in this order. */
  readonly effects?: readonly StartingEffect[];
  /** The items the unit starts with, in place of its items in the scenario, in the format of the scenario. */
  readonly items?: readonly ScenarioItem[];
  /** How much of its abilities the unit has already used, by the full name of the ability. */
  readonly abilityUses?: Readonly<Record<ContentName, SpentUses>>;
}

/**
 * What creating a state needs besides the options: the content, the registries and what the kernel keeps, and the
 * version of the state format of the kernel.
 */
export interface StateSetup extends CommandSetup {
  /** The registries of nodes, topologies, mechanics and kinds of events. */
  readonly registries: CommandSetup['registries'] & { readonly events: Registry<EventKind> };
  /** The version of the state format. */
  readonly format: StateFormatVersion;
}
