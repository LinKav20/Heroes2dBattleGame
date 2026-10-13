import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  CommandKind,
  KERNEL_EXTENSION_KINDS,
  KernelExtension,
  KernelExtensionKind,
} from '../../extensions/index.ts';
import { FROST_EVENT, STRIKE_STEP } from '../../tests/fixtures.ts';
import { createKernel } from '../index.ts';

describe('createKernel', () => {
  it('lists exactly the kinds of the union of extensions', () => {
    expectTypeOf<(typeof KERNEL_EXTENSION_KINDS)[number]>().toEqualTypeOf<KernelExtensionKind>();
  });

  it('puts every extension into the registry of its kind', () => {
    const kernel = createKernel({ extensions: EXTENSIONS });
    const { conditions, events, mechanics, operations, topologies } = kernel.registries;

    expect(operations.getByShortName('damage')).toBe(EXTENSIONS[0]);
    expect(conditions.getByShortName('adjacent')).toBe(EXTENSIONS[1]);
    expect(mechanics.get('rules-stdlib:speed-with-waiting')).toBe(EXTENSIONS[2]);
    expect(topologies.getByShortName('hex')).toBe(EXTENSIONS[3]);
    expect(events.get('acme-frost:frozen')).toBe(FROST_EVENT);
    expect(kernel.registries.steps.get('acme-frost:strike')).toBe(STRIKE_STEP);
    expect(operations.getByShortName('adjacent')).toBeUndefined();
    expect(operations.extensions).toHaveLength(1);
  });

  it('creates empty registries without extensions', () => {
    const { conditions, events, mechanics, operations, topologies } = createKernel({ extensions: [] }).registries;
    const sizes = [conditions, mechanics, operations, topologies].map(({ extensions }) => extensions.length);

    expect(sizes).toStrictEqual([0, 0, 0, 0]);
    expect(events.extensions.every(({ name }) => name.startsWith('kernel:'))).toBe(true);
  });

  it('gives every kernel its own registries', () => {
    const first = createKernel({ extensions: [EXTENSIONS[0]] });
    const second = createKernel({ extensions: [EXTENSIONS[1]] });

    expect(first.registries.operations.getByShortName('damage')).toBe(EXTENSIONS[0]);
    expect(second.registries.operations.getByShortName('damage')).toBeUndefined();
    expect(second.registries.conditions.getByShortName('adjacent')).toBe(EXTENSIONS[1]);
  });

  it('cannot be changed after creation', () => {
    const kernel = createKernel({ extensions: EXTENSIONS });

    expect(Object.isFrozen(kernel)).toBe(true);
    expect(Object.isFrozen(kernel.registries)).toBe(true);
  });

  it('rejects one name in two registries', () => {
    const clash: KernelExtension[] = [
      { kind: 'operation', name: 'rules-stdlib:damage' },
      { ...FROST_EVENT, name: 'rules-stdlib:damage' },
    ];

    expect(() => createKernel({ extensions: clash })).toThrow(
      'the name "rules-stdlib:damage" of the event "rules-stdlib:damage" is taken by the operation '
      + '"rules-stdlib:damage"',
    );
  });

  it('rejects one short name in two registries', () => {
    const clash: KernelExtension[] = [
      { kind: 'operation', name: 'rules-stdlib:damage', shortName: 'damage' },
      { kind: 'condition', name: 'acme-frost:damage', shortName: 'damage' },
    ];

    expect(() => createKernel({ extensions: clash })).toThrow('the short name "damage"');
  });

  it('rejects the prefix of the kernel in other packages', () => {
    const impostor: KernelExtension = { kind: 'condition', name: 'kernel:fake-and', shortName: 'fake-and' };

    expect(() => createKernel({ extensions: [impostor] })).toThrow(
      '"kernel:fake-and" uses the prefix "kernel", which belongs to the kernel',
    );
  });

  it('rejects an extension that takes the name of an event of the kernel', () => {
    expect(() => createKernel({ extensions: [{ ...FROST_EVENT, name: 'kernel:unit-moved' }] })).toThrow(
      '- "kernel:unit-moved" uses the prefix "kernel", which belongs to the kernel',
    );
  });

  it.each<{ readonly kind: object; readonly problem: string }>([
    { kind: { ...FROST_EVENT, version: 0 }, problem: 'needs a version that is a whole number from 1' },
    { kind: { ...FROST_EVENT, version: 1.5 }, problem: 'needs a version that is a whole number from 1' },
    { kind: { ...FROST_EVENT, version: 2 }, problem: 'needs exactly one migration from every version below 2' },
    {
      kind: { ...STRIKE_STEP, migrations: [...STRIKE_STEP.migrations, ...STRIKE_STEP.migrations] },
      problem: 'needs exactly one migration from every version below 2',
    },
    {
      kind: { ...STRIKE_STEP, migrations: [{ from: 2, migrate: (value: unknown) => value }] },
      problem: 'needs exactly one migration from every version below 2',
    },
    { kind: { ...FROST_EVENT, schema: undefined }, problem: 'needs a JSON Schema of its payload as an object' },
    { kind: { ...FROST_EVENT, apply: undefined }, problem: 'needs a function apply' },
    { kind: { ...STRIKE_STEP, run: undefined }, problem: 'needs a function run' },
    { kind: { ...ORDER, plan: undefined }, problem: 'needs a function plan' },
    { kind: { ...ORDER, schema: undefined }, problem: 'needs a JSON Schema of its payload as an object' },
    {
      kind: { ...STRIKE_STEP, version: Number.MAX_SAFE_INTEGER },
      problem: `needs exactly one migration from every version below ${String(Number.MAX_SAFE_INTEGER)}`,
    },
  ])('rejects a kind of event or step that $problem', ({ kind, problem }) => {
    const extensions: unknown = [kind];

    expect(() => createKernel({ extensions: extensions as KernelExtension[] })).toThrow(problem);
  });

  it('accepts a valid kind of command', () => {
    expect(createKernel({ extensions: [ORDER] }).registries.commands.get('acme-frost:order')).toBe(ORDER);
  });

  it('lists an unknown kind together with the other problems', () => {
    const extensions: unknown[] = [
      { kind: 'operation', name: 'Bad' },
      { kind: 'renderer', name: 'adapter-renderer-pixi:pixi' },
      null,
    ];

    expect(() => createKernel({ extensions: extensions as KernelExtension[] })).toThrow(
      'Cannot register kernel extensions:\n'
      + '- "Bad" needs a name "package:name" in lowercase letters, digits and dashes\n'
      + '- "adapter-renderer-pixi:pixi" has an unknown kind; use command, condition, event, mechanic, operation, '
      + 'step, topology\n'
      + '- the extension at position 2 is not an object',
    );
  });
});

const EXTENSIONS: readonly [KernelExtension, KernelExtension, ...KernelExtension[]] = [
  { kind: 'operation', name: 'rules-stdlib:damage', shortName: 'damage' },
  { kind: 'condition', name: 'rules-stdlib:adjacent', shortName: 'adjacent' },
  { kind: 'mechanic', name: 'rules-stdlib:speed-with-waiting' },
  { kind: 'topology', name: 'rules-stdlib:hex', shortName: 'hex' },
  FROST_EVENT,
  STRIKE_STEP,
];

const ORDER: CommandKind = {
  kind: 'command',
  name: 'acme-frost:order',
  plan: () => ({ kind: 'steps', steps: [] }),
  schema: { type: 'object' },
};
