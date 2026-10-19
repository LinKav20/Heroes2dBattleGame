import type { ContentRegistry } from '../content/index.ts';
import type { ReactionIndex } from '../effects/index.ts';
import type { AttributeCache } from '../expressions/index.ts';
import type {
  CommandKind,
  ConditionExtension,
  EventKind,
  FormulaExtension,
  StepKind,
  TopologyExtension,
} from '../extensions/index.ts';
import type { FieldCache } from '../geometry/index.ts';
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
  /** Field topologies. */
  readonly topologies: Registry<TopologyExtension>;
}

/**
 * What the kernel keeps between commands: the values of attributes and tags, which effects react to which events and
 * the cells of fields. They are held for the objects of the state, the content and the parameters of the field, which
 * therefore never change in place.
 */
export interface ExecutionCaches {
  /** The values of attributes and tags calculated before. */
  readonly attributes: AttributeCache;
  /** Which effects of content react to which kinds of events. */
  readonly reactions: ReactionIndex;
  /** The cells of fields the kernel has asked topologies for. */
  readonly fields: FieldCache;
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
