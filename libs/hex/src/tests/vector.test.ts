import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cube, cubeAdd, cubeDistance, cubeEquals, cubeScale, cubeSubtract } from '../index.ts';
import { anyCube, nearbyPair } from './arbitraries.ts';

const origin = cube(0, 0);

describe('vectors', () => {
  it('adding zero changes nothing', () => {
    fc.assert(
      fc.property(anyCube, (hex) => {
        expect(cubeAdd(hex, origin)).toStrictEqual(hex);
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

  it('scaling multiplies the distance from the origin', () => {
    fc.assert(
      fc.property(anyCube, fc.integer({ min: -10, max: 10 }), (hex, factor) => {
        expect(cubeDistance(origin, cubeScale(hex, factor))).toBe(cubeDistance(origin, hex) * Math.abs(factor));
      }),
    );
  });

  it.each([0.5, Number.NaN, Infinity])('rejects the scale factor %d', (factor) => {
    expect(() => cubeScale(cube(1, 0), factor)).toThrow(RangeError);
  });

  it('rejects a result that is not a safe integer', () => {
    const big = cube(Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER);

    expect(() => cubeAdd(big, cube(1, 0))).toThrow(RangeError);
    expect(() => cubeScale(big, 2)).toThrow(RangeError);
  });
});

describe('distance', () => {
  it('counts steps between hexes', () => {
    expect(cubeDistance(origin, cube(3, -1))).toBe(3);
    expect(cubeDistance(origin, cube(-2, -1))).toBe(3);
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
