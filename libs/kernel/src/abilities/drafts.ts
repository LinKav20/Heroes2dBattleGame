import type { StepDraft } from '../extensions/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import type { AbilityRequest, AbilityTargetsParams, AbilityTickParams } from './params.ts';

/**
 * Returns the step that pays for an ability and runs its operations. Only the kernel puts it on the stack, after the
 * command has checked the ability.
 */
export function abilityUseDraft(request: AbilityRequest): StepDraft<AbilityRequest> {
  return { params: request, type: KERNEL_STEPS.abilityUse };
}

/**
 * Returns the step that runs the operations of an ability for its targets one at a time. Only the kernel puts it on
 * the stack.
 */
export function abilityTargetsDraft(params: AbilityTargetsParams): StepDraft<AbilityTargetsParams> {
  return { params, type: KERNEL_STEPS.abilityTargets };
}

/**
 * Returns the step of the start of the turn of a unit or a side, or of a round: counts of uses of abilities start
 * again, cooldowns go down, a unit gets back its actions of the turn, and resources that are restored at that moment
 * reach their bound. The flow of turns puts it on the stack at the start of every turn and every round.
 */
export function abilityTickDraft(params: AbilityTickParams): StepDraft<AbilityTickParams> {
  return { params, type: KERNEL_STEPS.abilityTick };
}
