import { describe, expect, it } from 'vitest';
import { createRegistry, type Extension } from '../index.ts';
import { asChannel, asExtension, FirstCopy, SCHEMES, SecondCopy } from './helpers.ts';

describe('createRegistry', () => {
  it('finds extensions by full name and by short name separately', () => {
    const damage = { name: 'rules-stdlib:damage', shortName: 'damage' };
    const freeze = { name: 'acme-frost:freeze' };
    const registry = createRegistry('operation', [damage, freeze]);

    expect(registry.get('rules-stdlib:damage')).toBe(damage);
    expect(registry.get('acme-frost:freeze')).toBe(freeze);
    expect(registry.get('damage')).toBeUndefined();
    expect(registry.getByShortName('damage')).toBe(damage);
    expect(registry.getByShortName('freeze')).toBeUndefined();
    expect(registry.getByShortName('rules-stdlib:damage')).toBeUndefined();
  });

  it('lists extensions sorted by full name, whatever the order of registration', () => {
    const names = ['rules-stdlib:heal', 'acme-frost:freeze', 'rules-stdlib:damage', 'acme:and'];
    const forward = createRegistry('operation', names.map((name) => ({ name })));
    const backward = createRegistry('operation', names.toReversed().map((name) => ({ name })));

    expect(forward.extensions.map(({ name }) => name)).toStrictEqual([
      'acme-frost:freeze',
      'acme:and',
      'rules-stdlib:damage',
      'rules-stdlib:heal',
    ]);

    expect(backward.extensions.map(({ name }) => name)).toStrictEqual(forward.extensions.map(({ name }) => name));
  });

  it('cannot be changed after creation', () => {
    const extensions = [{ name: 'rules-stdlib:damage' }];
    const registry = createRegistry('operation', extensions);

    extensions.push({ name: 'rules-stdlib:heal' });

    expect(registry.get('rules-stdlib:heal')).toBeUndefined();
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.extensions)).toBe(true);
  });

  it('accepts an empty list', () => {
    expect(createRegistry('operation', []).extensions).toStrictEqual([]);
  });

  it('accepts extensions of any class, as from two installed copies of one package', () => {
    const first = new FirstCopy('rules-stdlib:damage', 'damage');
    const second = new SecondCopy('rules-stdlib:heal', 'heal');
    const bare: unknown = Object.create(null, { name: { enumerable: true, value: 'rules-stdlib:summon' } });
    const registry = createRegistry<Extension>('operation', [first, second, asExtension(bare)]);

    expect(registry.getByShortName('damage')).toBe(first);
    expect(registry.getByShortName('heal')).toBe(second);
    expect(registry.get('rules-stdlib:summon')).toBe(bare);
  });

  it('rejects a duplicate full name', () => {
    const extensions = [{ name: 'rules-stdlib:damage' }, { name: 'rules-stdlib:damage' }];

    expect(() => createRegistry('operation', extensions)).toThrow(
      '- the name "rules-stdlib:damage" of "rules-stdlib:damage" is taken by "rules-stdlib:damage"',
    );
  });

  it('rejects a duplicate short name', () => {
    const extensions = [
      { name: 'rules-stdlib:damage', shortName: 'damage' },
      { name: 'acme-frost:damage', shortName: 'damage' },
    ];

    expect(() => createRegistry('operation', extensions)).toThrow(
      '- the short name "damage" of "acme-frost:damage" is taken by "rules-stdlib:damage"',
    );
  });

  it('accepts only the name without the package prefix as a short name', () => {
    const extensions = [{ name: 'adapter-renderer-pixi:renderer', shortName: 'pixi' }];

    expect(() => createRegistry('renderer', extensions)).toThrow(
      '"adapter-renderer-pixi:renderer" may only declare the short name "renderer"',
    );
  });

  it('lists every problem in one error', () => {
    const extensions = asExtensions([
      { name: 'Damage' },
      null,
      { name: 'rules-stdlib:heal', shortName: 'cure' },
      { name: 'x:y' },
      { name: 'x:y' },
    ]);

    expect(() => createRegistry('operation', extensions)).toThrow(
      'Cannot register operation extensions:\n'
      + '- "Damage" needs a name "package:name" in lowercase letters, digits and dashes\n'
      + '- the extension at position 1 is not an object\n'
      + '- "rules-stdlib:heal" may only declare the short name "heal", its name without the package prefix\n'
      + '- the name "x:y" of "x:y" is taken by "x:y"',
    );
  });

  it.each([null, 'rules-stdlib:damage', 7])('says that %j is not an object', (value) => {
    expect(() => createRegistry('operation', [asExtension(value)])).toThrow(
      'the extension at position 0 is not an object',
    );
  });

  it('treats a hole in the list as an extension that is not an object', () => {
    const extensions = new Array<Extension>(2);

    extensions[1] = { name: 'rules-stdlib:damage' };

    expect(() => createRegistry('operation', extensions)).toThrow('the extension at position 0 is not an object');
  });

  it.each([
    { name: 'a missing name', value: { shortName: 'damage' } },
    { name: 'a numeric name', value: { name: 7 } },
    { name: 'a numeric short name', value: { name: 'rules-stdlib:damage', shortName: 7 } },
    { name: 'an empty short name', value: { name: 'rules-stdlib:damage', shortName: '' } },
  ])('rejects $name', ({ value }) => {
    expect(() => createRegistry('operation', [asExtension(value)])).toThrow(TypeError);
  });

  it('quotes names in the message', () => {
    expect(() => createRegistry('operation', [{ name: 'bad"\nname' }])).toThrow('- "bad\\"\\nname" needs a name');
  });

  it('adds the problems of an extra check', () => {
    const extensions = [{ name: 'a:forbidden' }, { name: 'a:allowed' }];

    expect(() => createRegistry('operation', extensions, { check: forbid })).toThrow(
      'Cannot register operation extensions:\n- it is forbidden',
    );
  });
});

