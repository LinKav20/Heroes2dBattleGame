import type { StepContext, StepKind, StepResult } from '../extensions/index.ts';

/**
 * Returns a frozen kind of step of the kernel in version 1 without migrations, with a function that migrates events
 * held in its parameters if the step keeps any.
 */
export function kernelStep<Params extends object = object>(
  name: string,
  run: (context: StepContext<Params>) => StepResult,
  migrateEvents?: StepKind<Params>['migrateEvents'],
): StepKind<Params> {
  const kind: StepKind<Params> = { kind: 'step', migrations: [], name, run, version: 1 };

  return Object.freeze(migrateEvents === undefined ? kind : { ...kind, migrateEvents });
}
