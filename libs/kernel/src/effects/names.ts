import { kernelName } from '../names/index.ts';

/**
 * The full names of the kinds of steps that the kernel registers itself.
 */
export const KERNEL_STEPS = Object.freeze({
  effectApplication: kernelName('effect-application'),
  effectRefresh: kernelName('effect-refresh'),
  effectRemoval: kernelName('effect-removal'),
  effectTick: kernelName('effect-tick'),
  operation: kernelName('operation'),
  reaction: kernelName('reaction'),
});

/**
 * The full names of the operations that the kernel registers itself.
 */
export const KERNEL_OPERATIONS = Object.freeze({
  applyEffect: kernelName('apply-effect'),
  removeEffects: kernelName('remove-effects'),
  setVariable: kernelName('set-variable'),
});
