import type { StepDraft, StepResult } from '../extensions/index.ts';
import { isKernelOnlyStep } from '../names/index.ts';

/**
 * Checks that an extension of a package adds none of the steps that only the kernel adds.
 *
 * @throws {TypeError} If it adds such a step.
 */
export function checkOwnSteps(source: string, result: StepResult): void {
  if (result.kind === 'done') checkOwnDrafts(source, result.steps ?? []);
}

/**
 * Checks that the steps a package adds, for example the steps of its command, are none of the steps that only the
 * kernel adds.
 *
 * @throws {TypeError} If one of them is such a step.
 */
export function checkOwnDrafts(source: string, steps: readonly StepDraft[]): void {
  const added = steps.find(({ type }) => isKernelOnlyStep(type));

  if (added !== undefined) {
    throw new TypeError(
      `${JSON.stringify(source)} adds the step ${JSON.stringify(added.type)}, but only the kernel adds such steps.`,
    );
  }
}
