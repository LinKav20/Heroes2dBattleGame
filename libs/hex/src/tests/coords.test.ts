import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  cube,
  cubeEquals,
  cubeToOffset,
  offset,
  offsetEquals,
  offsetKey,
  offsetToCube,
  parseOffsetKey,
} from '../index.ts';
import { anyOffset, hugeCoordinate, nearbyPair } from './arbitraries.ts';

const notSafeInteger = fc.constantFrom(0.5, -1.5, Number.NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1);
const keyCharacters = fc.constantFrom('0', '1', '2', '7', '9', ',', '-');

describe('creating hexes', () => {
  it('converted hexes have cube coordinates that sum to zero', () => {
    fc.assert(
      fc.property(anyOffset, (position) => {
        const hex = offsetToCube(position);

        expect(hex.q + hex.r + hex.s).toBe(0);
      }),
    );
  });

  it('replaces negative zero with zero', () => {
    const hex = cube(-0, -0);
    const position = offset(-0, -0);

    expect(Object.is(hex.q, 0) && Object.is(hex.r, 0) && Object.is(hex.s, 0)).toBe(true);
    expect(Object.is(position.col, 0) && Object.is(position.row, 0)).toBe(true);
  });

  it('rejects coordinates that are not safe integers', () => {
    fc.assert(
      fc.property(notSafeInteger, (value) => {
        expect(() => cube(value, 0)).toThrow(RangeError);
        expect(() => cube(0, value)).toThrow(RangeError);
        expect(() => offset(value, 0)).toThrow(RangeError);
        expect(() => offset(0, value)).toThrow(RangeError);
      }),
    );
  });

  it('rejects a cube whose third coordinate is not a safe integer', () => {
    expect(() => cube(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
  });
});

describe('converting coordinates', () => {
  it('offset to cube and back returns the same hex', () => {
    fc.assert(
      fc.property(fc.tuple(hugeCoordinate, hugeCoordinate), ([col, row]) => {
        expect(cubeToOffset(offsetToCube(offset(col, row)))).toStrictEqual(offset(col, row));
      }),
    );
  });

  it('cube to offset and back returns the same hex', () => {
    fc.assert(
      fc.property(fc.tuple(hugeCoordinate, hugeCoordinate), ([q, r]) => {
        expect(offsetToCube(cubeToOffset(cube(q, r)))).toStrictEqual(cube(q, r));
      }),
    );
  });

  it('shifts odd rows to the right', () => {
    expect(offsetToCube(offset(0, 0))).toStrictEqual(cube(0, 0));
    expect(offsetToCube(offset(0, 1))).toStrictEqual(cube(0, 1));
    expect(offsetToCube(offset(0, 2))).toStrictEqual(cube(-1, 2));
    expect(offsetToCube(offset(3, 3))).toStrictEqual(cube(2, 3));
    expect(offsetToCube(offset(0, -1))).toStrictEqual(cube(1, -1));
    expect(offsetToCube(offset(2, -3))).toStrictEqual(cube(4, -3));
  });

  it('rejects a conversion whose result is not a safe integer', () => {
    expect(() => offsetToCube(offset(Number.MAX_SAFE_INTEGER, 2))).toThrow(RangeError);
  });
});

describe('comparing hexes', () => {
  it('hexes are equal exactly when their keys are equal', () => {
    fc.assert(
      fc.property(nearbyPair, ([a, b]) => {
        const sameKey = offsetKey(cubeToOffset(a)) === offsetKey(cubeToOffset(b));

        expect(cubeEquals(a, b)).toBe(sameKey);
        expect(offsetEquals(cubeToOffset(a), cubeToOffset(b))).toBe(sameKey);
      }),
    );
  });

  it('tells apart hexes that differ in one coordinate', () => {
    expect(cubeEquals(cube(1, 2), cube(1, 2))).toBe(true);
    expect(cubeEquals(cube(1, 2), cube(1, 3))).toBe(false);
    expect(cubeEquals(cube(1, 2), cube(2, 2))).toBe(false);
    expect(offsetEquals(offset(1, 2), offset(1, 3))).toBe(false);
    expect(offsetEquals(offset(1, 2), offset(2, 2))).toBe(false);
  });
});

describe('hex keys', () => {
  it('parses a key back to the same hex', () => {
    fc.assert(
      fc.property(anyOffset, (hex) => {
        expect(parseOffsetKey(offsetKey(hex))).toStrictEqual(hex);
      }),
    );
  });

  it('accepts only keys that offsetKey writes', () => {
    fc.assert(
      fc.property(fc.string({ unit: keyCharacters, maxLength: 8 }), (key) => {
        const parsed = parseOffsetKey(key);

        expect(parsed === null || offsetKey(parsed) === key).toBe(true);
      }),
    );
  });

  it('writes a key as "column,row"', () => {
    expect(offsetKey(offset(3, 5))).toBe('3,5');
    expect(offsetKey(offset(-2, 0))).toBe('-2,0');
  });

  it.each([
    '',
    '1',
    '1,',
    ',1',
    '1,2,3',
    ' 1,2',
    '1,2 ',
    '1;2',
    '1.5,2',
    '01,2',
    '1,02',
    '-0,5',
    '+1,2',
    'a,b',
    '99999999999999999999,1',
  ])('rejects the key %j', (key) => {
    expect(parseOffsetKey(key)).toBeNull();
  });
});
