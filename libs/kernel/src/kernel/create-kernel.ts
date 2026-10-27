import type { AbilityRequest } from '../abilities/index.ts';
import type { BattleOptions } from '../battle/index.ts';
import type { ContentRegistry } from '../content/index.ts';
import { ReactionIndex } from '../effects/index.ts';
import { applyEvent, migrateEvent, type MigrationResult } from '../events/index.ts';
import {
  attributeValues,
  availableActions,
  battleField,
  checkAbility,
  checkContent,
  createState,
  execute,
  simulate,
  turnQueue,
  type ExecuteResult,
  type SimulatedRolls,
} from '../execution/index.ts';
import { AttributeCache } from '../expressions/index.ts';
import type { FieldGeometry, KernelExtension } from '../extensions/index.ts';
import { FieldCache } from '../geometry/index.ts';
import type { ContentName, Visibility } from '../ids/index.ts';
import {
  KERNEL_STATE_VERSION,
  type BattleEvent,
  type BattleState,
  type Command,
  type EventBatch,
  type GameCommand,
  type Rejection,
  type SideTarget,
  type StateFormatVersion,
  type TurnHolder,
  type UnitTarget,
} from '../model/index.ts';
import type { Extension, ExtensionData } from '../names/index.ts';
import { projectEvents, projectState, type ProjectionSetup } from '../projection/index.ts';
import { createKernelRegistries, type KernelRegistries } from './registries.ts';

/**
 * Options of {@link createKernel}.
 */
export interface KernelOptions {
  /** The extensions of all packages with extensions, in any order. */
  readonly extensions: readonly KernelExtension[];
}

/**
 * What a command would do with the lowest and with the highest rolls: two scenarios of its result, not the bounds of
 * damage and losses, because independent rolls can mix, for example a weak strike and a strong strike back.
 */
