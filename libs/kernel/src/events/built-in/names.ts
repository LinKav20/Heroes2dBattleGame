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
  abilityUsesChanged: kernelName('ability-uses-changed'),
  actionsChanged: kernelName('actions-changed'),
  aurasChanged: kernelName('auras-changed'),
  battleEnded: kernelName('battle-ended'),
  commandAborted: kernelName('command-aborted'),
  effectApplied: kernelName('effect-applied'),
  effectChanged: kernelName('effect-changed'),
  effectNotApplied: kernelName('effect-not-applied'),
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
  turnEnded: kernelName('turn-ended'),
  unitMoved: kernelName('unit-moved'),
  unitPlaced: kernelName('unit-placed'),
  unitSummoned: kernelName('unit-summoned'),
  unitTurned: kernelName('unit-turned'),
  variableSet: kernelName('variable-set'),
  zonesChanged: kernelName('zones-changed'),
});

/**
 * The events of the course of the battle: only steps of the kernel give them, and a step of a package that gives them
 * breaks the contract.
 */
export const COURSE_EVENTS: readonly KernelEventType[] = Object.freeze([
  KERNEL_EVENTS.battleEnded,
  KERNEL_EVENTS.phaseChanged,
  KERNEL_EVENTS.turnEnded,
  KERNEL_EVENTS.unitPlaced,
]);

/**
 * The events that only the kernel gives while it runs a command; steps cannot give them.
 */
export const RUNNER_EVENTS: readonly KernelEventType[] = Object.freeze([
  KERNEL_EVENTS.commandAborted,
  KERNEL_EVENTS.inputClosed,
  KERNEL_EVENTS.inputRequested,
  KERNEL_EVENTS.rollMade,
  KERNEL_EVENTS.stepsSaved,
]);
