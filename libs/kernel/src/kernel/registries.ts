import { ABILITY_STEP_KINDS } from '../abilities/index.ts';
import { EFFECT_STEP_KINDS, KERNEL_OPERATION_KINDS } from '../effects/index.ts';
import { KERNEL_EVENT_KINDS } from '../events/index.ts';
import { KERNEL_CONDITION_KINDS, KERNEL_FORMULA_KINDS } from '../expressions/index.ts';
import {
  KERNEL_EXTENSION_KINDS,
  type CommandKind,
  type ConditionExtension,
  type EventKind,
  type FormulaExtension,
  type KernelExtensionKind,
  type MechanicExtension,
  type OperationExtension,
  type RegisteredExtension,
  type StepKind,
  type TopologyExtension,
} from '../extensions/index.ts';
import { createRegistry, indexRegistry, type Registry } from '../names/index.ts';
import { operationStep, UNIT_OPERATION_KINDS } from '../operations/index.ts';
import { extensionProblems } from './extension-checks.ts';

/**
 * The kernel registries, one per kind of extension.
 */
export interface KernelRegistries {
  /** Kinds of game commands that packages with extensions declare. */
  readonly commands: Registry<CommandKind>;
  /** Nodes of conditions in content, such as "and" or "adjacent cell", those of the kernel included. */
  readonly conditions: Registry<ConditionExtension>;
  /** Kinds of events with their versions, schemas and migrations, those of the kernel included. */
  readonly events: Registry<EventKind>;
  /** Nodes of formulas in content, such as a dice roll or a sum, those of the kernel included. */
  readonly formulas: Registry<FormulaExtension>;
  /** Variants of the mechanics that rulesets refer to, such as the turn order or the attack calculation. */
  readonly mechanics: Registry<MechanicExtension>;
  /** Operations such as damage or healing that content combines into behavior, those of the kernel included. */
  readonly operations: Registry<OperationExtension>;
  /** Kinds of steps of commands with their versions and migrations, those of the kernel included. */
  readonly steps: Registry<StepKind>;
  /** Field topologies, such as hexes. */
  readonly topologies: Registry<TopologyExtension>;
}

/**
 * Checks the extensions of the point of assembly, adds the extensions of the kernel and builds one registry per kind.
 * The full name and the short name of an extension are unique across all registries.
 *
 * @throws {TypeError} If any extension is invalid or clashes with another one. The message lists every problem found.
 */
export function createKernelRegistries(extensions: readonly RegisteredExtension[]): KernelRegistries {
  const ready: { operations?: Registry<OperationExtension> } = {};
  const kernelExtensions = [
    ...KERNEL_CONDITION_KINDS,
    ...KERNEL_EVENT_KINDS,
    ...KERNEL_FORMULA_KINDS,
    ...KERNEL_OPERATION_KINDS,
    ...UNIT_OPERATION_KINDS,
    ...ABILITY_STEP_KINDS,
    ...EFFECT_STEP_KINDS,
    operationStep(() => {
      if (ready.operations === undefined) throw new TypeError('The registries of the kernel are not ready yet.');

      return ready.operations;
    }),
  ];
  const builtIn = new Set<RegisteredExtension>(kernelExtensions);
  const all = createRegistry<RegisteredExtension>('kernel', [...extensions, ...kernelExtensions], {
    check: (extension) => (builtIn.has(extension) ? [] : extensionProblems(extension)),
  });
  const registries: KernelRegistries = {
    commands: registryOf(all, 'command'),
    conditions: registryOf(all, 'condition'),
    events: registryOf(all, 'event'),
    formulas: registryOf(all, 'formula'),
    mechanics: registryOf(all, 'mechanic'),
    operations: registryOf(all, 'operation'),
    steps: registryOf(all, 'step'),
    topologies: registryOf(all, 'topology'),
  };
  const registered = KERNEL_EXTENSION_KINDS.reduce(
    (sum, kind) => sum + registries[REGISTRY_NAMES[kind]].extensions.length,
    0,
  );

  if (registered !== all.extensions.length) throw new TypeError('A kind of extension has no registry.');

  ready.operations = registries.operations;

  return Object.freeze(registries);
}

const REGISTRY_NAMES: Readonly<Record<KernelExtensionKind, keyof KernelRegistries>> = {
  command: 'commands',
  condition: 'conditions',
  event: 'events',
  formula: 'formulas',
  mechanic: 'mechanics',
  operation: 'operations',
  step: 'steps',
  topology: 'topologies',
};

function registryOf<Kind extends KernelExtensionKind>(
  all: Registry<RegisteredExtension>,
  kind: Kind,
): Registry<Extract<RegisteredExtension, { readonly kind: Kind }>> {
  const extensions = all.extensions.filter(
    (extension): extension is Extract<RegisteredExtension, { readonly kind: Kind }> => extension.kind === kind,
  );

  return indexRegistry(kind, extensions);
}
