import { kernelName } from '../../names/index.ts';

/**
 * The full name of a kind of event of the kernel.
 */
export type KernelEventType = (typeof KERNEL_EVENTS)[keyof typeof KERNEL_EVENTS];

/**
 * The full names of the kinds of events of the kernel.
 */
export const KERNEL_EVENTS = Object.freeze({
  abilityUsed: kernelName('ability-used'),
  battleEnded: kernelName('battle-ended'),
  effectApplied: kernelName('effect-applied'),
  effectChanged: kernelName('effect-changed'),
  effectRemoved: kernelName('effect-removed'),
  flagsChanged: kernelName('flags-changed'),
  hazardAdded: kernelName('hazard-added'),
  hazardRemoved: kernelName('hazard-removed'),
  healthChanged: kernelName('health-changed'),
  inputClosed: kernelName('input-closed'),
  inputRequested: kernelName('input-requested'),
  itemAdded: kernelName('item-added'),
  itemChanged: kernelName('item-changed'),
  itemRemoved: kernelName('item-removed'),
  phaseChanged: kernelName('phase-changed'),
  resourceChanged: kernelName('resource-changed'),
  rollMade: kernelName('roll-made'),
  stepsSaved: kernelName('steps-saved'),
  tagsChanged: kernelName('tags-changed'),
  triggerFired: kernelName('trigger-fired'),
  unitMoved: kernelName('unit-moved'),
  unitPlaced: kernelName('unit-placed'),
  unitSummoned: kernelName('unit-summoned'),
  variableSet: kernelName('variable-set'),
});
