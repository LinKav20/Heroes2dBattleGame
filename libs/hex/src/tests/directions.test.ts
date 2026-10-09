import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  cube,
  cubeDistance,
  cubeNeighbor,
  cubeNeighbors,
  cubeScale,
  DIRECTIONS,
  directionTo,
  directionVector,
  oppositeDirection,
  type Direction,
} from '../index.ts';
import { anyCube, anyDirection, countDistinct, fieldHexes } from './arbitraries.ts';

describe('directions', () => {
  it('keeps a fixed order: east, then counterclockwise', () => {
    expect(DIRECTIONS).toStrictEqual(['east', 'northEast', 'northWest', 'west', 'southWest', 'southEast']);
  });

  it('maps every direction to a fixed vector', () => {
    expect(DIRECTIONS.map(directionVector)).toStrictEqual([
      cube(1, 0),
      cube(1, -1),
      cube(0, -1),
      cube(-1, 0),
      cube(-1, 1),
      cube(0, 1),
    ]);
  });

  it('cannot be changed at runtime', () => {
    expect(Object.isFrozen(DIRECTIONS)).toBe(true);
    expect(DIRECTIONS.every((direction) => Object.isFrozen(directionVector(direction)))).toBe(true);
  });

  it.each(DIRECTIONS)('the opposite of %s points the other way', (direction) => {
    const opposite = oppositeDirection(direction);

    expect(directionVector(opposite)).toStrictEqual(cubeScale(directionVector(direction), -1));
    expect(oppositeDirection(opposite)).toBe(direction);
  });

  it.each(['bogus', 'toString', 'East'])('rejects the unknown direction %j', (name) => {
    const direction = name as Direction;

    expect(() => directionVector(direction)).toThrow(RangeError);
    expect(() => cubeNeighbor(cube(0, 0), direction)).toThrow(RangeError);
    expect(() => oppositeDirection(direction)).toThrow(RangeError);
  });
});

describe('neighbors', () => {
  it('lists the neighbors of a hex in a fixed order', () => {
    expect(cubeNeighbors(cube(2, -1))).toStrictEqual([
      cube(3, -1),
      cube(3, -2),
      cube(2, -2),
      cube(1, -1),
      cube(1, 0),
      cube(2, 0),
    ]);
  });

  it('has six distinct neighbors at distance one', () => {
    fc.assert(
      fc.property(anyCube, (hex) => {
        const neighbors = cubeNeighbors(hex);

        expect(countDistinct(neighbors)).toBe(6);
        expect(neighbors.every((neighbor) => cubeDistance(hex, neighbor) === 1)).toBe(true);
      }),
    );
  });

  it('direction to a neighbor and the opposite direction agree', () => {
    fc.assert(
      fc.property(anyCube, anyDirection, (hex, direction) => {
        const neighbor = cubeNeighbor(hex, direction);

        expect(directionTo(hex, neighbor)).toBe(direction);
        expect(directionTo(neighbor, hex)).toBe(oppositeDirection(direction));
      }),
    );
  });

  it('finds a direction exactly between neighbors on the whole field', () => {
    const field = fieldHexes();

    for (const a of field) {
      for (const b of field) {
        expect(directionTo(a, b) !== null).toBe(cubeDistance(a, b) === 1);
      }
    }
  });

  it('has no direction to a far hex or to the hex itself', () => {
    expect(directionTo(cube(0, 0), cube(2, 0))).toBeNull();
    expect(directionTo(cube(1, 1), cube(1, 1))).toBeNull();
    expect(directionTo(cube(Number.MAX_SAFE_INTEGER - 10, 0), cube(10 - Number.MAX_SAFE_INTEGER, 0))).toBeNull();
  });
});
