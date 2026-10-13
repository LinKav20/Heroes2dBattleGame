import { isRecord } from '../shared/index.ts';
import { isExtensionName } from './extension-names.ts';
import type { Extension } from './extension.ts';
import type { RegistryKeys, RegistryOptions } from './registry-options.ts';

/**
 * The problems of one extension and its extra keys.
 */
export interface ExtensionCheck {
  /** The problems found; the extension is valid if there are none. */
  readonly problems: readonly string[];
  /** The extra keys of the extension, if they are a list of strings. */
  readonly keys: readonly string[];
}

/**
 * Checks one extension of a registry: its full name, its short name, its extra keys and the checks of the registry.
 */
export function checkExtension<T extends Extension>(
  extension: T,
  index: number,
  options: RegistryOptions<T>,
): ExtensionCheck {
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
  const problems = [
    ...(shortName === undefined || shortName === localName
      ? []
      : [`${label} may only declare the short name "${localName}", its name without the package prefix`]),
    ...(options.keys === undefined ? [] : keyProblems(label, keys, options.keys)),
    ...(options.check?.(extension) ?? []),
  ];

  return { keys: isStringList(keys) ? keys : [], problems };
}

/**
 * Describes an extension for an error message: its kind, if it has one, and its full name.
 */
export function describeExtension(extension: Extension): string {
  const value: unknown = extension;
  const kind = isRecord(value) && typeof value.kind === 'string' ? `the ${value.kind} ` : '';

  return `${kind}${JSON.stringify(extension.name)}`;
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

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNonEmpty(key: string): boolean {
  return key.length > 0;
}
