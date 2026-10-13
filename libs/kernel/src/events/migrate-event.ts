import type { EventKind, Migration, StepKind } from '../extensions/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { BattleEvent, Step } from '../model/index.ts';
import type { Registry } from '../names/index.ts';
import { isRecord } from '../shared/index.ts';
import { isKernelEvent, KERNEL_EVENTS, type KernelEvent } from './built-in/index.ts';

/**
 * The result of migrating an event to the current version: the migrated event, or why the kernel cannot read it.
 */
export type MigrationResult = MigrationFailure | MigrationSuccess;

/**
 * Why the kernel cannot read an event.
 */
export type MigrationFailureReason = (typeof MIGRATION_FAILURES)[keyof typeof MIGRATION_FAILURES];

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
 * Why the kernel cannot read an event: the point of assembly has no code for its kind or for a step saved in it, a
 * version is newer than the code, or a version is not a whole number from 1.
 */
export interface MigrationFailure {
  /** Marks a failed migration. */
  readonly ok: false;
  /** The reason. */
  readonly reason: MigrationFailureReason;
  /** The full name of the kind of event or step. */
  readonly name: string;
  /** The version written in the event or the step. */
  readonly version: number;
}

/**
 * The reasons why the kernel cannot read an event from a journal.
 */
export const MIGRATION_FAILURES = Object.freeze({
  invalidVersion: 'invalid-version',
  newerVersion: 'newer-version',
  unknownEvent: 'unknown-event',
  unknownStep: 'unknown-step',
} as const);

/**
 * Moves an event to the current version of its format, one version at a time, together with the steps saved in
 * `kernel:steps-saved`. The input does not change.
 *
 * Returns why the event cannot be read if the point of assembly has no code for its kind or for a saved step, or if a
 * version is newer than the code or is not a whole number from 1.
 *
 * @throws {TypeError} If a migration returns step parameters that are not an object.
 */
export function migrateEvent(
  events: Registry<EventKind>,
  steps: Registry<StepKind>,
  event: BattleEvent,
): MigrationResult {
  const kind = events.get(event.type);

  if (kind === undefined) return failure(MIGRATION_FAILURES.unknownEvent, event.type, event.version);

  const versionProblem = checkVersion(kind, event.type, event.version);

  if (versionProblem !== undefined) return versionProblem;

  const migrated: BattleEvent = event.version === kind.version
    ? event
    : { ...event, payload: migrateValue(kind, event.version, event.payload), version: kind.version };

  return isKernelEvent(migrated, KERNEL_EVENTS.stepsSaved) ? migrateSavedSteps(steps, migrated) : success(migrated);
}

function migrateSavedSteps(
  steps: Registry<StepKind>,
  event: KernelEvent<typeof KERNEL_EVENTS.stepsSaved>,
): MigrationResult {
  const { payload } = event;
  const saved: Step[] = [];

  for (const step of payload.steps) {
    const result = migrateStep(steps, step);

    if ('reason' in result) return result;

    saved.push(result);
  }

  const unchanged = saved.every((step, index) => step === payload.steps[index]);

  return success(unchanged ? event : { ...event, payload: { ...payload, steps: saved } });
}

function migrateStep(steps: Registry<StepKind>, step: Step): MigrationFailure | Step {
  const kind = steps.get(step.type);

  if (kind === undefined) return failure(MIGRATION_FAILURES.unknownStep, step.type, step.version);

  const versionProblem = checkVersion(kind, step.type, step.version);

  if (versionProblem !== undefined) return versionProblem;

  if (step.version === kind.version) return step;

  const params = migrateValue(kind, step.version, step.params);

  if (!isRecord(params)) {
    throw new TypeError(`A migration of the step ${JSON.stringify(step.type)} returned no object of parameters.`);
  }

  return { ...step, params: params as JsonObject, version: kind.version };
}

function checkVersion(kind: { readonly version: number }, name: string, version: number): MigrationFailure | undefined {
  if (!Number.isSafeInteger(version) || version < 1) return failure(MIGRATION_FAILURES.invalidVersion, name, version);

  return version > kind.version ? failure(MIGRATION_FAILURES.newerVersion, name, version) : undefined;
}

function migrateValue(
  kind: { readonly migrations: readonly Migration[]; readonly name: string; readonly version: number },
  from: number,
  value: unknown,
): unknown {
  let current = value;

  for (let version = from; version < kind.version; version += 1) {
    const migration = kind.migrations.find((candidate) => candidate.from === version);

    if (migration === undefined) {
      throw new TypeError(`${JSON.stringify(kind.name)} has no migration from version ${String(version)}.`);
    }

    current = migration.migrate(current);
  }

  return current;
}

function success(event: BattleEvent): MigrationSuccess {
  return { event, ok: true };
}

function failure(reason: MigrationFailureReason, name: string, version: number): MigrationFailure {
  return { name, ok: false, reason, version };
}
