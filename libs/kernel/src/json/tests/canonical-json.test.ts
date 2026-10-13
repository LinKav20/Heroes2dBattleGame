import canonicalize from 'canonicalize';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../index.ts';
import { anyJson } from './helpers.ts';

describe('canonicalJson', () => {
  it('matches the RFC 8785 reference implementation', () => {
    fc.assert(
      fc.property(anyJson, (value) => {
        expect(canonicalJson(value)).toBe(canonicalize(value));
      }),
    );
  });

  it('sorts keys by UTF-16 code units, as in the RFC 8785 example', () => {
    const value = Object.fromEntries([
      ['\u20ac', 'Euro Sign'],
      ['\r', 'Carriage Return'],
      ['\ufb33', 'Hebrew Letter Dalet With Dagesh'],
      ['1', 'One'],
      ['\u{1f600}', 'Emoji: Grinning Face'],
      ['\u0080', 'Control'],
      ['\u00f6', 'Latin Small Letter O With Diaeresis'],
    ]);

    expect(canonicalJson(value)).toBe(
      '{"\\r":"Carriage Return","1":"One","\u0080":"Control","\u00f6":"Latin Small Letter O With Diaeresis",'
      + '"\u20ac":"Euro Sign","\u{1f600}":"Emoji: Grinning Face","\ufb33":"Hebrew Letter Dalet With Dagesh"}',
    );
  });

  it('does not depend on the order of keys', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string({ unit: 'binary' }), anyJson), (value) => {
        const reversed = Object.fromEntries(Object.entries(value).reverse());

        expect(canonicalJson(reversed)).toBe(canonicalJson(value));
      }),
    );
  });

  it('reads back as the same value', () => {
    fc.assert(
      fc.property(anyJson, (value) => {
        expect(JSON.parse(canonicalJson(value))).toStrictEqual(JSON.parse(JSON.stringify(value)));
      }),
    );
  });

  it('writes literals, the safe integer limits and -0', () => {
    const value = [null, true, false, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -0, 'a\n"b"'];

    expect(canonicalJson(value)).toBe('[null,true,false,9007199254740991,-9007199254740991,0,"a\\n\\"b\\""]');
  });

  it('accepts objects without a prototype', () => {
    const bare: unknown = Object.create(null, {
      b: { enumerable: true, value: 1 },
      a: { enumerable: true, value: 2 },
    });

    expect(canonicalJson(bare)).toBe('{"a":2,"b":1}');
  });

  it('writes a __proto__ key that JSON.parse created as an ordinary key', () => {
    const parsed: unknown = JSON.parse('{"b":2,"__proto__":{"a":1}}');

    expect(canonicalJson(parsed)).toBe('{"__proto__":{"a":1},"b":2}');
  });

  it('accepts values nested 256 levels deep and rejects deeper ones', () => {
    expect(canonicalJson(nested(256))).toBe(`${'['.repeat(256)}${']'.repeat(256)}`);
    expect(() => canonicalJson(nested(257))).toThrow(`$${'[0]'.repeat(256)} is nested deeper than 256 levels.`);
  });

  it('rejects an array with properties other than its items', () => {
    const labelled = Object.assign([1, 2], { label: 'extra' });
    const marked = Object.assign([1], { [Symbol('mark')]: true });

    expect(() => canonicalJson({ items: labelled })).toThrow('$.items has properties other than its items.');
    expect(() => canonicalJson(marked)).toThrow('$ has properties other than its items.');
  });

  it('accepts the same object in several places', () => {
    const shared = { hp: 3 };

    expect(canonicalJson({ first: shared, second: [shared] })).toBe('{"first":{"hp":3},"second":[{"hp":3}]}');
  });

  it.each([
    { name: 'a fraction', value: 1.5 },
    { name: 'NaN', value: Number.NaN },
    { name: 'infinity', value: Number.POSITIVE_INFINITY },
    { name: 'negative infinity', value: Number.NEGATIVE_INFINITY },
    { name: 'an unsafe integer', value: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects $name with a RangeError', ({ value }) => {
    expect(() => canonicalJson(value)).toThrow(RangeError);
  });

  it.each([
    { name: 'undefined', value: undefined },
    { name: 'a bigint', value: 1n },
    { name: 'a symbol', value: Symbol('value') },
    { name: 'a function', value: canonicalJson },
    { name: 'an undefined field', value: { hp: undefined } },
    { name: 'undefined in an array', value: [undefined] },
    { name: 'an array hole', value: new Array<number>(1) },
    { name: 'a class instance', value: new Map() },
    { name: 'a date', value: new Date(0) },
    { name: 'a symbol key', value: { [Symbol('key')]: 1 } },
    { name: 'a lone surrogate in a value', value: '\ud800' },
    { name: 'a lone surrogate in a key', value: { '\udc00': 1 } },
  ])('rejects $name with a TypeError', ({ value }) => {
    expect(() => canonicalJson(value)).toThrow(TypeError);
  });

  it('rejects a value that contains itself', () => {
    const cyclic: Record<string, unknown> = {};

    cyclic.self = [cyclic];

    expect(() => canonicalJson(cyclic)).toThrow('$.self[0] contains itself.');
  });

  it.each([
    [{ units: [{ hp: 1.5 }] }, '$.units[0].hp is 1.5, but only safe integers are allowed.'],
    [{ 'two words': [1, undefined] }, '$["two words"][1] is of type undefined, which JSON cannot represent.'],
    [{ effects: [new Array<number>(1)] }, '$.effects[0][0] is a hole in the array.'],
  ])('names the path to the rejected part of %j', (value, message) => {
    expect(() => canonicalJson(value)).toThrow(message);
  });
});

function nested(depth: number): unknown {
  let value: unknown = [];

  for (let level = 1; level < depth; level += 1) {
    value = [value];
  }

  return value;
}
