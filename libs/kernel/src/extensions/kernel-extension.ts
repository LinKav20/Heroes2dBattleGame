import type { CommandKind } from './command-kind.ts';
import type { EventKind, ExtensionEventKind } from './event-kind.ts';
import type { ConditionExtension, FormulaExtension } from './expressions.ts';
import type { MechanicExtension } from './mechanics.ts';
import type { OperationExtension } from './operations.ts';
import type { StepKind } from './step-kind.ts';
import type { TopologyExtension } from './topology.ts';

/**
 * An extension of the kernel. A package with extensions exports a list of them, and the point of assembly passes the
 * lists of all its packages to `createKernel`.
 */
export type KernelExtension
  = | CommandKind
    | ConditionExtension
    | ExtensionEventKind
    | FormulaExtension
    | MechanicExtension
    | OperationExtension
    | StepKind
    | TopologyExtension;

/**
 * An extension that the kernel keeps in a registry: an extension of a package or a built-in extension of the kernel.
 */
export type RegisteredExtension = EventKind | KernelExtension;

/**
 * The kinds of extensions that the kernel keeps in its registries.
 */
export type KernelExtensionKind = KernelExtension['kind'];

/**
 * Every kind of extension the kernel keeps, in alphabetical order.
 */
export const KERNEL_EXTENSION_KINDS = Object.freeze([
  'command',
  'condition',
  'event',
  'formula',
  'mechanic',
  'operation',
  'step',
  'topology',
] as const satisfies readonly KernelExtensionKind[]);
