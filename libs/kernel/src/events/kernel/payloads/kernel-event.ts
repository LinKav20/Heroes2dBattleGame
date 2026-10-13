import type { BattleEvent } from '../../../model/index.ts';
import type { KERNEL_EVENTS, KernelEventType } from '../names.ts';
import type {
  BattleEndedPayload,
  InputClosedPayload,
  InputRequestedPayload,
  PhaseChangedPayload,
  RollMadePayload,
  StepsSavedPayload,
} from './battle.ts';
import type {
  AbilityUsedPayload,
  FlagsChangedPayload,
  HealthChangedPayload,
  ResourceChangedPayload,
  TagsChangedPayload,
  UnitMovedPayload,
  UnitPlacedPayload,
  UnitSummonedPayload,
} from './units.ts';
import type {
  EffectAppliedPayload,
  EffectChangedPayload,
  EffectRemovedPayload,
} from './effects.ts';
import type { ItemAddedPayload, ItemChangedPayload, ItemRemovedPayload } from './inventory.ts';
import type { HazardAddedPayload, HazardRemovedPayload } from './field.ts';
import type { TriggerFiredPayload, VariableSetPayload } from './scenario.ts';

/**
 * The payload of every kind of event of the kernel, by the full name of the kind.
 */
export interface KernelEventPayloads {
  /** A unit used an ability, or a side used its own ability. */
  readonly [KERNEL_EVENTS.abilityUsed]: AbilityUsedPayload;
  /** The battle is over; the stack of steps is empty and no input request is open. */
  readonly [KERNEL_EVENTS.battleEnded]: BattleEndedPayload;
  /** An effect was applied to a unit, a side, the field or a hazard zone. */
  readonly [KERNEL_EVENTS.effectApplied]: EffectAppliedPayload;
  /** An applied effect changed: its counter, stacks, activity or parameters. */
  readonly [KERNEL_EVENTS.effectChanged]: EffectChangedPayload;
  /** An applied effect was removed. */
  readonly [KERNEL_EVENTS.effectRemoved]: EffectRemovedPayload;
  /** The flags of a unit changed. */
  readonly [KERNEL_EVENTS.flagsChanged]: FlagsChangedPayload;
  /** A hazard zone appeared on the field; its effects come with separate events. */
  readonly [KERNEL_EVENTS.hazardAdded]: HazardAddedPayload;
  /** A hazard zone disappeared from the field together with its effects. */
  readonly [KERNEL_EVENTS.hazardRemoved]: HazardRemovedPayload;
  /** The number of creatures of a unit or the health of the first one changed. */
  readonly [KERNEL_EVENTS.healthChanged]: HealthChangedPayload;
  /** The open input request was answered or dropped. */
  readonly [KERNEL_EVENTS.inputClosed]: InputClosedPayload;
  /** The kernel needs data from outside and waits. */
  readonly [KERNEL_EVENTS.inputRequested]: InputRequestedPayload;
  /** An item appeared in the inventory of a unit. */
  readonly [KERNEL_EVENTS.itemAdded]: ItemAddedPayload;
  /** An item in the inventory of a unit changed: its count, charges or slot. */
  readonly [KERNEL_EVENTS.itemChanged]: ItemChangedPayload;
  /** An item left the inventory of a unit. */
  readonly [KERNEL_EVENTS.itemRemoved]: ItemRemovedPayload;
  /** The round or the phase of the battle changed. */
  readonly [KERNEL_EVENTS.phaseChanged]: PhaseChangedPayload;
  /** A resource of a unit changed. */
  readonly [KERNEL_EVENTS.resourceChanged]: ResourceChangedPayload;
  /** A random value was rolled by the generator or entered from outside. */
  readonly [KERNEL_EVENTS.rollMade]: RollMadePayload;
  /** The steps of the current command that are not done yet were saved. */
  readonly [KERNEL_EVENTS.stepsSaved]: StepsSavedPayload;
  /** The tags of a unit and the number of their sources changed. */
  readonly [KERNEL_EVENTS.tagsChanged]: TagsChangedPayload;
  /** A scenario trigger fired. */
  readonly [KERNEL_EVENTS.triggerFired]: TriggerFiredPayload;
  /** A unit moved along a path. */
  readonly [KERNEL_EVENTS.unitMoved]: UnitMovedPayload;
  /** A unit was placed on the field during deployment. */
  readonly [KERNEL_EVENTS.unitPlaced]: UnitPlacedPayload;
  /** A new unit was summoned. */
  readonly [KERNEL_EVENTS.unitSummoned]: UnitSummonedPayload;
  /** A scenario variable got a new value. */
  readonly [KERNEL_EVENTS.variableSet]: VariableSetPayload;
}

/**
 * An event of the kernel of the given kind, or of any kind of the kernel.
 */
export type KernelEvent<Type extends KernelEventType = KernelEventType> = {
  readonly [Kind in Type]: BattleEvent<KernelEventPayloads[Kind]> & { readonly type: Kind };
}[Type];

/**
 * Tells whether an event is an event of the kernel of the given kind and narrows its payload.
 */
export function isKernelEvent<Type extends KernelEventType>(
  event: BattleEvent,
  type: Type,
): event is KernelEvent<Type> {
  return event.type === type;
}
