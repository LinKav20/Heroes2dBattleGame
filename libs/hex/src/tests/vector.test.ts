import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cube, cubeAdd, cubeDistance, cubeEquals, cubeScale, cubeSubtract, type Cube } from '../index.ts';
import { anyCube, EDGE_CUBE, nearbyPair, NOT_SAFE_INTEGERS, ORIGIN } from './helpers.ts';

describe('vectors', () => {
  it('adding zero changes nothing', () => {
    fc.assert(
      fc.property(anyCube, (hex) => {
        expect(cubeAdd(hex, ORIGIN)).toStrictEqual(hex);
      }),
    );
  });

  it('subtracting undoes adding', () => {
    fc.assert(
      fc.property(anyCube, anyCube, (a, b) => {
        expect(cubeSubtract(cubeAdd(a, b), b)).toStrictEqual(a);
      }),
    );
  });

  it('adds and subtracts coordinates', () => {
    expect(cubeAdd(cube(1, -2), cube(3, 4))).toStrictEqual(cube(4, 2));
    expect(cubeSubtract(cube(1, -2), cube(3, 4))).toStrictEqual(cube(-2, -6));
  });

  it('scaling adds the vector as many times as the factor says, with its sign', () => {
    fc.assert(
      fc.property(anyCube, fc.integer({ min: -10, max: 10 }), (hex, factor) => {
        expect(cubeScale(hex, factor)).toStrictEqual(repeatedSum(hex, factor));
      }),
    );
  });

  it.each(NOT_SAFE_INTEGERS)('rejects the scale factor %d', (factor) => {
    expect(() => cubeScale(ORIGIN, factor)).toThrow(RangeError);
  });

  it('rejects a result that is not a safe integer', () => {
    expect(() => cubeAdd(EDGE_CUBE, cube(1, 0))).toThrow(RangeError);
    expect(() => cubeSubtract(EDGE_CUBE, cube(-1, 0))).toThrow(RangeError);
    expect(() => cubeScale(EDGE_CUBE, 2)).toThrow(RangeError);
  });
});

describe('distance', () => {
  it('counts steps between hexes', () => {
    expect(cubeDistance(ORIGIN, cube(3, -1))).toBe(3);
    expect(cubeDistance(ORIGIN, cube(-2, -1))).toBe(3);
    expect(cubeDistance(cube(1, 1), cube(1, 1))).toBe(0);
  });

  it('is symmetric and zero only to the hex itself', () => {
    fc.assert(
      fc.property(nearbyPair, ([a, b]) => {
        expect(cubeDistance(a, b)).toBe(cubeDistance(b, a));
        expect(cubeDistance(a, b) === 0).toBe(cubeEquals(a, b));
      }),
    );
  });

  it('satisfies the triangle inequality', () => {
    fc.assert(
      fc.property(anyCube, anyCube, anyCube, (a, b, c) => {
        expect(cubeDistance(a, c)).toBeLessThanOrEqual(cubeDistance(a, b) + cubeDistance(b, c));
      }),
    );
  });

  it('rejects a distance that is not a safe integer', () => {
    expect(() => cubeDistance(cube(2 ** 52, -(2 ** 52)), cube(-(2 ** 52), 2 ** 52))).toThrow(RangeError);
  });
});

function repeatedSum(hex: Cube, factor: number): Cube {
  let sum = ORIGIN;

  for (let step = 0; step < Math.abs(factor); step += 1) {
    sum = factor > 0 ? cubeAdd(sum, hex) : cubeSubtract(sum, hex);
  }

  return sum;
}
