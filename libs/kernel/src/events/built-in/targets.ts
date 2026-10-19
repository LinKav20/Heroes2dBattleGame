import { holderTarget, type SideTarget, type UnitTarget } from '../../model/index.ts';
import { KERNEL_EVENTS, type KernelEventType } from './names.ts';
import type { KernelEventPayloads } from './payloads.ts';

/**
 * Returns the unit or the side an event of a kind of the kernel is about.
 */
export type KernelEventTargets = {
  readonly [Type in KernelEventType]?: (payload: KernelEventPayloads[Type]) => SideTarget | UnitTarget | undefined;
};

/**
 * The unit or the side every event of the kernel is about: the unit of an event about a unit or its items, the holder
 * of an event about an effect or an ability if it is a unit or a side, and the unit or the side that gets the turn or
 * whose turn ended.
 * Other events are about nobody.
 */
export const KERNEL_EVENT_TARGETS: KernelEventTargets = {
  [KERNEL_EVENTS.abilityUsed]: ({ holder }) => holderTarget(holder),
  [KERNEL_EVENTS.abilityUsesChanged]: ({ holder }) => holderTarget(holder),
  [KERNEL_EVENTS.actionsChanged]: ({ unit }) => ({ kind: 'unit', unit }),
  [KERNEL_EVENTS.aurasChanged]: ({ unit }) => ({ kind: 'unit', unit }),
  [KERNEL_EVENTS.effectApplied]: ({ holder }) => holderTarget(holder),
  [KERNEL_EVENTS.effectChanged]: ({ holder }) => holderTarget(holder),
  [KERNEL_EVENTS.effectNotApplied]: ({ holder }) => holderTarget(holder),
  [KERNEL_EVENTS.effectRemoved]: ({ holder }) => holderTarget(holder),
  [KERNEL_EVENTS.flagsChanged]: ({ unit }) => ({ kind: 'unit', unit }),
  [KERNEL_EVENTS.healthChanged]: ({ unit }) => ({ kind: 'unit', unit }),
  [KERNEL_EVENTS.itemAdded]: ({ unit }) => ({ kind: 'unit', unit }),
  [KERNEL_EVENTS.itemChanged]: ({ unit }) => ({ kind: 'unit', unit }),
  [KERNEL_EVENTS.itemRemoved]: ({ unit }) => ({ kind: 'unit', unit }),
  [KERNEL_EVENTS.phaseChanged]: ({ phase }) => {
    if (phase.kind !== 'turn') return undefined;

    return phase.unit === undefined ? { kind: 'side', side: phase.side } : { kind: 'unit', unit: phase.unit };
  },
  [KERNEL_EVENTS.resourceChanged]: ({ unit }) => ({ kind: 'unit', unit }),
  [KERNEL_EVENTS.tagsChanged]: ({ unit }) => ({ kind: 'unit', unit }),
  [KERNEL_EVENTS.turnEnded]: ({ holder }) => holderTarget(holder),
  [KERNEL_EVENTS.unitMoved]: ({ unit }) => ({ kind: 'unit', unit }),
  [KERNEL_EVENTS.unitPlaced]: ({ unit }) => ({ kind: 'unit', unit }),
  [KERNEL_EVENTS.unitSummoned]: ({ unit }) => ({ kind: 'unit', unit: unit.id }),
  [KERNEL_EVENTS.unitTurned]: ({ unit }) => ({ kind: 'unit', unit }),
  [KERNEL_EVENTS.zonesChanged]: ({ unit }) => ({ kind: 'unit', unit }),
};
