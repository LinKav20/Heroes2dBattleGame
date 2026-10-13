import { KERNEL_EVENT_KINDS } from '../events/index.ts';
import type { CommandKind, EventKind, StepKind } from '../kinds/index.ts';
import { createRegistry, type Registry } from '../names/index.ts';
import { extensionProblems } from './extension-checks.ts';
import type {
  ConditionExtension,
  KernelExtension,
  KernelExtensionKind,
  MechanicExtension,
  OperationExtension,
  TopologyExtension,
} from './extensions.ts';

/**
 * The kernel registries, one per kind of extension.
 */
export interface KernelRegistries {
  /** Kinds of game commands that packages with extensions declare. */
  readonly commands: Registry<CommandKind>;
  /** Checks such as "adjacent cell" that content uses in conditions. */
  readonly conditions: Registry<ConditionExtension>;
  /** Kinds of events with their versions, schemas and migrations, those of the kernel included. */
  readonly events: Registry<EventKind>;
  /** Variants of the mechanics that rulesets refer to, such as the turn order or the attack calculation. */
  readonly mechanics: Registry<MechanicExtension>;
  /** Operations such as damage, healing or summoning that content combines into behavior. */
  readonly operations: Registry<OperationExtension>;
  /** Kinds of steps of commands with their versions and migrations. */
  readonly steps: Registry<StepKind>;
  /** Field topologies, such as hexes. */
  readonly topologies: Registry<TopologyExtension>;
}

/**
 * Checks the extensions of the point of assembly, adds the extensions of the kernel and builds one registry per kind.
 *
 * @throws {TypeError} If any extension is invalid or clashes with another one. The message lists every problem found.
 */
export function createKernelRegistries(extensions: readonly KernelExtension[]): KernelRegistries {
  const builtIn = new Set<KernelExtension>(KERNEL_EVENT_KINDS);
  const all = createRegistry<KernelExtension>('kernel', [...extensions, ...KERNEL_EVENT_KINDS], {
    check: (extension) => (builtIn.has(extension) ? [] : extensionProblems(extension)),
  });

  return Object.freeze({
    commands: registryOf(all, 'command'),
    conditions: registryOf(all, 'condition'),
    events: registryOf(all, 'event'),
    mechanics: registryOf(all, 'mechanic'),
    operations: registryOf(all, 'operation'),
    steps: registryOf(all, 'step'),
    topologies: registryOf(all, 'topology'),
  });
}

function registryOf<Kind extends KernelExtensionKind>(
  all: Registry<KernelExtension>,
  kind: Kind,
): Registry<Extract<KernelExtension, { readonly kind: Kind }>> {
  const extensions = all.extensions.filter(
    (extension): extension is Extract<KernelExtension, { readonly kind: Kind }> => extension.kind === kind,
  );

  return createRegistry(kind, extensions);
}
