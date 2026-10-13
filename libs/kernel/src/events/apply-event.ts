import type { EventKind } from '../extensions/index.ts';
import type { BattleEvent, BattleState } from '../model/index.ts';
import { isKernelName, prefixOf, type Registry } from '../names/index.ts';
import { compareCodeUnits, isRecord } from '../shared/index.ts';

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

  return applyEventOfKind(kind, state, event);
}

/**
 * Applies an event of a known kind, as {@link applyEvent} does after it finds the kind.
 */
export function applyEventOfKind(kind: EventKind, state: BattleState, event: BattleEvent): BattleState {
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

  function own(key: string): boolean {
    return key.startsWith(prefix);
  }

  if (changesOnly(before, after, isExtensionData) && changesOnly(before.extensions, after.extensions, own)) return;

  const changed = [
    ...changedKeys(before, after).filter((key) => !isExtensionData(key)),
    ...changedKeys(before.extensions, after.extensions)
      .filter((key) => !own(key))
      .map((key) => `${EXTENSION_DATA}[${JSON.stringify(key)}]`),
  ];

  throw new TypeError(
    `The event ${JSON.stringify(name)} changed ${changed.join(', ')}, but an event of an extension may change only `
    + 'the data of its package.',
  );
}

function isExtensionData(key: string): boolean {
  return key === EXTENSION_DATA;
}

function changesOnly(before: object, after: object, allowed: (key: string) => boolean): boolean {
  return sameOutside(before, after, allowed) && sameOutside(after, before, allowed);
}

function sameOutside(from: object, to: object, allowed: (key: string) => boolean): boolean {
  const left: unknown = from;
  const right: unknown = to;

  if (!isRecord(left) || !isRecord(right)) return false;

  return Object.keys(left).every((key) => allowed(key) || (Object.hasOwn(right, key) && left[key] === right[key]));
}

function changedKeys(before: object, after: object): string[] {
  const old = new Map(Object.entries(before));
  const next = new Map(Object.entries(after));
  const keys = [...new Set([...old.keys(), ...next.keys()])].sort(compareCodeUnits);

  return keys.filter((key) => old.get(key) !== next.get(key));
}
