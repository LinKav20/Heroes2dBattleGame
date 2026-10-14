import type { ContentRegistry } from '../content/index.ts';
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
 * What does not change while a command runs: the registries, the content of the battle and the values of attributes
 * the kernel keeps.
 */
export interface ExecutionContext {
  /** The registries of the kernel. */
  readonly registries: ExecutionRegistries;
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** The values of attributes the kernel has calculated before. */
  readonly cache: AttributeCache;
}
