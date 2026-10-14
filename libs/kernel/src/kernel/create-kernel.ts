import type { ContentRegistry } from '../content/index.ts';
import { applyEvent, migrateEvent, type MigrationResult } from '../events/index.ts';
import { execute, type ExecuteResult } from '../execution/index.ts';
import { AttributeCache } from '../expressions/index.ts';
import type { KernelExtension } from '../extensions/index.ts';
import type { BattleEvent, BattleState, Command } from '../model/index.ts';
import { createKernelRegistries, type KernelRegistries } from './registries.ts';

/**
 * Options of {@link createKernel}.
 */
export interface KernelOptions {
  /** The extensions of all packages with extensions, in any order. */
  readonly extensions: readonly KernelExtension[];
}

/**
 * A kernel with its own registries. The kernel keeps no state in module variables, so two kernels never share
 * extensions. It keeps the values of attributes it has calculated for a state until the state is no longer used.
 */
export interface Kernel {
  /** The registries the kernel was created with, its own extensions included. They never change. */
  readonly registries: KernelRegistries;
  /**
   * Applies an event in the current version of its format and returns the new state; the input does not change.
   *
   * @throws {TypeError} If the kind of event is unknown, the event is not migrated, or an event of an extension
   * changes something other than the data of its package.
   * @throws {RangeError} If the event does not fit the state.
   */
  readonly applyEvent: (state: BattleState, event: BattleEvent) => BattleState;
  /**
   * Moves an event from a journal to the current version of its format, saved steps included, or tells why the
   * kernel cannot read it.
   */
  readonly migrateEvent: (event: BattleEvent) => MigrationResult;
  /**
   * Checks a command and runs it step by step, or rejects it by the rules. The function has no side effects. A step
   * that needs a value from outside makes the kernel open an input request and stop; the answer goes on from there.
   * If the rules forbid the rest of the command after an answer, the kernel accepts the answer and aborts the command
   * with `kernel:command-aborted`.
   *
   * @throws {TypeError} If the content is not the content of the battle, or an extension of the point of assembly
   * breaks the contract of the kernel, for example a step refers to an unknown kind of event or needs a roll without
   * dice. A rejection with the code `rule-violation` means only that the rules forbid the command.
   */
  readonly execute: (state: BattleState, command: Command, content: ContentRegistry) => ExecuteResult;
}

/**
 * Creates a kernel and its registries from the extensions of the point of assembly. The kernel adds its own
 * extensions under the prefix `kernel`.
 *
 * Two extensions must not share a full name or a short name, even if they belong to different registries. The prefix
 * `kernel` belongs to the kernel, and other packages cannot use it. Every kind of event and step needs a version and
 * one migration for every older version; a kind of event or command of an extension needs a schema of its payload.
 *
 * @throws {TypeError} If any extension is invalid or clashes with another one. The message lists every problem found.
 */
export function createKernel(options: KernelOptions): Kernel {
  const registries = createKernelRegistries(options.extensions);
  const cache = new AttributeCache();

  return Object.freeze({
    applyEvent: (state: BattleState, event: BattleEvent) => applyEvent(registries.events, state, event),
    execute: (state: BattleState, command: Command, content: ContentRegistry) =>
      execute(registries, cache, state, command, content),
    migrateEvent: (event: BattleEvent) => migrateEvent(registries.events, registries.steps, event),
    registries,
  });
}
