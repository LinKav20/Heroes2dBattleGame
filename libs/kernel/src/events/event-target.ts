import type { EventKind } from '../extensions/index.ts';
import type { BattleEvent, SideTarget, UnitTarget } from '../model/index.ts';
import type { Registry } from '../names/index.ts';
import { isRecord } from '../shared/index.ts';

/**
 * Returns the unit or the side an event is about, as its kind tells, or nothing if it is about nobody or its kind is
 * unknown.
 *
 * @throws {TypeError} If the kind of event names a cell or something else than a unit or a side.
 */
export function eventTarget(events: Registry<EventKind>, event: BattleEvent): SideTarget | UnitTarget | undefined {
  const target: unknown = events.get(event.type)?.target?.(event.payload);

  if (target === undefined) return undefined;

  if (isRecord(target) && target.kind === 'unit' && typeof target.unit === 'string') {
    return { kind: 'unit', unit: target.unit };
  }

  if (isRecord(target) && target.kind === 'side' && typeof target.side === 'string') {
    return { kind: 'side', side: target.side };
  }

  throw new TypeError(
    `The kind of event ${JSON.stringify(event.type)} names a target that is neither a unit nor a side.`,
  );
}
