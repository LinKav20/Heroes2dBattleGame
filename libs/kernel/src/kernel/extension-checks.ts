import { KERNEL_EXTENSION_KINDS, type KernelExtensionKind, type RegisteredExtension } from '../extensions/index.ts';
import { BATTLE_MOMENTS, isExtensionName, isKernelName, KERNEL_MECHANICS, KERNEL_PREFIX } from '../names/index.ts';
import { isRecord } from '../shared/index.ts';

type Check = (label: string, extension: Readonly<Record<string, unknown>>) => string[];

/**
 * Returns the problems of an extension of the point of assembly beyond its name: an unknown kind, the prefix of the
 * kernel, or a missing part that its kind needs, such as a version, migrations, a function or a schema.
 */
export function extensionProblems(extension: RegisteredExtension): string[] {
  const label = JSON.stringify(extension.name);
  const value: unknown = extension;
  const record = isRecord(value) ? value : {};
  const kind = KERNEL_EXTENSION_KINDS.find((known) => known === record.kind);

  return [
    ...(kind === undefined ? [`${label} has an unknown kind; use ${KERNEL_EXTENSION_KINDS.join(', ')}`] : []),
    ...(isKernelName(extension.name)
      ? [`${label} uses the prefix "${KERNEL_PREFIX}", which belongs to the kernel`]
      : []),
    ...mayHaveData(label, record),
    ...(kind === undefined ? [] : KIND_CHECKS[kind].flatMap((check) => check(label, record))),
  ];
}

const MECHANIC_CHECKS: Readonly<Record<string, readonly Check[]>> = {
  [KERNEL_MECHANICS.attack]: [needsFunction('attack'), mayHaveFunction('shoot')],
  [KERNEL_MECHANICS.defense]: [needsFunction('defend')],
  [KERNEL_MECHANICS.turnOrder]: [
    needsFunction('next'),
    ...[...Object.keys(BATTLE_MOMENTS), 'wait'].map((name) => mayHaveFunction(name)),
    mayHaveTurnOwner,
  ],
};

const KIND_CHECKS: Readonly<Record<KernelExtensionKind, readonly Check[]>> = {
  command: [needsFunction('plan'), needsSchema],
  condition: [needsFunction('test'), needsSchema],
  event: [needsVersion, needsFunction('apply'), needsSchema, mayHaveFunction('target')],
  formula: [needsFunction('evaluate'), needsSchema],
  mechanic: [needsSchema, needsMechanic],
  operation: [needsFunction('run'), needsSchema],
  step: [needsVersion, needsFunction('run'), mayHaveFunction('migrateEvents')],
  topology: [
    needsSchema,
    ...['area', 'cells', 'distance', 'footprint', 'moveCost', 'neighbors'].map((name) => needsFunction(name)),
    mayHaveFunction('directions'),
    mayHaveFunction('line'),
  ],
};

function needsMechanic(label: string, extension: Readonly<Record<string, unknown>>): string[] {
  const { mechanic } = extension;

  if (typeof mechanic !== 'string' || !isExtensionName(mechanic)) {
    return [`${label} needs the full name of its mechanic`];
  }

  if (isKernelName(mechanic) && !Object.values<string>(KERNEL_MECHANICS).includes(mechanic)) {
    return [`${label} names the mechanic ${JSON.stringify(mechanic)}, which the kernel does not have`];
  }

  return (MECHANIC_CHECKS[mechanic] ?? []).flatMap((check) => check(label, extension));
}

function needsFunction(name: string): Check {
  return (label, extension) => (typeof extension[name] === 'function' ? [] : [`${label} needs a function ${name}`]);
}

function mayHaveFunction(name: string): Check {
  return (label, extension) => (extension[name] === undefined || typeof extension[name] === 'function'
    ? []
    : [`${label} needs a function ${name} or none`]);
}

function mayHaveTurnOwner(label: string, extension: Readonly<Record<string, unknown>>): string[] {
  const { turnOwner } = extension;

  return turnOwner === undefined || turnOwner === 'side' || turnOwner === 'unit'
    ? []
    : [`${label} needs a turn owner "side", "unit" or none`];
}

function mayHaveData(label: string, extension: Readonly<Record<string, unknown>>): string[] {
  const { data } = extension;

  if (data === undefined) return [];

  const fits = isRecord(data)
    && Number.isSafeInteger(data.version)
    && Number(data.version) >= 1
    && isRecord(data.schema)
    && (data.project === undefined || typeof data.project === 'function');

  return fits
    ? []
    : [`${label} needs data with a version that is a whole number from 1, a JSON Schema and, optionally, `
      + 'a function `project`'];
}

function needsSchema(label: string, extension: Readonly<Record<string, unknown>>): string[] {
  return isRecord(extension.schema) ? [] : [`${label} needs a JSON Schema as an object`];
}

function needsVersion(label: string, extension: Readonly<Record<string, unknown>>): string[] {
  const { migrations, version } = extension;

  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    return [`${label} needs a version that is a whole number from 1`];
  }

  if (!Array.isArray(migrations)) return [`${label} needs a list of migrations`];

  const versions = migrations.map((migration: unknown) => migrationVersion(migration));
  const listed = versions.filter((from) => from !== undefined).sort((left, right) => left - right);
  const complete = listed.length === version - 1 && listed.every((from, index) => from === index + 1);

  return complete && !versions.includes(undefined)
    ? []
    : [`${label} needs exactly one migration from every version below ${String(version)}`];
}

function migrationVersion(migration: unknown): number | undefined {
  if (!isRecord(migration) || typeof migration.migrate !== 'function') return undefined;

  const { from } = migration;

  return typeof from === 'number' && Number.isSafeInteger(from) ? from : undefined;
}
