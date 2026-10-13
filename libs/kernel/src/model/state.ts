import type { PackVersion, Ruleset, ScenarioValue } from '../content/index.ts';
import type { ContentName } from '../ids/index.ts';
import type { JsonValue } from '../json/index.ts';
import type { RngState } from '../rng/index.ts';
import type { Field } from './field.ts';
import type { InputRequest } from './input-requests.ts';
import type { BattlePhase } from './phases.ts';
import type { Side } from './sides.ts';
import type { Step } from './steps.ts';
import type { Unit } from './units.ts';

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
  /**
   * The steps of the current command that are not done yet, while an input request is open; the last one runs next.
   * Without an open request the list is empty.
   */
  readonly steps: readonly Step[];
  /** The open input request, if the kernel waits for data from outside. */
  readonly inputRequest?: InputRequest;
  /** The data of extensions, by the full name of the extension. */
  readonly extensions: Readonly<Record<string, JsonValue>>;
  /** The random number generator, if the ruleset has random values. */
  readonly rng?: RngState;
  /**
   * The number the kernel gives to the next applied effect, item or summoned unit. One counter serves all of them, so
   * a step that gives several such events numbers them in order from this value.
   */
  readonly nextId: number;
  /**
   * The number the kernel gives to the next input request. Requests have their own counter, so the numbers of
   * effects, items and units do not depend on whether a value came from the generator or from outside.
   */
  readonly nextRequestId: number;
}

/**
 * The version of the state format: the version of the kernel part, the version of the data of every extension that
 * keeps data in the state, and the version of every kind of step, because the state keeps the saved steps.
 */
export interface StateFormatVersion {
  /** The version of the state format of the kernel. */
  readonly kernel: number;
  /** The version of the data of every extension, by the full name of the extension. */
  readonly extensions: Readonly<Record<string, number>>;
  /** The version of every kind of step, by the full name of the kind. */
  readonly steps: Readonly<Record<string, number>>;
}

/**
 * The state of a scenario trigger.
 */
export interface TriggerState {
  /** How many times the trigger has fired. */
  readonly fired: number;
}
