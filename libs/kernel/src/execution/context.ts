import type { CommandSetup } from '../battle/index.ts';
import type { ContentRegistry } from '../content/index.ts';
import type { ReactionIndex } from '../effects/index.ts';
import type { AttributeCache } from '../expressions/index.ts';
import type {
  CommandKind,
  ConditionExtension,
  EventKind,
  FormulaExtension,
  MechanicExtension,
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
  /** Variants of mechanics. */
  readonly mechanics: Registry<MechanicExtension>;
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
 * How a simulation gets the values steps need: every die at its lowest or highest side, or no values at all, so that a
 * step that needs a value is left out.
 */
export type SimulatedRolls = 'highest' | 'lowest' | 'none';

/**
 * What does not change while a command runs: the registries, the content of the battle, what the kernel keeps and,
 * in a simulation, how the steps get their rolls.
 */
export interface ExecutionContext extends ExecutionCaches {
  /** The registries of the kernel. */
  readonly registries: ExecutionRegistries;
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** How a simulation rolls; a command that really runs has none. */
  readonly rolls?: SimulatedRolls;
}

/**
 * Returns what planning a command needs besides the state: the registries, the caches and the content.
 */
export function commandSetup(
  registries: ExecutionRegistries,
  caches: ExecutionCaches,
  content: ContentRegistry,
): CommandSetup {
  return { attributes: caches.attributes, content, fields: caches.fields, registries };
}
