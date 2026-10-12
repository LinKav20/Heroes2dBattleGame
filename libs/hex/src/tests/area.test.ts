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
import {
  anyCube,
  anyPositiveRadius,
  anyRadius,
  countDistinct,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  nonAdjacentSteps,
} from './helpers.ts';

const origin = cube(0, 0);

describe('range', () => {
  it('a range of radius R has 3R(R+1)+1 distinct hexes, none farther than R', () => {
    fc.assert(
      fc.property(anyCube, anyRadius, (center, radius) => {
        const range = cubeRange(center, radius);

        expect(range).toHaveLength(3 * radius * (radius + 1) + 1);
        expect(countDistinct(range)).toBe(range.length);
        expect(range.filter((hex) => cubeDistance(center, hex) > radius)).toStrictEqual([]);
      }),
    );
  });

  it('is the range around the origin moved to the center', () => {
    fc.assert(
      fc.property(anyCube, anyRadius, (center, radius) => {
        const moved = cubeRange(origin, radius).map((hex) => cubeAdd(hex, center));

        expect(cubeRange(center, radius)).toStrictEqual(moved);
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
      fc.property(anyCube, anyPositiveRadius, (center, radius) => {
        const ring = cubeRing(center, radius);

        expect(ring).toHaveLength(6 * radius);
        expect(countDistinct(ring)).toBe(ring.length);
        expect(ring.filter((hex) => cubeDistance(center, hex) !== radius)).toStrictEqual([]);
      }),
    );
  });

  it('starts south-west of the center and walks between neighbors back to the start', () => {
    fc.assert(
      fc.property(anyCube, anyPositiveRadius, (center, radius) => {
        const ring = cubeRing(center, radius);
        const closed = [...ring, ...ring.slice(0, 1)];

        expect(ring.at(0)).toStrictEqual(cubeAdd(center, cubeScale(directionVector('southWest'), radius)));
        expect(nonAdjacentSteps(closed)).toStrictEqual([]);
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

  it.each([0.5, Number.NaN, Infinity, -Infinity])('rejects the radius %d', (radius) => {
    expect(() => cubeRange(origin, radius)).toThrow(RangeError);
    expect(() => cubeRing(origin, radius)).toThrow(RangeError);
  });
});

describe('field bounds', () => {
  const field = { width: FIELD_WIDTH, height: FIELD_HEIGHT };

  it.each([
    [0, 0],
    [FIELD_WIDTH - 1, 0],
    [0, FIELD_HEIGHT - 1],
    [FIELD_WIDTH - 1, FIELD_HEIGHT - 1],
    [7, 5],
  ])('hex %i,%i is inside', (col, row) => {
    expect(isInside(offset(col, row), field)).toBe(true);
  });

  it.each([
    [-1, 0],
    [0, -1],
    [FIELD_WIDTH, 0],
    [0, FIELD_HEIGHT],
    [FIELD_WIDTH, FIELD_HEIGHT],
  ])('hex %i,%i is outside', (col, row) => {
    expect(isInside(offset(col, row), field)).toBe(false);
  });

  it('nothing is inside an empty field', () => {
    expect(isInside(offset(0, 0), { width: 0, height: 0 })).toBe(false);
  });
});