describe('createRegistry with extra keys', () => {
  it('finds extensions by their keys', () => {
    const ws = { name: 'adapter-channel-ws:ws', schemes: ['ws:', 'wss:'] };
    const memory = { name: 'adapter-channel-memory:memory', schemes: ['memory:'] };
    const registry = createRegistry('channel', [ws, memory], { keys: SCHEMES });

    expect(registry.getByKey('wss:')).toBe(ws);
    expect(registry.getByKey('memory:')).toBe(memory);
    expect(registry.getByKey('rtc:')).toBeUndefined();
  });

  it('rejects a key served by two extensions', () => {
    const extensions = [
      { name: 'adapter-channel-ws:ws', schemes: ['ws:', 'wss:'] },
      { name: 'acme-socket:socket', schemes: ['wss:'] },
    ];

    expect(() => createRegistry('channel', extensions, { keys: SCHEMES })).toThrow(
      'the URL scheme "wss:" of "acme-socket:socket" is taken by "adapter-channel-ws:ws"',
    );
  });

  it('rejects a key listed twice by one extension', () => {
    const extensions = [{ name: 'adapter-channel-ws:ws', schemes: ['ws:', 'ws:'] }];

    expect(() => createRegistry('channel', extensions, { keys: SCHEMES })).toThrow(
      '"adapter-channel-ws:ws" lists the URL scheme "ws:" twice',
    );
  });

  it('rejects keys of the wrong form', () => {
    const extensions = [{ name: 'acme-socket:socket', schemes: ['WS:', ''] }];

    expect(() => createRegistry('channel', extensions, { keys: SCHEMES })).toThrow(
      '- "acme-socket:socket" has an invalid URL scheme "WS:"\n- "acme-socket:socket" has an invalid URL scheme ""',
    );
  });

  it('rejects an empty key when the registry has no rule for the form', () => {
    const extensions = [{ name: 'acme-socket:socket', schemes: [''] }];

    expect(() => createRegistry('channel', extensions, { keys: { label: SCHEMES.label, of: SCHEMES.of } })).toThrow(
      'has an invalid URL scheme ""',
    );
  });

  it('rejects keys that are not a list of strings', () => {
    const broken = { name: 'acme-socket:socket', schemes: [1] };

    expect(() => createRegistry('channel', [asChannel(broken)], { keys: SCHEMES })).toThrow(
      '"acme-socket:socket" must list its URL scheme values as strings',
    );
  });

  it('reads the keys of an extension once', () => {
    let calls = 0;
    const keys = { ...SCHEMES, of: () => {
      calls += 1;

      return calls === 1 ? ['ws:'] : ['zz:'];
    } };
    const registry = createRegistry('channel', [{ name: 'a:ws', schemes: [] }], { keys });

    expect(calls).toBe(1);
    expect(registry.getByKey('ws:')?.name).toBe('a:ws');
    expect(registry.getByKey('zz:')).toBeUndefined();
  });

  it('keeps keys and names apart', () => {
    const registry = createRegistry('channel', [{ name: 'a:ws', schemes: ['ws:'] }], { keys: SCHEMES });

    expect(registry.get('ws:')).toBeUndefined();
    expect(registry.getByKey('a:ws')).toBeUndefined();
  });
});

function asExtensions(values: readonly unknown[]): readonly Extension[] {
  return values.map(asExtension);
}

function forbid(extension: Extension): string[] {
  return extension.name.endsWith(':forbidden') ? ['it is forbidden'] : [];
}
