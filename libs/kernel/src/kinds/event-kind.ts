import type { JsonObject } from '../json/index.ts';
import type { BattleState } from '../model/index.ts';
import type { Extension } from '../names/index.ts';

/**
 * A kind of event: its format version, the schema of its payload, how it changes the state, and the migrations of its
 * older versions.
 *
 * An event of a package with extensions changes only the data of that package in `BattleState.extensions`, under keys
 * with the prefix of the package. Units, sides and the field change only through events of the kernel.
 */
export interface EventKind<Payload = unknown> extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'event';
  /** The current version of the format; it starts at 1. */
  readonly version: number;
  /** The JSON Schema of the payload of the current version. Events of the kernel leave it to `protocol`. */
  readonly schema?: JsonObject;
  /** One migration for every older version, from version 1 to the version before the current one. */
  readonly migrations: readonly Migration[];
  /** Returns the state after the event. The payload has the current version. The function never changes its input. */
  apply(state: BattleState, payload: Payload): BattleState;
}

/**
 * A migration that moves a payload or step parameters one version forward.
 */
export interface Migration {
  /** The version the migration starts from; the result has the next version. */
  readonly from: number;
  /** Returns the payload or the parameters in the next version. The function never changes its input. */
  migrate(value: unknown): unknown;
}
