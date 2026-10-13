import type { CommandKind, EventKind, StepKind } from '../kinds/index.ts';
import type { Extension } from '../names/index.ts';

/**
 * An extension of the kernel. A package with extensions exports a list of them, and the point of assembly passes the
 * lists of all its packages to `createKernel`.
 */
export type KernelExtension
  = | CommandKind
    | ConditionExtension
    | EventKind
    | MechanicExtension
    | OperationExtension
    | StepKind
    | TopologyExtension;

/**
 * The kinds of extensions that the kernel keeps in its registries.
 */
export type KernelExtensionKind = KernelExtension['kind'];

/**
 * A check such as "adjacent cell" that content uses in conditions.
 */
export interface ConditionExtension extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'condition';
}

/**
 * A variant of a mechanic that rulesets refer to, such as the turn order or the attack calculation.
 */
export interface MechanicExtension extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'mechanic';
}

/**
 * An operation such as damage, healing or summoning that content combines into behavior.
 */
export interface OperationExtension extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'operation';
}

/**
 * A field topology, such as hexes.
 */
export interface TopologyExtension extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'topology';
}

/**
 * Every kind of extension the kernel keeps, in alphabetical order.
 */
export const KERNEL_EXTENSION_KINDS = Object.freeze([
  'command',
  'condition',
  'event',
  'mechanic',
  'operation',
  'step',
  'topology',
] as const);
