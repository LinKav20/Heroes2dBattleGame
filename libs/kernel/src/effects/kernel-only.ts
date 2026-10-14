import type { StepResult } from '../extensions/index.ts';
import { KERNEL_ONLY_STEPS } from './names.ts';

/**
 * Checks that an extension of a package adds none of the steps that only the kernel adds.
 *
 * @throws {TypeError} If it adds such a step.
 */
export function checkOwnSteps(source: string, result: StepResult): void {
  if (result.kind !== 'done') return;

  const added = (result.steps ?? []).find(({ type }) => KERNEL_ONLY_STEPS.some((only) => only === type));

  if (added !== undefined) {
    throw new TypeError(
      `${JSON.stringify(source)} adds the step ${JSON.stringify(added.type)}, but only the kernel adds such steps.`,
    );
  }
}
