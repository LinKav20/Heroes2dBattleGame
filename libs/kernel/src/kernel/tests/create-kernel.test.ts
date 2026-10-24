import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  CommandKind,
  ConditionExtension,
  FormulaExtension,
  OperationExtension,
  TurnOrderVariant,
  KERNEL_EXTENSION_KINDS,
  KernelExtension,
  KernelExtensionKind,
} from '../../extensions/index.ts';
import { DONE } from '../../operations/index.ts';
import { FROST_EVENT, GRID, STRIKE_STEP } from '../../tests/fixtures.ts';
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
    expect(kernel.registries.formulas.get('rules-stdlib:double')).toBe(DOUBLE);
    expect(operations.getByShortName('adjacent')).toBeUndefined();
    expect(operations.extensions.filter(({ name }) => !name.startsWith('kernel:'))).toStrictEqual([DAMAGE]);
  });

  it('creates empty registries without extensions', () => {
    const registries = createKernel({ extensions: [] }).registries;
    const { commands, mechanics, topologies } = registries;
    const sizes = [commands, mechanics, topologies].map(({ extensions }) => extensions.length);
    const builtIn = [
      ...registries.conditions.extensions,
      ...registries.events.extensions,
      ...registries.formulas.extensions,
      ...registries.operations.extensions,
      ...registries.steps.extensions,
    ];

    expect(sizes).toStrictEqual([0, 0, 0]);
    expect(builtIn.every(({ name }) => name.startsWith('kernel:'))).toBe(true);
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

  it('freezes the extensions it accepts, so the format of its states cannot drift from them', () => {
    const store = {
      data: { schema: { properties: { level: { type: 'number' } }, type: 'object' }, version: 3 },
      kind: 'step',
      migrations: [{ from: 1, migrate: (params: unknown) => params }],
      name: 'acme:store',
      run: () => DONE,
      version: 2,
    } as const;
    const kernel = createKernel({ extensions: [store] });
    const format = structuredClone(kernel.stateFormat);

    expect(Object.isFrozen(store)).toBe(true);
    expect(Object.isFrozen(store.data.schema.properties.level)).toBe(true);
    expect(Object.isFrozen(store.migrations[0])).toBe(true);
    expect(Reflect.set(store, 'version', 5)).toBe(false);
    expect(Reflect.set(store.data, 'version', 4)).toBe(false);
    expect(Reflect.set(store.data.schema, 'type', 'array')).toBe(false);
    expect(kernel.stateFormat).toStrictEqual(format);
    expect(kernel.stateFormat.extensions).toStrictEqual({ 'acme:store': 3 });
    expect(kernel.registries.steps.get('acme:store')).toBe(store);
  });

  it('rejects one name in two registries', () => {
    const clash: KernelExtension[] = [
      { kind: 'operation', name: 'rules-stdlib:damage', run: () => ({ events: [], kind: 'done' }), schema: {} },
      { ...FROST_EVENT, name: 'rules-stdlib:damage' },
    ];

    expect(() => createKernel({ extensions: clash })).toThrow(
      'the name "rules-stdlib:damage" of the event "rules-stdlib:damage" is taken by the operation '
      + '"rules-stdlib:damage"',
    );
  });

  it('rejects one short name in two registries', () => {
    const clash: KernelExtension[] = [
      DAMAGE,
      { ...ADJACENT, name: 'acme-frost:damage', shortName: 'damage' },
    ];

    expect(() => createKernel({ extensions: clash })).toThrow('the short name "damage"');
  });

  it('rejects the prefix of the kernel in other packages', () => {
    const impostor: KernelExtension = { ...ADJACENT, name: 'kernel:fake-and', shortName: 'fake-and' };

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
    { kind: { ...FROST_EVENT, schema: undefined }, problem: 'needs a JSON Schema as an object' },
    { kind: { ...FROST_EVENT, apply: undefined }, problem: 'needs a function apply' },
    { kind: { ...STRIKE_STEP, run: undefined }, problem: 'needs a function run' },
    { kind: { ...ORDER, plan: undefined }, problem: 'needs a function plan' },
    { kind: { ...ORDER, schema: undefined }, problem: 'needs a JSON Schema as an object' },
    { kind: { ...ADJACENT, test: undefined }, problem: 'needs a function test' },
    { kind: { ...ADJACENT, schema: undefined }, problem: 'needs a JSON Schema as an object' },
    { kind: { ...DOUBLE, evaluate: undefined }, problem: 'needs a function evaluate' },
    { kind: { ...DOUBLE, schema: undefined }, problem: 'needs a JSON Schema as an object' },
    { kind: { ...FROST_EVENT, target: 1 }, problem: 'needs a function target or none' },
    { kind: { ...STRIKE_STEP, migrateEvents: 'yes' }, problem: 'needs a function migrateEvents or none' },
    { kind: { ...GRID, footprint: undefined }, problem: 'needs a function footprint' },
    { kind: { ...GRID, schema: undefined }, problem: 'needs a JSON Schema as an object' },
    { kind: { ...SPEED, schema: undefined }, problem: 'needs a JSON Schema as an object' },
    { kind: { ...SPEED, mechanic: 'turn-order' }, problem: 'needs the full name of its mechanic' },
    { kind: { ...SPEED, next: undefined }, problem: 'needs a function next' },
    { kind: { ...SPEED, wait: 'yes' }, problem: 'needs a function wait or none' },
    { kind: { ...SPEED, mechanic: 'kernel:defense' }, problem: 'needs a function defend' },
    { kind: { ...SPEED, mechanic: 'kernel:attack' }, problem: 'needs a function attack' },
    {
      kind: { ...SPEED, attack: () => DONE, mechanic: 'kernel:attack', shoot: 7 },
      problem: 'needs a function shoot or none',
    },
    { kind: { ...GRID, line: 'nope' }, problem: 'needs a function line or none' },
    {
      kind: { ...SPEED, mechanic: 'kernel:morale' },
      problem: 'names the mechanic "kernel:morale", which the kernel does not have',
    },
    { kind: { ...SPEED, turnOwner: 'army' }, problem: 'needs a turn owner "side", "unit" or none' },
    { kind: { ...GRID, directions: 'east' }, problem: 'needs a function directions or none' },
    {
      kind: { ...STRIKE_STEP, data: { schema: { type: 'object' }, version: 0 } },
      problem: 'needs data with a version that is a whole number from 1 and a JSON Schema, or no data',
    },
    { kind: { ...SPEED, data: { version: 2 } }, problem: 'needs data with a version that is a whole number from 1' },
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
      + '- "adapter-renderer-pixi:pixi" has an unknown kind; use command, condition, event, formula, mechanic, '
      + 'operation, step, topology\n'
      + '- the extension at position 2 is not an object',
    );
  });
});

