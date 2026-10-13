import type { ContentRegistry } from '../content/index.ts';
import type { CommandKind, EventKind, StepKind } from '../kinds/index.ts';
import type { Registry } from '../names/index.ts';

/**
 * The registries that running a command needs.
 */
export interface ExecutionRegistries {
  /** Kinds of commands of extensions. */
  readonly commands: Registry<CommandKind>;
  /** Kinds of events. */
  readonly events: Registry<EventKind>;
  /** Kinds of steps. */
  readonly steps: Registry<StepKind>;
}

/**
 * What does not change while a command runs: the registries and the content of the battle.
 */
export interface ExecutionContext {
  /** The registries of the kernel. */
  readonly registries: ExecutionRegistries;
  /** The content of the battle. */
  readonly content: ContentRegistry;
}
