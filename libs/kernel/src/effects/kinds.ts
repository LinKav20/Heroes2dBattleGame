import type { OperationExtension, StepKind } from '../extensions/index.ts';
import type { Registry } from '../names/index.ts';
import { compareCodeUnits } from '../shared/index.ts';
import { APPLICATION_STEP } from './application.ts';
import { operationStep } from './operation-step.ts';
import { REACTION_STEP } from './reaction-step.ts';
import { REFRESH_STEP } from './refresh.ts';
import { REMOVAL_STEP } from './removal.ts';
import { TICK_STEP } from './ticks.ts';
import { TURN_STEP } from './turn.ts';

/**
 * Returns the kinds of steps that the kernel registers itself, sorted by name. The step that runs operations finds
 * them in the registry of operations of its kernel.
 */
export function kernelStepKinds(operations: () => Registry<OperationExtension>): readonly StepKind[] {
  const kinds: readonly StepKind[] = [
    APPLICATION_STEP,
    REFRESH_STEP,
    REMOVAL_STEP,
    TICK_STEP,
    TURN_STEP,
    operationStep(operations),
    REACTION_STEP,
  ];

  return Object.freeze(kinds.toSorted((left, right) => compareCodeUnits(left.name, right.name)));
}
