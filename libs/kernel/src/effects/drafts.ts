import type { Op } from '../content/index.ts';
import type { StepDraft, Subjects } from '../extensions/index.ts';
import type { EffectHolder } from '../model/index.ts';
import { KERNEL_STEPS } from './names.ts';
import type { ApplicationParams, OperationParams, RemovalParams, TickParams } from './params.ts';

/**
 * Returns the steps that run operations of content one after another with the given participants.
 */
export function operationDrafts(ops: readonly Op[], subjects: Subjects): ReadonlyArray<StepDraft<OperationParams>> {
  return ops.map((op) => ({ params: { op, subjects }, type: KERNEL_STEPS.operation }));
}

/**
 * Returns the step that applies an effect.
 */
export function applicationDraft(params: ApplicationParams): StepDraft<ApplicationParams> {
  return { params, type: KERNEL_STEPS.effectApplication };
}

/**
 * Returns the step that removes an applied effect.
 */
export function removalDraft(holder: EffectHolder, effect: number): StepDraft<RemovalParams> {
  return { params: { effect, holder }, type: KERNEL_STEPS.effectRemoval };
}

/**
 * Returns the step that counts down effects at a moment of the battle.
 */
export function tickDraft(params: TickParams): StepDraft<TickParams> {
  return { params, type: KERNEL_STEPS.effectTick };
}
