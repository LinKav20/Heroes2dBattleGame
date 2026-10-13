import { compareCodeUnits, isRecord } from '../shared/index.ts';
import { isExtensionName } from './extension-names.ts';

/**
 * What every extension declares: its full name and, optionally, a short name.
 *
 * Registries check extensions by the shape of the object, not by its class, so extensions from two installed copies
 * of the same package are accepted alike.
 */
export interface Extension {
  /** The full name `package:name`, for example `rules-stdlib:damage`. */
  readonly name: string;
  /** The name without the package prefix, for example `damage`, if the extension declares a short name. */
  readonly shortName?: string;
}

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

/**
 * Options of {@link createRegistry}.
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

interface Accepted<T> {
  readonly extension: T;
  readonly keys: readonly string[];
}

interface CheckResult {
  readonly problems: readonly string[];
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
  const accepted: Array<Accepted<T>> = [];

  Array.from(extensions).forEach((extension, index) => {
    const result = checkExtension(extension, index, options);

    problems.push(...result.problems);

    if (result.problems.length === 0) accepted.push({ extension, keys: result.keys });
  });

  const byName = new Map<string, T>();
  const byShortName = new Map<string, T>();
  const byKey = new Map<string, T>();

  for (const { extension, keys } of accepted) {
    claim(byName, extension.name, extension, 'name', problems);

    if (extension.shortName !== undefined) {
      claim(byShortName, extension.shortName, extension, 'short name', problems);
    }

    for (const key of keys) {
      claim(byKey, key, extension, options.keys?.label ?? 'key', problems);
    }
  }

  if (problems.length > 0) {
    const list = problems.map((problem) => `- ${problem}`).join('\n');

    throw new TypeError(`Cannot register ${kind} extensions:\n${list}`);
  }

  const sorted = Object.freeze(accepted.map(({ extension }) => extension).sort(compareByName));

  return Object.freeze({
    extensions: sorted,
    get: (name: string) => byName.get(name),
    getByKey: (key: string) => byKey.get(key),
    getByShortName: (shortName: string) => byShortName.get(shortName),
    kind,
  });
}

function checkExtension<T extends Extension>(extension: T, index: number, options: RegistryOptions<T>): CheckResult {
  const value: unknown = extension;
  const position = `the extension at position ${String(index)}`;

  if (!isRecord(value)) return { keys: [], problems: [`${position} is not an object`] };

  const { name, shortName } = value;

  if (typeof name !== 'string' || !isExtensionName(name)) {
    const label = typeof name === 'string' ? JSON.stringify(name) : position;

    return { keys: [], problems: [`${label} needs a name "package:name" in lowercase letters, digits and dashes`] };
  }

  const label = JSON.stringify(name);
  const localName = name.slice(name.indexOf(':') + 1);
  const keys: unknown = options.keys === undefined ? [] : options.keys.of(extension);
  const listed = isStringList(keys) ? keys : [];
  const problems = [
    ...(shortName === undefined || shortName === localName
      ? []
      : [`${label} may only declare the short name "${localName}", its name without the package prefix`]),
    ...(options.keys === undefined ? [] : keyProblems(label, keys, options.keys)),
    ...(options.check?.(extension) ?? []),
  ];

  return { keys: listed, problems };
}

function keyProblems<T extends Extension>(label: string, keys: unknown, rule: RegistryKeys<T>): string[] {
  if (!isStringList(keys)) return [`${label} must list its ${rule.label} values as strings`];

  const valid = rule.valid ?? isNonEmpty;
  const invalid = keys
    .filter((key) => !valid(key))
    .map((key) => `${label} has an invalid ${rule.label} ${JSON.stringify(key)}`);
  const repeated = keys
    .filter((key, index) => keys.indexOf(key) !== index)
    .map((key) => `${label} lists the ${rule.label} ${JSON.stringify(key)} twice`);

  return [...invalid, ...repeated];
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
    const taken = `of ${JSON.stringify(extension.name)} is taken by ${JSON.stringify(owner.name)}`;

    problems.push(`the ${label} ${JSON.stringify(key)} ${taken}`);
  }
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNonEmpty(key: string): boolean {
  return key.length > 0;
}

function compareByName(left: Extension, right: Extension): number {
  return compareCodeUnits(left.name, right.name);
}
