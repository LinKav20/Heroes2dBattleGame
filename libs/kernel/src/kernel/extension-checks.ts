import { isKernelName, KERNEL_PREFIX } from '../names/index.ts';
import { isRecord } from '../shared/index.ts';
import { KERNEL_EXTENSION_KINDS, type KernelExtension, type KernelExtensionKind } from './extensions.ts';

type Check = (label: string, extension: Readonly<Record<string, unknown>>) => string[];

/**
 * Returns the problems of an extension of the point of assembly beyond its name: an unknown kind, the prefix of the
 * kernel, or a missing part that its kind needs, such as a version, migrations, a function or a schema.
 */
export function extensionProblems(extension: KernelExtension): string[] {
  const label = JSON.stringify(extension.name);
  const problems: string[] = [];

  if (!KERNEL_EXTENSION_KINDS.includes(extension.kind)) {
    problems.push(`${label} has an unknown kind; use ${KERNEL_EXTENSION_KINDS.join(', ')}`);
  }

  if (isKernelName(extension.name)) {
    problems.push(`${label} uses the prefix "${KERNEL_PREFIX}", which belongs to the kernel`);
  }

  const value: unknown = extension;
  const record = isRecord(value) ? value : {};

  for (const check of KIND_CHECKS[extension.kind] ?? []) {
    problems.push(...check(label, record));
  }

  return problems;
}

const KIND_CHECKS: Partial<Record<KernelExtensionKind, readonly Check[]>> = {
  command: [needsFunction('plan'), needsSchema],
  event: [needsVersion, needsFunction('apply'), needsSchema],
  step: [needsVersion, needsFunction('run')],
};

function needsFunction(name: string): Check {
  return (label, extension) => (typeof extension[name] === 'function' ? [] : [`${label} needs a function ${name}`]);
}

function needsSchema(label: string, extension: Readonly<Record<string, unknown>>): string[] {
  return isRecord(extension.schema) ? [] : [`${label} needs a JSON Schema of its payload as an object`];
}

function needsVersion(label: string, extension: Readonly<Record<string, unknown>>): string[] {
  const { migrations, version } = extension;

  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    return [`${label} needs a version that is a whole number from 1`];
  }

  if (!Array.isArray(migrations)) return [`${label} needs a list of migrations`];

  const versions = migrations.map((migration: unknown) => migrationVersion(migration));
  const expected = Array.from(new Array<number>(version - 1).keys(), (index) => index + 1);
  const listed = versions.filter((from) => from !== undefined).sort((left, right) => left - right);

  if (versions.includes(undefined) || listed.join() !== expected.join()) {
    return [`${label} needs exactly one migration from every version below ${String(version)}`];
  }

  return [];
}

function migrationVersion(migration: unknown): number | undefined {
  if (!isRecord(migration) || typeof migration.migrate !== 'function') return undefined;

  const { from } = migration;

  return typeof from === 'number' && Number.isSafeInteger(from) ? from : undefined;
}
