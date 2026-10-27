import type { EventDraft, EventKind } from '../../extensions/index.ts';
import type { VisibleTo } from '../../ids/index.ts';
import type { BattleEvent } from '../../model/index.ts';
import { compareCodeUnits } from '../../shared/index.ts';
import { ABILITY_EVENTS } from './abilities.ts';
import type { KernelEventAppliers } from './appliers.ts';
import { BATTLE_EVENTS } from './battle.ts';
import { EFFECT_EVENTS } from './effects.ts';
import { EXECUTION_EVENTS } from './execution.ts';
import { FIELD_EVENTS } from './field.ts';
import { INVENTORY_EVENTS } from './inventory.ts';
import { KERNEL_EVENTS, type KernelEventType } from './names.ts';
import type { KernelEventPayloads } from './payloads.ts';
import { PROJECTION_EVENTS } from './projection.ts';
import { SCENARIO_EVENTS } from './scenario.ts';
import { KERNEL_EVENT_TARGETS, type KernelEventTargets } from './targets.ts';
import { UNIT_EVENTS } from './units.ts';

/**
 * An event of the kernel of the given kind, or of any kind of the kernel.
 */
export type KernelEvent<Type extends KernelEventType = KernelEventType> = {
  readonly [Kind in Type]: BattleEvent<KernelEventPayloads[Kind]> & { readonly type: Kind };
}[Type];

/**
 * All kinds of events of the kernel, sorted by name. The kernel registers them itself under the prefix `kernel`; they
 * have no schema, because `protocol` describes them.
 */
export const KERNEL_EVENT_KINDS: readonly EventKind[] = kernelEventKinds({
  ...ABILITY_EVENTS,
  ...BATTLE_EVENTS,
  ...EFFECT_EVENTS,
  ...EXECUTION_EVENTS,
  ...FIELD_EVENTS,
  ...INVENTORY_EVENTS,
  ...PROJECTION_EVENTS,
  ...SCENARIO_EVENTS,
  ...UNIT_EVENTS,
}, KERNEL_EVENT_TARGETS);

/**
 * Tells whether an event is an event of the kernel in the current version of its format, of the given kind if one is
 * given, and narrows its payload. An event from a journal needs a migration first.
 */
export function isKernelEvent<Type extends KernelEventType = KernelEventType>(
  event: BattleEvent,
  type?: Type,
): event is KernelEvent<Type> {
  return (type === undefined || event.type === type) && VERSIONS.get(event.type) === event.version;
}

/**
 * Returns a draft of an event of the kernel with a checked payload, for a step to give.
 */
export function kernelEventDraft<Type extends KernelEventType>(
  type: Type,
  payload: KernelEventPayloads[Type],
  visibleTo: VisibleTo,
): EventDraft<KernelEventPayloads[Type]> {
  return { payload, type, visibleTo };
}

const VERSIONS = new Map(KERNEL_EVENT_KINDS.map(({ name, version }) => [name, version]));

function kernelEventKinds(
  appliers: KernelEventAppliers<KernelEventPayloads>,
  targets: KernelEventTargets,
): readonly EventKind[] {
  const kinds = Object.values(KERNEL_EVENTS)
    .toSorted(compareCodeUnits)
    .map((type): EventKind => {
      const apply: EventKind['apply'] = appliers[type];
      const target: EventKind['target'] = targets[type];
      const kind: EventKind = { apply, kind: 'event', migrations: [], name: type, version: 1 };

      return Object.freeze(target === undefined ? kind : { ...kind, target });
    });

  return Object.freeze(kinds);
}
