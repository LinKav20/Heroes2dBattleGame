import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  cube,
  cubeEquals,
  cubeNeighbor,
  cubeToOffset,
  offset,
  offsetEquals,
  offsetKey,
  offsetToCube,
  parseOffsetKey,
  type Cube,
  type Direction,
  type Offset,
} from '../index.ts';
import { anyDirection, anyOffset, hugeCoordinate, nearbyPair, NOT_SAFE_INTEGERS } from './helpers.ts';

const notSafeInteger = fc.constantFrom(...NOT_SAFE_INTEGERS);
const keyCharacters = fc.constantFrom('0', '1', '2', '7', '9', ',', '-');

const EVEN_ROW_STEPS: Readonly<Record<Direction, readonly [number, number]>> = {
  east: [1, 0],
  northEast: [0, -1],
  northWest: [-1, -1],
  west: [-1, 0],
  southWest: [-1, 1],
  southEast: [0, 1],
};

const ODD_ROW_STEPS: Readonly<Record<Direction, readonly [number, number]>> = {
  east: [1, 0],
  northEast: [1, -1],
  northWest: [0, -1],
  west: [-1, 0],
  southWest: [0, 1],
  southEast: [1, 1],
};

describe('creating hexes', () => {
  it('replaces negative zero with zero', () => {
    const hex = cube(-0, -0);
    const position = offset(-0, -0);

    expect(hex.q).toBe(0);
    expect(hex.r).toBe(0);
    expect(hex.s).toBe(0);
    expect(position.col).toBe(0);
    expect(position.row).toBe(0);
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

  it('places neighbors as the odd-r layout does, odd rows shifted right', () => {
    fc.assert(
      fc.property(anyOffset, anyDirection, (position, direction) => {
        const [colStep, rowStep] = (position.row & 1) === 0 ? EVEN_ROW_STEPS[direction] : ODD_ROW_STEPS[direction];
        const neighbor = cubeToOffset(cubeNeighbor(offsetToCube(position), direction));

        expect(neighbor).toStrictEqual(offset(position.col + colStep, position.row + rowStep));
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

        if (parsed !== null) {
          expect(offsetKey(parsed)).toBe(key);
        }
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
    '5,-0',
    '+1,2',
    'a,b',
    '99999999999999999999,1',
    '1,99999999999999999999',
  ])('rejects the key %j', (key) => {
    expect(parseOffsetKey(key)).toBeNull();
  });
});

describe('types', () => {
  it('rejects a plain object literal as a Cube or an Offset', () => {
    // @ts-expect-error A plain object literal is not a Cube.
    const literalCube: Cube = { q: 1, r: 2, s: -3 };
    // @ts-expect-error A plain object literal is not an Offset.
    const literalOffset: Offset = { col: 1, row: 2 };

    expect(literalCube).toStrictEqual(cube(1, 2));
    expect(literalOffset).toStrictEqual(offset(1, 2));
  });

  it('keeps the brand out of runtime values and JSON', () => {
    expect(JSON.stringify(cube(1, 2))).toBe('{"q":1,"r":2,"s":-3}');
    expect(JSON.stringify(offset(1, 2))).toBe('{"col":1,"row":2}');
  });
});
