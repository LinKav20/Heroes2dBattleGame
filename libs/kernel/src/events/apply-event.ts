import type { BattleEvent, BattleState } from '../model/index.ts';
import { isKernelName, prefixOf, type Registry } from '../names/index.ts';
import { compareCodeUnits } from '../shared/index.ts';
import type { EventKind } from '../kinds/index.ts';

/**
 * Applies an event in the current version of its format and returns the new state; the input does not change.
 *
 * An event of a package with extensions may change only `BattleState.extensions` under keys with the prefix of the
 * package.
 *
 * @throws {TypeError} If the kind of event is unknown, the event is not migrated to the current version, or an event of
 * an extension changes what it may not change.
 * @throws {RangeError} If the event does not fit the state, for example it refers to a unit that does not exist.
 */
export function applyEvent(events: Registry<EventKind>, state: BattleState, event: BattleEvent): BattleState {
  const kind = events.get(event.type);

  if (kind === undefined) throw new TypeError(`The kernel has no kind of event ${JSON.stringify(event.type)}.`);

  if (event.version !== kind.version) {
    throw new TypeError(
      `The event ${JSON.stringify(event.type)} has version ${String(event.version)}, but the code reads version `
      + `${String(kind.version)}; migrate the event first.`,
    );
  }

  const next = kind.apply(state, event.payload);

  if (!isKernelName(kind.name)) checkOwnData(kind.name, state, next);

  return next;
}

const EXTENSION_DATA = 'extensions';

function checkOwnData(name: string, before: BattleState, after: BattleState): void {
  const prefix = `${prefixOf(name)}:`;
  const outside = changedKeys(before, after).filter((key) => key !== EXTENSION_DATA);
  const foreign = changedKeys(before.extensions, after.extensions).filter((key) => !key.startsWith(prefix));
  const changed = [...outside, ...foreign.map((key) => `${EXTENSION_DATA}[${JSON.stringify(key)}]`)];

  if (changed.length > 0) {
    throw new TypeError(
      `The event ${JSON.stringify(name)} changed ${changed.join(', ')}, but an event of an extension may change only `
      + 'the data of its package.',
    );
  }
}

function changedKeys(before: object, after: object): string[] {
  const old = new Map(Object.entries(before));
  const next = new Map(Object.entries(after));
  const keys = [...new Set([...old.keys(), ...next.keys()])].sort(compareCodeUnits);

  return keys.filter((key) => old.get(key) !== next.get(key));
}
