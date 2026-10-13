/**
 * The prefix of the extensions that the kernel registers itself; other packages cannot use it.
 */
export const KERNEL_PREFIX = 'kernel';

/**
 * Returns the prefix of the extensions that an npm package registers: the package name without the npm scope.
 *
 * The scope `@heroes2dgame` is dropped: `@heroes2dgame/rules-stdlib` gives `rules-stdlib`. Any other scope joins the
 * name with a dash: `@acme/frost` gives `acme-frost`. A package without a scope gives its own name.
 *
 * @throws {RangeError} If the package name is not a valid npm package name.
 */
export function extensionPrefix(packageName: string): string {
  const match = NPM_NAME.exec(packageName);

  if (match === null || packageName.length > MAX_NPM_NAME_LENGTH) {
    throw new RangeError(`"${packageName}" is not a valid npm package name.`);
  }

  const [, scope, name = ''] = match;

  if (scope === undefined || scope === OWN_SCOPE) return name;

  return `${scope}-${name}`;
}

/**
 * Returns the full name of a built-in extension of the kernel, for example `kernel:unit-moved` for `unit-moved`.
 */
export function kernelName<Local extends string>(local: Local): `${typeof KERNEL_PREFIX}:${Local}` {
  return `${KERNEL_PREFIX}:${local}`;
}

/**
 * Returns the prefix of a full extension name: the part before the colon.
 */
export function prefixOf(name: string): string {
  return name.slice(0, name.indexOf(':'));
}

/**
 * Tells whether a full extension name belongs to the kernel.
 */
export function isKernelName(name: string): boolean {
  return prefixOf(name) === KERNEL_PREFIX;
}

/**
 * Tells whether a string is a full extension name `package:name`: a prefix made from an npm package name, a colon and
 * a local name in lowercase Latin letters and digits with words separated by single dashes.
 */
export function isExtensionName(name: string): boolean {
  return FULL_NAME.test(name);
}

const OWN_SCOPE = 'heroes2dgame';
const MAX_NPM_NAME_LENGTH = 214;
const NPM_NAME = /^(?:@([a-z0-9~-][a-z0-9._~-]*)\/)?([a-z0-9~-][a-z0-9._~-]*)$/;
const FULL_NAME = /^[a-z0-9~-][a-z0-9._~-]*:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
