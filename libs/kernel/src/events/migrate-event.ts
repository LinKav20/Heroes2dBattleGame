import type { JsonObject } from '../json/index.ts';
import type { BattleEvent, Step } from '../model/index.ts';
import type { Registry } from '../names/index.ts';
import type { EventKind, Migration, StepKind } from '../kinds/index.ts';
import { isRecord } from '../shared/index.ts';
import { isKernelEvent, KERNEL_EVENTS } from './kernel/index.ts';

/**
 * The result of migrating an event to the current version: the migrated event, or why the kernel cannot read it.
 */
export type MigrationResult = MigrationFailure | MigrationSuccess;

/**
 * An event in the current version of its format.
 */
export interface MigrationSuccess {
  /** Marks a successful migration. */
  readonly ok: true;
  /** The event in the current version; the same object if it was current already. */
  readonly event: BattleEvent;
}

/**
 * Why the kernel cannot read an event: the point of assembly has no code for its kind or for a step saved in it, or
 * the version is newer than the code.
 */
export interface MigrationFailure {
  /** Marks a failed migration. */
  readonly ok: false;
  /** The reason. */
  readonly reason: 'newer-version' | 'unknown-event' | 'unknown-step';
  /** The full name of the kind of event or step. */
  readonly name: string;
  /** The version written in the event or the step. */
  readonly version: number;
}

/**
 * Moves an event to the current version of its format, one version at a time, together with the steps saved in
 * `kernel:steps-saved`. The input does not change.
 *
 * Returns why the event cannot be read if the point of assembly has no code for its kind or for a saved step, or if a
 * version is newer than the code.
 *
 * @throws {TypeError} If a migration returns step parameters that are not a JSON object.
 */
export function migrateEvent(
  events: Registry<EventKind>,
  steps: Registry<StepKind>,
  event: BattleEvent,
): MigrationResult {
  const kind = events.get(event.type);

  if (kind === undefined) return failure('unknown-event', event.type, event.version);

  if (event.version > kind.version) return failure('newer-version', event.type, event.version);

  const migrated: BattleEvent = event.version === kind.version
    ? event
    : { ...event, payload: migrateValue(kind, event.version, event.payload), version: kind.version };

  if (!isKernelEvent(migrated, KERNEL_EVENTS.stepsSaved)) return { event: migrated, ok: true };

  const saved: Step[] = [];

  for (const step of migrated.payload.steps) {
    const result = migrateStep(steps, step);

    if ('reason' in result) return result;

    saved.push(result);
  }

  return { event: { ...migrated, payload: { ...migrated.payload, steps: saved } }, ok: true };
}

function migrateStep(steps: Registry<StepKind>, step: Step): MigrationFailure | Step {
  const kind = steps.get(step.type);

  if (kind === undefined) return failure('unknown-step', step.type, step.version);

  if (step.version > kind.version) return failure('newer-version', step.type, step.version);

  if (step.version === kind.version) return step;

  const params = migrateValue(kind, step.version, step.params);

  if (!isParams(params)) {
    throw new TypeError(`A migration of the step ${JSON.stringify(step.type)} returned no object of parameters.`);
  }

  return { ...step, params, version: kind.version };
}

function migrateValue(kind: { readonly migrations: readonly Migration[] }, from: number, value: unknown): unknown {
  let current = value;

  for (const migration of [...kind.migrations].sort((left, right) => left.from - right.from)) {
    if (migration.from >= from) current = migration.migrate(current);
  }

  return current;
}

function failure(reason: MigrationFailure['reason'], name: string, version: number): MigrationFailure {
  return { name, ok: false, reason, version };
}

function isParams(value: unknown): value is JsonObject {
  return isRecord(value);
}
