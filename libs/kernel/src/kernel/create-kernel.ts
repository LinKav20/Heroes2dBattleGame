import type { AbilityRequest } from '../abilities/index.ts';
import type { ContentRegistry } from '../content/index.ts';
import { ReactionIndex } from '../effects/index.ts';
import { applyEvent, migrateEvent, type MigrationResult } from '../events/index.ts';
import { battleField, checkAbility, execute, type ExecuteResult } from '../execution/index.ts';
import { AttributeCache } from '../expressions/index.ts';
import type { FieldGeometry, KernelExtension } from '../extensions/index.ts';
import { FieldCache } from '../geometry/index.ts';
import type { BattleEvent, BattleState, Command, Rejection } from '../model/index.ts';
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
 * extensions. It keeps the values of attributes and tags it has calculated for a state and the content, which effects
 * of the content react to which events, and the cells of a field, until they are no longer used. So a state and a
 * content given to the kernel must never change in place, and the same content is best given as the same object. A
 * state read back from JSON is a new object, so the kernel calculates its values anew.
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
   * Checks a command and runs it step by step, or rejects it by the rules. The function has no observable side
   * effects. A step that needs a value from outside makes the kernel open an input request and stop; the answer goes
   * on from there. If the rules forbid the rest of the command after an answer, the kernel accepts the answer and
   * aborts the command with `kernel:command-aborted`.
   *
   * @throws {ContentError} If the content describes a definition, a node or a value wrongly, for example refers to a
   * node that no package declares or divides by zero. It is a `TypeError` with the name `ContentError`, so a pack can
   * be told from a bug of the point of assembly by the name of the error.
   * @throws {TypeError} If the content is not the content of the battle, or an extension of the point of assembly
   * breaks the contract of the kernel, for example a step refers to an unknown kind of event or needs a roll without
   * dice, or adds a step that only the kernel adds. A rejection with the code `rule-violation` means only that the
   * rules forbid the command.
   */
  readonly execute: (state: BattleState, command: Command, content: ContentRegistry) => ExecuteResult;
  /**
   * Returns the field of a state with the units and obstacles on it, for example to show where a unit can go. The
   * methods of the field throw as {@link FieldGeometry} describes.
   *
   * @throws {TypeError} If the content is not the content of the battle.
   */
  readonly field: (state: BattleState, content: ContentRegistry) => FieldGeometry;
  /**
   * Checks whether a unit or a side can use an ability or an item now, as the command to use it would check it, and
   * returns why the rules forbid it, or nothing if they allow it, for example to show which abilities are available.
   * The check has no side effects and rolls no dice.
   *
   * @throws {ContentError} If a definition is wrong, or the requirement or the filter of targets rolls dice.
   * @throws {TypeError} If the content is not the content of the battle, or the unit, the side or the item of the
   * request is not in the battle.
   */
  readonly checkAbility: (
    state: BattleState,
    request: AbilityRequest,
    content: ContentRegistry,
  ) => Rejection | undefined;
}

/**
 * Creates a kernel and its registries from the extensions of the point of assembly. The kernel adds its own
 * extensions under the prefix `kernel`.
 *
 * Two extensions must not share a full name or a short name, even if they belong to different registries. The prefix
 * `kernel` belongs to the kernel, and other packages cannot use it. Every kind of event and step needs a version and
 * one migration for every older version. A kind of event or command of an extension needs a schema of its payload,
 * and a node of conditions, formulas or operations needs a schema of the node and its function: `test`, `evaluate` or
 * `run`. A kind of event may have a function `target`, and a kind of step a function `migrateEvents`. A topology
 * needs a schema of the parameters of the field and the functions `cells`, `neighbors`, `moveCost`, `distance`, `area`
 * and `footprint`.
 *
 * @throws {TypeError} If any extension is invalid or clashes with another one. The message lists every problem found.
 */
export function createKernel(options: KernelOptions): Kernel {
  const registries = createKernelRegistries(options.extensions);
  const caches = { attributes: new AttributeCache(), fields: new FieldCache(), reactions: new ReactionIndex() };

  return Object.freeze({
    applyEvent: (state: BattleState, event: BattleEvent) => applyEvent(registries.events, state, event),
    checkAbility: (state: BattleState, request: AbilityRequest, content: ContentRegistry) =>
      checkAbility(registries, caches, state, request, content),
    execute: (state: BattleState, command: Command, content: ContentRegistry) =>
      execute(registries, caches, state, command, content),
    field: (state: BattleState, content: ContentRegistry) => battleField(registries, caches, state, content),
    migrateEvent: (event: BattleEvent) => migrateEvent(registries.events, registries.steps, event),
    registries,
  });
}