const DAMAGE: OperationExtension = {
  kind: 'operation',
  name: 'rules-stdlib:damage',
  run: () => ({ events: [], kind: 'done' }),
  schema: { type: 'object' },
  shortName: 'damage',
};

const ADJACENT: ConditionExtension = {
  kind: 'condition',
  name: 'rules-stdlib:adjacent',
  schema: { type: 'object' },
  shortName: 'adjacent',
  test: () => ({ kind: 'value', value: true }),
};

const SPEED: TurnOrderVariant = {
  kind: 'mechanic',
  mechanic: 'kernel:turn-order',
  name: 'rules-stdlib:speed-with-waiting',
  next: () => ({ kind: 'value', value: undefined }),
  schema: { type: 'object' },
};

const DOUBLE: FormulaExtension = {
  evaluate: () => ({ kind: 'value', value: 2 }),
  kind: 'formula',
  name: 'rules-stdlib:double',
  schema: { type: 'object' },
};

const EXTENSIONS: readonly [KernelExtension, KernelExtension, ...KernelExtension[]] = [
  DAMAGE,
  ADJACENT,
  SPEED,
  { ...GRID, name: 'rules-stdlib:hex', shortName: 'hex' },
  FROST_EVENT,
  STRIKE_STEP,
  DOUBLE,
];

const ORDER: CommandKind = {
  kind: 'command',
  name: 'acme-frost:order',
  plan: () => ({ kind: 'steps', steps: [] }),
  schema: { type: 'object' },
};
