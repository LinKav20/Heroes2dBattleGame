import { compareCodeUnits } from '../shared/index.ts';
import type { Extension } from './extension.ts';
import { checkExtension, describeExtension } from './registry-checks.ts';
import type { RegistryOptions } from './registry-options.ts';

/**
 * A table "name — implementation" that the point of assembly fills at startup and never changes afterwards.
 */
export interface Registry<T extends Extension> {
  /** What the registry holds, in the singular, for example `operation`. It names the registry in error messages. */
  readonly kind: string;
  /** All extensions sorted by their full names in UTF-16 code unit order. */
  readonly extensions: readonly T[];
  /** Finds an extension by its full name. */
  readonly get: (name: string) => T | undefined;
  /** Finds an extension by its short name. */
  readonly getByShortName: (shortName: string) => T | undefined;
  /** Finds an extension by one of its extra keys, such as a URL scheme. */
  readonly getByKey: (key: string) => T | undefined;
}

interface IndexedExtension<T> {
  readonly extension: T;
  readonly keys: readonly string[];
}

/**
 * Creates a registry from a list of extensions.
 *
 * Every extension needs a valid full name, and a short name, if any, must equal the full name without the package
 * prefix. Two extensions must not share a full name, a short name or an extra key. The registry keeps no state in
 * module variables, so every call creates an independent registry.
 *
 * @param kind What the registry holds, in the singular, for error messages.
 * @param extensions The extensions in any order.
 * @param options Extra keys and checks, if the registry has them.
 * @throws {TypeError} If any extension is invalid or two extensions clash. The message lists every problem found.
 */
export function createRegistry<T extends Extension>(
  kind: string,
  extensions: readonly T[],
  options: RegistryOptions<T> = {},
): Registry<T> {
  const problems: string[] = [];
  const valid: Array<IndexedExtension<T>> = [];

  Array.from(extensions).forEach((extension, index) => {
    const result = checkExtension(extension, index, options);

    problems.push(...result.problems);

    if (result.problems.length === 0) valid.push({ extension, keys: result.keys });
  });

  const registry = indexExtensions(kind, valid, options.keys?.label ?? 'key', problems);

  if (problems.length > 0) {
    const list = problems.map((problem) => `- ${problem}`).join('\n');

    throw new TypeError(`Cannot register ${kind} extensions:\n${list}`);
  }

  return registry;
}

/**
 * Builds a registry from extensions that another registry has already checked, in the order of their full names. It
 * checks nothing again and only indexes them.
 */
export function indexRegistry<T extends Extension>(kind: string, extensions: readonly T[]): Registry<T> {
  return indexExtensions(kind, extensions.map((extension) => ({ extension, keys: [] })), 'key', []);
}

function indexExtensions<T extends Extension>(
  kind: string,
  extensions: ReadonlyArray<IndexedExtension<T>>,
  keyLabel: string,
  problems: string[],
): Registry<T> {
  const byName = new Map<string, T>();
  const byShortName = new Map<string, T>();
  const byKey = new Map<string, T>();

  for (const { extension, keys } of extensions) {
    claim(byName, extension.name, extension, 'name', problems);

    if (extension.shortName !== undefined) claim(byShortName, extension.shortName, extension, 'short name', problems);

    for (const key of keys) {
      claim(byKey, key, extension, keyLabel, problems);
    }
  }

  const sorted = Object.freeze(extensions.map(({ extension }) => extension).sort(compareByName));

  return Object.freeze({
    extensions: sorted,
    get: (name: string) => byName.get(name),
    getByKey: (key: string) => byKey.get(key),
    getByShortName: (shortName: string) => byShortName.get(shortName),
    kind,
  });
}

function claim<T extends Extension>(
  table: Map<string, T>,
  key: string,
  extension: T,
  label: string,
  problems: string[],
): void {
  const owner = table.get(key);

  if (owner === undefined) {
    table.set(key, extension);
  } else {
    problems.push(
      `the ${label} ${JSON.stringify(key)} of ${describeExtension(extension)} is taken by ${describeExtension(owner)}`,
    );
  }
}

function compareByName(left: Extension, right: Extension): number {
  return compareCodeUnits(left.name, right.name);
}
