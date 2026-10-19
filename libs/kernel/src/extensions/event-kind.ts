import type { JsonObject } from '../json/index.ts';
import type { BattleState, SideTarget, UnitTarget } from '../model/index.ts';
import type { Extension } from '../names/index.ts';
import type { Migration } from './migration.ts';

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
  /**
   * The JSON Schema of the payload of the current version. Every kind of event of a package with extensions has one;
   * the kinds of events of the kernel leave it to `protocol`.
   */
  readonly schema?: JsonObject;
  /** One migration for every older version, from version 1 to the version before the current one. */
  readonly migrations: readonly Migration[];
  /**
   * Returns the state after the event. The payload has the current version.
   *
   * The function never changes its input: it returns a new state and keeps every part it does not change as the same
   * object, for example `{ ...state, extensions: { ...state.extensions, [key]: value } }`. The kernel compares the
   * parts by reference to check that an event of an extension changes only the data of its package. The order of keys
   * in the records of the state is not part of the state, so the function must not depend on it.
   */
  apply(state: BattleState, payload: Payload): BattleState;
  /**
   * Returns the unit or the side the event is about, if any. Reactions of effects to the event get it as the
   * participant `target`; without the function, or if it returns nothing, they have no `target`. The kernel calls it
   * only when an effect of the battle reacts to the kind of event. The payload has the current version.
   */
  target?(payload: Payload): SideTarget | UnitTarget | undefined;
}

/**
 * A kind of event that a package with extensions declares. Unlike a kind of event of the kernel, it always has a
 * schema of its payload.
 */
export interface ExtensionEventKind<Payload = unknown> extends EventKind<Payload> {
  /** The JSON Schema of the payload of the current version. */
  readonly schema: JsonObject;
}
