import fc, { type Arbitrary } from 'fast-check';
import {
  cube,
  cubeDistance,
  cubeNeighbor,
  cubeToOffset,
  DIRECTIONS,
  offset,
  offsetKey,
  offsetToCube,
  type Cube,
  type Direction,
  type Offset,
} from '../index.ts';

export const FIELD_WIDTH = 15;
export const FIELD_HEIGHT = 11;

export const coordinate = fc.integer({ min: -200, max: 200 });
export const farCoordinate = fc.integer({ min: -(2 ** 50), max: 2 ** 50 });
export const hugeCoordinate = fc.integer({ min: -(2 ** 51), max: 2 ** 51 });
export const anyCube: Arbitrary<Cube> = fc.tuple(coordinate, coordinate).map(([q, r]) => cube(q, r));
export const farCube: Arbitrary<Cube> = fc.tuple(farCoordinate, farCoordinate).map(([q, r]) => cube(q, r));
export const anyOffset: Arbitrary<Offset> = fc.tuple(coordinate, coordinate).map(([col, row]) => offset(col, row));
export const anyDirection: Arbitrary<Direction> = fc.constantFrom(...DIRECTIONS);
export const anyRadius = fc.integer({ min: 0, max: 12 });
export const anyPositiveRadius = fc.integer({ min: 1, max: 12 });

export const nearbyPair: Arbitrary<[Cube, Cube]> = anyCube.chain((a) => fc.tuple(
  fc.constant(a),
  fc.oneof(fc.constant(cube(a.q, a.r)), anyDirection.map((direction) => cubeNeighbor(a, direction)), anyCube),
));

export function fieldHexes(): Cube[] {
  const hexes: Cube[] = [];

  for (let row = 0; row < FIELD_HEIGHT; row += 1) {
    for (let col = 0; col < FIELD_WIDTH; col += 1) {
      hexes.push(offsetToCube(offset(col, row)));
    }
  }

  return hexes;
}

export function hexKey(hex: Cube): string {
  return offsetKey(cubeToOffset(hex));
}

export function countDistinct(hexes: Cube[]): number {
  return new Set(hexes.map(hexKey)).size;
}

export function nonAdjacentSteps(hexes: Cube[]): number[] {
  return hexes.slice(1).flatMap((hex, index) => {
    const previous = hexes[index];

    return previous !== undefined && cubeDistance(previous, hex) === 1 ? [] : [index + 1];
  });
}

export function referenceLine(from: Cube, to: Cube): Cube[] {
  const steps = cubeDistance(from, to);
  const result: Cube[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    const x = from.q + (to.q - from.q) * t + 1e-6;
    const y = from.r + (to.r - from.r) * t + 2e-6;
    const z = from.s + (to.s - from.s) * t - 3e-6;

    let q = Math.round(x);
    let r = Math.round(y);
    const s = Math.round(z);

    const errorQ = Math.abs(q - x);
    const errorR = Math.abs(r - y);
    const errorS = Math.abs(s - z);

    if (errorQ > errorR && errorQ > errorS) {
      q = -r - s;
    } else if (errorR > errorS) {
      r = -q - s;
    }

    result.push(cube(q, r));
  }

  return result;
}
