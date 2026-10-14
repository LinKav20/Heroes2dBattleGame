import type { ContentRegistry } from '../content/index.ts';
import type { ReactionIndex } from '../effects/index.ts';
import type { AttributeCache } from '../expressions/index.ts';
import type { CommandKind, ConditionExtension, EventKind, FormulaExtension, StepKind } from '../extensions/index.ts';
import type { Registry } from '../names/index.ts';

/**
 * The registries that running a command needs.
 */
export interface ExecutionRegistries {
  /** Kinds of commands of extensions. */
  readonly commands: Registry<CommandKind>;
  /** Nodes of conditions. */
  readonly conditions: Registry<ConditionExtension>;
  /** Kinds of events. */
  readonly events: Registry<EventKind>;
  /** Nodes of formulas. */
  readonly formulas: Registry<FormulaExtension>;
  /** Kinds of steps. */
  readonly steps: Registry<StepKind>;
}

/**
 * What the kernel keeps between commands: the values of attributes and tags and which effects react to which events.
 * Both are held for the objects of the state and the content, which therefore never change in place.
 */
export interface ExecutionCaches {
  /** The values of attributes and tags calculated before. */
  readonly attributes: AttributeCache;
  /** Which effects of content react to which kinds of events. */
  readonly reactions: ReactionIndex;
}

/**
 * What does not change while a command runs: the registries, the content of the battle and what the kernel keeps.
 */
export interface ExecutionContext extends ExecutionCaches {
  /** The registries of the kernel. */
  readonly registries: ExecutionRegistries;
  /** The content of the battle. */
  readonly content: ContentRegistry;
}
