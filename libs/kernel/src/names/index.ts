export {
  extensionPrefix,
  isExtensionName,
  isKernelName,
  KERNEL_PREFIX,
  kernelName,
  prefixOf,
} from './extension-names.ts';
export type { Extension } from './extension.ts';
export type { RegistryKeys, RegistryOptions } from './registry-options.ts';
export { createRegistry, indexRegistry, type Registry } from './registry.ts';
