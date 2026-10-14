import { kernelName } from '../names/index.ts';

/**
 * The full name of a kind of step of the kernel.
 */
export type KernelStepType = (typeof KERNEL_STEPS)[keyof typeof KERNEL_STEPS];

/**
 * The full name of an operation of the kernel.
 */
export type KernelOperationType = (typeof KERNEL_OPERATIONS)[keyof typeof KERNEL_OPERATIONS];

/**
 * The full names of the kinds of steps that the kernel registers itself.
 */
export const KERNEL_STEPS = Object.freeze({
  effectApplication: kernelName('effect-application'),
  effectRefresh: kernelName('effect-refresh'),
  effectRemoval: kernelName('effect-removal'),
  effectTick: kernelName('effect-tick'),
  effectTurn: kernelName('effect-turn'),
  operation: kernelName('operation'),
  reaction: kernelName('reaction'),
});

/**
 * The kinds of steps that only the kernel puts on the stack: reactions to events, operations of every turn and the
 * refresh of the marks of activity. A step or an operation of a package that adds them breaks the contract.
 */
export const KERNEL_ONLY_STEPS: readonly KernelStepType[] = Object.freeze([
  KERNEL_STEPS.effectRefresh,
  KERNEL_STEPS.effectTurn,
  KERNEL_STEPS.reaction,
]);

/**
 * The full names of the operations that the kernel registers itself.
 */
export const KERNEL_OPERATIONS = Object.freeze({
  applyEffect: kernelName('apply-effect'),
  removeEffects: kernelName('remove-effects'),
  setVariable: kernelName('set-variable'),
});
