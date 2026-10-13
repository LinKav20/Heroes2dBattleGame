import type { Extension } from './extension.ts';

/**
 * Options of `createRegistry`.
 */
export interface RegistryOptions<T extends Extension> {
  /** Extra keys that must be unique across the registry, if the registry has them. */
  readonly keys?: RegistryKeys<T>;
  /** Extra checks of an extension with a valid name; returns the problems found. */
  readonly check?: (extension: T) => readonly string[];
}

/**
 * Extra keys that must be unique across a registry, such as the URL schemes that channels serve.
 */
export interface RegistryKeys<T extends Extension> {
  /** What the keys are, for example `URL scheme`. It names the keys in error messages. */
  readonly label: string;
  /** Returns the keys of an extension. The registry calls it once per extension. */
  readonly of: (extension: T) => readonly string[];
  /** Tells whether a key has the right form. Without it any non-empty string is a valid key. */
  readonly valid?: (key: string) => boolean;
}
