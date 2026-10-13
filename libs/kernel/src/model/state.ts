import type { PackVersion, Ruleset, ScenarioValue } from '../content/index.ts';
import type { ContentName } from '../ids/index.ts';
import type { JsonValue } from '../json/index.ts';
import type { RngState } from '../rng/index.ts';
import type { Field } from './field.ts';
import type { InputRequest } from './input-requests.ts';
import type { BattlePhase } from './phases.ts';
import type { Step } from './steps.ts';
import type { Side, Unit } from './units.ts';

/**
 * Everything known about a battle now, as plain JSON. Numbers are safe integers. The state refers to definitions of
 * the content registry by name; the only definition it holds in full is the ruleset with the consumer's adjustments.
 */
export interface BattleState {
  /** The version of the state format. */
  readonly format: StateFormatVersion;
  /** The packs of the battle with their exact versions, in the order of loading. */
  readonly packs: readonly PackVersion[];
  /** The content hash, as 64 lowercase hexadecimal digits. */
  readonly contentHash: string;
  /** The ruleset of the battle with the consumer's adjustments. */
  readonly ruleset: Ruleset;
  /** The scenario of the battle. */
  readonly scenario: ContentName;
  /** The current round; 0 before the first round. */
  readonly round: number;
  /** Where the battle is by the rules. */
  readonly phase: BattlePhase;
  /** The sides in the order of the scenario. */
  readonly sides: readonly Side[];
  /** The units in the order of the scenario, with added and summoned units after them. */
  readonly units: readonly Unit[];
  /** The field with its obstacles, hazard zones and effects. */
  readonly field: Field;
  /** The values of the scenario variables, by local name. */
  readonly variables: Readonly<Record<string, ScenarioValue>>;
  /** The state of the scenario triggers, by local name. */
  readonly triggers: Readonly<Record<string, TriggerState>>;
  /** The steps of the current command that are not done yet; the last one runs next. */
  readonly steps: readonly Step[];
  /** The open input request, if the kernel waits for data from outside. */
  readonly inputRequest?: InputRequest;
  /** The data of extensions, by the full name of the extension. */
  readonly extensions: Readonly<Record<string, JsonValue>>;
  /** The random number generator, if the ruleset has random values. */
  readonly rng?: RngState;
  /**
   * The next number the kernel gives to a new applied effect, item, input request or summoned unit. One counter
   * serves the whole battle.
   */
  readonly nextId: number;
}

/**
 * The version of the state format: the version of the kernel part and the version of the data of every extension
 * that keeps data in the state.
 */
export interface StateFormatVersion {
  /** The version of the state format of the kernel. */
  readonly kernel: number;
  /** The version of the data of every extension, by the full name of the extension. */
  readonly extensions: Readonly<Record<string, number>>;
}

/**
 * The state of a scenario trigger.
 */
export interface TriggerState {
  /** How many times the trigger has fired. */
  readonly fired: number;
}
