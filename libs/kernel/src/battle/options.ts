import type { MechanicChoice, RandomSource } from '../content/index.ts';
import type { EventKind } from '../extensions/index.ts';
import type { ContentName, UnitId } from '../ids/index.ts';
import type { StateFormatVersion } from '../model/index.ts';
import type { Registry } from '../names/index.ts';
import type { CommandSetup } from './plan-context.ts';

/**
 * What the consumer chooses when a battle is created: the scenario and what changes in it for this battle.
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
  /** Changes to units of the scenario, by the local name of the unit. */
  readonly units?: Readonly<Record<UnitId, UnitChanges>>;
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
