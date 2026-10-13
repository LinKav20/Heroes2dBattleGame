import { describe, expect, it } from 'vitest';
import { extensionPrefix, isExtensionName } from '../index.ts';
import { INVALID_NPM_NAMES } from './helpers.ts';

describe('extensionPrefix', () => {
  it.each([
    ['@heroes2dgame/rules-stdlib', 'rules-stdlib'],
    ['@heroes2dgame/adapter-channel-ws', 'adapter-channel-ws'],
    ['@heroes2dgame/kernel', 'kernel'],
    ['@acme/frost', 'acme-frost'],
    ['acme-frost', 'acme-frost'],
    ['frost-mechanics', 'frost-mechanics'],
    ['@my.org/field.3d', 'my.org-field.3d'],
  ])('derives the prefix of %s', (packageName, prefix) => {
    expect(extensionPrefix(packageName)).toBe(prefix);
  });

  it('gives the same prefix to @acme/frost and acme-frost, so their names clash', () => {
    expect(extensionPrefix('@acme/frost')).toBe(extensionPrefix('acme-frost'));
  });

  it('rejects a name longer than npm allows', () => {
    expect(() => extensionPrefix(`frost-${'a'.repeat(209)}`)).toThrow(RangeError);
    expect(extensionPrefix(`frost-${'a'.repeat(208)}`)).toHaveLength(214);
  });

  it.each(INVALID_NPM_NAMES)('rejects the invalid npm name %j', (packageName) => {
    expect(() => extensionPrefix(packageName)).toThrow(RangeError);
  });
});

describe('isExtensionName', () => {
  it.each(['rules-stdlib:damage', 'kernel:unit-moved', 'acme-frost:freeze', 'my.org-field.3d:hex2', 'x:a1-b2'])(
    'accepts %s',
    (name) => {
      expect(isExtensionName(name)).toBe(true);
    },
  );

  it.each([
    'damage',
    'rules-stdlib:',
    ':damage',
    'rules-stdlib:Damage',
    'rules-stdlib:fire_arrow',
    'rules-stdlib:fire--arrow',
    'rules-stdlib:-fire',
    'rules-stdlib:fire-',
    'rules-stdlib:2d',
    'a:b:c',
    'Rules:damage',
    'rules stdlib:damage',
  ])('rejects %j', (name) => {
    expect(isExtensionName(name)).toBe(false);
  });
});