export interface Forecast {
  /** The command with every die at its lowest side. */
  readonly lowest: ExecuteResult;
  /** The command with every die at its highest side. */
  readonly highest: ExecuteResult;
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
   * The version of the state format of the battles the kernel creates: the version of the part of the kernel, of the
   * data of every extension that declares data, and of every kind of step. A saved state of another format must be
   * rebuilt from the journal.
   */
  readonly stateFormat: StateFormatVersion;
  /**
   * Creates the state of a new battle from a scenario of the content and the options of the consumer, with the effects
   * of the scenario applied and every unit at the values it starts with. The battle starts with deployment; when no
   * side has units to deploy, the phase has an empty list of deploying sides, and the arbiter sends `start-battle` as
   * the first command, which the access policy treats as a command of the system.
   *
   * @throws {ContentError} If the scenario, its ruleset or a definition they refer to is wrong, for example the
   * ruleset chooses no order of turns or a variant that no package declares.
   * @throws {TypeError} If the options are wrong, for example change a unit the scenario does not have, no package
   * declares the topology of the field, or the effects of the scenario ask for a value from outside.
   */
  readonly createState: (options: BattleOptions, content: ContentRegistry) => BattleState;
  /**
   * Applies an event in the current version of its format and returns the new state; the input does not change.
   *
   * @throws {TypeError} If the kind of event is unknown, the event is not migrated, or an event of an extension
   * changes something other than the data of its package.
   * @throws {RangeError} If the event does not fit the state, for example a full state gets `kernel:hidden`,
   * `kernel:data-changed` or a hidden input request, which only a projection takes.
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
   * @throws {TypeError} If the state is a projection, on which only `simulate` runs commands, the content is not the
   * content of the battle, or an extension of the point of assembly breaks the contract of the kernel, for example a
   * step refers to an unknown kind of event or needs a roll without dice, or adds a step that only the kernel adds. A
   * rejection with the code `rule-violation` means only that the rules forbid the command.
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
   * An open input request and the end of the battle forbid it with the same reasons as the command. The check has no
   * side effects and rolls no dice.
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
  /**
   * Returns the projection of a full state for an actor with the visibility: the battle without what the actor must
   * not see, and never with the random number generator. The hash of a projection is `hashJson` of it. Applying the
   * events of a batch from `projectEvents` to the projection of the state before the batch gives exactly the
   * projection of the state after it. An error that the function `project` of the data of a package throws comes out
   * as it is.
   *
   * @throws {TypeError} If the state is a projection already, the content is not the content of the battle, or the
   * visibility names a side twice or a side the battle does not have.
   */
  readonly project: (state: BattleState, content: ContentRegistry, visibility: Visibility) => BattleState;
  /**
   * Returns the events of a batch, given to the full state `state`, as an actor with the visibility sees them: every
   * event keeps its number, an event the actor does not see becomes `kernel:hidden`, and one more
   * `kernel:data-changed`, numbered after the last event, may end the batch. An event of a package comes as it is only
   * if it applies to the copy the actor will have and gives there exactly the data the actor sees after it.
   *
   * @throws {TypeError} If the state is a projection already, the content is not the content of the battle, the
   * visibility names a side twice or a side the battle does not have, the kind of an event is unknown or an event is
   * not migrated, as `applyEvent` throws.
   * @throws {RangeError} If an event does not fit the state, as `applyEvent` throws.
   */
  readonly projectEvents: (
    state: BattleState,
    events: EventBatch,
    content: ContentRegistry,
    visibility: Visibility,
  ) => EventBatch;
  /**
   * Runs a command as `execute` does, on a full state or a projection, but rolls every die at once at its lowest or
   * highest side and never touches the generator; with `none` a step that needs any value is left out. On a
   * projection for sides it counts the firings of triggers of its own command from zero, so triggers with a limit stop
   * as in the battle. A projection for sides keeps no saved steps, so on it only an answer to a request the simulation
   * opened runs. An agent tries commands with it; the arbiter never runs commands so.
   *
   * @throws {ContentError} If a definition, a node or a value is described wrongly.
   * @throws {TypeError} If the content is not the content of the battle, the command answers a request of the battle on
   * a projection for sides, or an extension breaks the contract.
   */
  readonly simulate: (
    state: BattleState,
    command: Command,
    content: ContentRegistry,
    rolls: SimulatedRolls,
  ) => ExecuteResult;
  /**
   * Returns what a command would do with the lowest and with the highest rolls: two scenarios, not guaranteed bounds
   * of damage and losses, since a mix of low and high rolls can give a result outside both. Without random values
   * both results are the same.
   *
   * @throws {ContentError} If a definition, a node or a value is described wrongly.
   * @throws {TypeError} If the content is not the content of the battle, or an extension breaks the contract.
   */
  readonly forecast: (state: BattleState, command: Command, content: ContentRegistry) => Forecast;
  /**
   * Returns who has the next turns, the current one first, as if every holder ended its turn at once, without rolls
   * and choices. An open input request does not stop the queue, but on a projection for sides, which keeps no saved
   * steps, the queue is empty while a request between turns is open. On a projection for sides the queue sees only
   * what the sides see and may differ from the battle, for the units they see too.
   *
   * @throws {RangeError} If the number of turns is not a whole number from 0.
   * @throws {ContentError} If a step of the course of the battle rejects with a reason of a formula, or the course of
   * the battle goes beyond the limits of steps.
   * @throws {TypeError} If the content is not the content of the battle, or an extension breaks the contract.
   */
  readonly turnQueue: (state: BattleState, content: ContentRegistry, turns: number) => readonly TurnHolder[];
  /**
   * Returns the game commands the holder of the turn or the side that deploys can give now, not only the actions of
   * the turn, each checked by a simulation with the lowest rolls. Commands with a direction, with several targets and
   * commands of packages are not listed. On a full state a listed command passes every check of the command; on a
   * projection the arbiter may still forbid it.
   *
   * @throws {ContentError} If a definition, a node or a value is described wrongly.
   * @throws {TypeError} If the content is not the content of the battle, or an extension breaks the contract.
   */
  readonly availableActions: (state: BattleState, content: ContentRegistry) => readonly GameCommand[];
  /**
   * Returns the values of every attribute of the content for a unit or a side now, without the attributes whose
   * formula rejects.
   *
   * @throws {TypeError} If the content is not the content of the battle, or the unit or the side is not in it.
   * @throws {ContentError} If a formula of a modifier rolls dice or is described wrongly.
   */
  readonly attributes: (
    state: BattleState,
    content: ContentRegistry,
    of: SideTarget | UnitTarget,
  ) => Readonly<Record<ContentName, number>>;
}

