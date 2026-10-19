import type { StepKind } from '../extensions/index.ts';
import { ABILITY_TARGETS_STEP } from './targets-step.ts';
import { ABILITY_TICK_STEP } from './tick-step.ts';
import { ABILITY_USE_STEP } from './use-step.ts';

/**
 * The kinds of steps of abilities that the kernel registers itself: the use of an ability, its operations for every
 * target and the moment when the counts of uses start again.
 */
export const ABILITY_STEP_KINDS: readonly StepKind[] = Object.freeze([
  ABILITY_TARGETS_STEP,
  ABILITY_TICK_STEP,
  ABILITY_USE_STEP,
]);
