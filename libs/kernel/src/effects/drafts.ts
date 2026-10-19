import type { StepDraft } from '../extensions/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import type {
  ApplicationParams,
  RemovalParams,
  TickParams,
  TurnParams,
} from './params.ts';

/**
 * Returns the step that applies an effect.
 */
export function applicationDraft(params: ApplicationParams): StepDraft<ApplicationParams> {
  return { params, type: KERNEL_STEPS.effectApplication };
}

/**
 * Returns the step that removes an applied effect.
 */
export function removalDraft(params: RemovalParams): StepDraft<RemovalParams> {
  return { params, type: KERNEL_STEPS.effectRemoval };
}

/**
 * Returns the step that counts down effects at a moment of the battle.
 */
export function tickDraft(params: TickParams): StepDraft<TickParams> {
  return { params, type: KERNEL_STEPS.effectTick };
}

/**
 * Returns the step in which an effect runs its operations of every turn.
 */
export function turnDraft(params: TurnParams): StepDraft<TurnParams> {
  return { params, type: KERNEL_STEPS.effectTurn };
}

/**
 * Returns the step that brings the auras that cover units and the hazard zones they stand in up to date.
 */
export function areaRefreshDraft(): StepDraft {
  return { params: {}, type: KERNEL_STEPS.areaRefresh };
}

/**
 * Returns the step that brings the marks of activity of effects up to date.
 */
export function refreshDraft(): StepDraft {
  return { params: {}, type: KERNEL_STEPS.effectRefresh };
}