/**
 * Creates a kernel and its registries from the extensions of the point of assembly. The kernel adds its own extensions
 * under the prefix `kernel`.
 *
 * The kernel freezes the objects of the extensions it registers, with their migrations, schemas and data, so the
 * registries and the version of the state format never change; an extension that keeps changing state of its own keeps
 * it elsewhere.
 *
 * Two extensions must not share a full name or a short name, even if they belong to different registries. The prefix
 * `kernel` belongs to the kernel, and other packages cannot use it. Every kind of event and step needs a version and
 * one migration for every older version. A kind of event or command of an extension needs a schema of its payload, and
 * a node of conditions, formulas or operations needs a schema of the node and its function: `test`, `evaluate` or
 * `run`. A kind of event may have a function `target`, and a kind of step a function `migrateEvents`. A topology needs
 * a schema of the parameters of the field and the functions `cells`, `neighbors`, `moveCost`, `distance`, `area` and
 * `footprint`, and may have the functions `directions` and `line`. A variant of a mechanic needs a schema of its
 * parameters and the full name of its mechanic; a mechanic with the prefix `kernel` must be one the kernel has, a
 * variant of the order of turns needs a function `next`, may have the hooks of the moments of the battle and `wait`,
 * and gives turns to a `side` or a `unit` if it says so, a variant of the defense needs a function `defend`, and a
 * variant of the attack needs a function `attack` and may have a function `shoot`. An extension may declare the data it
 * keeps in the state with a version from 1 and a schema.
 *
 * @throws {TypeError} If any extension is invalid or clashes with another one. The message lists every problem found.
 */
export function createKernel(options: KernelOptions): Kernel {
  const registries = createKernelRegistries(options.extensions);
  const caches = { attributes: new AttributeCache(), fields: new FieldCache(), reactions: new ReactionIndex() };
  const stateFormat = formatOf(registries);
  const data = dataOf(registries);

  function projectionSetup(state: BattleState, content: ContentRegistry, visibility: Visibility): ProjectionSetup {
    checkContent(state, content);

    return { content, data, events: registries.events, visibility };
  }

  return Object.freeze({
    applyEvent: (state: BattleState, event: BattleEvent) => applyEvent(registries.events, state, event),
    attributes: (state: BattleState, content: ContentRegistry, of: SideTarget | UnitTarget) =>
      attributeValues(registries, caches, state, content, of),
    availableActions: (state: BattleState, content: ContentRegistry) =>
      availableActions(registries, caches, state, content),
    checkAbility: (state: BattleState, request: AbilityRequest, content: ContentRegistry) =>
      checkAbility(registries, caches, state, request, content),
    createState: (options: BattleOptions, content: ContentRegistry) =>
      createState(registries, caches, stateFormat, options, content),
    execute: (state: BattleState, command: Command, content: ContentRegistry) =>
      execute(registries, caches, state, command, content),
    field: (state: BattleState, content: ContentRegistry) => battleField(registries, caches, state, content),
    forecast: (state: BattleState, command: Command, content: ContentRegistry) => ({
      highest: simulate(registries, caches, state, command, content, 'highest'),
      lowest: simulate(registries, caches, state, command, content, 'lowest'),
    }),
    migrateEvent: (event: BattleEvent) => migrateEvent(registries.events, registries.steps, event),
    project: (state: BattleState, content: ContentRegistry, visibility: Visibility) =>
      projectState(state, projectionSetup(state, content, visibility)),
    projectEvents: (state: BattleState, events: EventBatch, content: ContentRegistry, visibility: Visibility) =>
      projectEvents(state, events, projectionSetup(state, content, visibility)),
    registries,
    simulate: (state: BattleState, command: Command, content: ContentRegistry, rolls: SimulatedRolls) =>
      simulate(registries, caches, state, command, content, rolls),
    stateFormat,
    turnQueue: (state: BattleState, content: ContentRegistry, turns: number) =>
      turnQueue(registries, caches, state, content, turns),
  });
}

function formatOf(registries: KernelRegistries): StateFormatVersion {
  const extensions = Object.fromEntries([...dataOf(registries)].map(([name, { version }]) => [name, version]));
  const steps = Object.fromEntries(registries.steps.extensions.map(({ name, version }) => [name, version]));

  return Object.freeze({
    extensions: Object.freeze(extensions),
    kernel: KERNEL_STATE_VERSION,
    steps: Object.freeze(steps),
  });
}

function dataOf(registries: KernelRegistries): ReadonlyMap<string, ExtensionData> {
  const all = Object.values(registries).flatMap((registry: KernelRegistries[keyof KernelRegistries]) =>
    registry.extensions.map((extension: Extension) => extension));

  return new Map(all.flatMap(({ data, name }) => (data === undefined ? [] : [[name, data] as const])));
}
