import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  cube,
  cubeAdd,
  cubeDistance,
  cubeRange,
  cubeRing,
  cubeScale,
  directionVector,
  isInside,
  offset,
} from '../index.ts';
import { anyCube, countDistinct } from './arbitraries.ts';

const origin = cube(0, 0);
const radius = fc.integer({ min: 0, max: 12 });
const positiveRadius = fc.integer({ min: 1, max: 12 });

describe('range', () => {
  it('a range of radius R has 3R(R+1)+1 distinct hexes, none farther than R', () => {
    fc.assert(
      fc.property(anyCube, radius, (center, size) => {
        const range = cubeRange(center, size);

        expect(range).toHaveLength(3 * size * (size + 1) + 1);
        expect(countDistinct(range)).toBe(range.length);
        expect(range.every((hex) => cubeDistance(center, hex) <= size)).toBe(true);
      }),
    );
  });

  it('is the range around the origin moved to the center', () => {
    fc.assert(
      fc.property(anyCube, radius, (center, size) => {
        expect(cubeRange(center, size)).toStrictEqual(cubeRange(origin, size).map((hex) => cubeAdd(hex, center)));
      }),
    );
  });

  it('keeps a fixed order', () => {
    expect(cubeRange(origin, 0)).toStrictEqual([origin]);

    expect(cubeRange(origin, 2)).toStrictEqual([
      cube(-2, 0),
      cube(-2, 1),
      cube(-2, 2),
      cube(-1, -1),
      cube(-1, 0),
      cube(-1, 1),
      cube(-1, 2),
      cube(0, -2),
      cube(0, -1),
      cube(0, 0),
      cube(0, 1),
      cube(0, 2),
      cube(1, -2),
      cube(1, -1),
      cube(1, 0),
      cube(1, 1),
      cube(2, -2),
      cube(2, -1),
      cube(2, 0),
    ]);
  });
});

describe('ring', () => {
  it('a ring of radius R has 6R distinct hexes, all exactly R away', () => {
    fc.assert(
      fc.property(anyCube, positiveRadius, (center, size) => {
        const ring = cubeRing(center, size);

        expect(ring).toHaveLength(6 * size);
        expect(countDistinct(ring)).toBe(ring.length);
        expect(ring.every((hex) => cubeDistance(center, hex) === size)).toBe(true);
      }),
    );
  });

  it('starts south-west of the center and walks between neighbors back to the start', () => {
    fc.assert(
      fc.property(anyCube, positiveRadius, (center, size) => {
        const ring = cubeRing(center, size);
        const closed = [...ring, ...ring.slice(0, 1)];

        expect(ring.at(0)).toStrictEqual(cubeAdd(center, cubeScale(directionVector('southWest'), size)));

        expect(closed.slice(1).every((hex, index) => {
          const previous = closed[index];

          return previous !== undefined && cubeDistance(previous, hex) === 1;
        })).toBe(true);
      }),
    );
  });

  it('keeps a fixed order', () => {
    expect(cubeRing(origin, 0)).toStrictEqual([origin]);

    expect(cubeRing(origin, 2)).toStrictEqual([
      cube(-2, 2),
      cube(-1, 2),
      cube(0, 2),
      cube(1, 1),
      cube(2, 0),
      cube(2, -1),
      cube(2, -2),
      cube(1, -2),
      cube(0, -2),
      cube(-1, -1),
      cube(-2, 0),
      cube(-2, 1),
    ]);
  });
});

describe('radius', () => {
  it('a negative radius gives an empty area', () => {
    expect(cubeRange(origin, -1)).toStrictEqual([]);
    expect(cubeRing(origin, -1)).toStrictEqual([]);
  });

  it.each([0.5, Number.NaN, Infinity, -Infinity])('rejects the radius %d', (size) => {
    expect(() => cubeRange(origin, size)).toThrow(RangeError);
    expect(() => cubeRing(origin, size)).toThrow(RangeError);
  });
});

describe('field bounds', () => {
  const size = { width: 15, height: 11 };

  it.each([
    [0, 0],
    [14, 0],
    [0, 10],
    [14, 10],
    [7, 5],
  ])('hex %i,%i is inside', (col, row) => {
    expect(isInside(offset(col, row), size)).toBe(true);
  });

  it.each([
    [-1, 0],
    [0, -1],
    [15, 0],
    [0, 11],
    [15, 11],
  ])('hex %i,%i is outside', (col, row) => {
    expect(isInside(offset(col, row), size)).toBe(false);
  });

  it('nothing is inside an empty field', () => {
    expect(isInside(offset(0, 0), { width: 0, height: 0 })).toBe(false);
  });
});
