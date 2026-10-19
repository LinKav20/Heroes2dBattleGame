import type { StepKind } from '../extensions/index.ts';
import { APPLICATION_STEP } from './application.ts';
import { AREA_REFRESH_STEP } from './areas.ts';
import { REACTION_STEP } from './reaction-step.ts';
import { REFRESH_STEP } from './refresh.ts';
import { REMOVAL_STEP } from './removal.ts';
import { TICK_STEP } from './ticks.ts';
import { TURN_STEP } from './turn.ts';

/**
 * The kinds of steps of effects that the kernel registers itself: application, removal, counting and operations of
 * every turn of effects, reactions to events, the refresh of the marks of activity and of auras and zones.
 */
export const EFFECT_STEP_KINDS: readonly StepKind[] = Object.freeze([
  APPLICATION_STEP,
  AREA_REFRESH_STEP,
  REACTION_STEP,
  REFRESH_STEP,
  REMOVAL_STEP,
  TICK_STEP,
  TURN_STEP,
]);
