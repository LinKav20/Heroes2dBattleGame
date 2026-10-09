import { cube, type Cube, type Offset } from './coords.ts';
import { cubeNeighbor, DIRECTIONS, directionVector } from './directions.ts';
import { cubeAdd, cubeScale } from './vector.ts';

/** The size of a rectangular field, in hexes. */
export interface GridSize {
  readonly width: number;
  readonly height: number;
}

/**
 * All hexes within `radius` of the center, including the center: 3R(R + 1) + 1 hexes for radius R.
 * They are ordered by the q offset from the center, then by the r offset, both ascending.
 * A negative radius gives an empty list. Throws `RangeError` if the radius is not a safe integer.
 */
export function cubeRange(center: Cube, radius: number): Cube[] {
  checkRadius(radius);

  if (radius < 0) return [];

  const result: Cube[] = [];

  for (let dq = -radius; dq <= radius; dq += 1) {
    const fromR = Math.max(-radius, -dq - radius);
    const toR = Math.min(radius, -dq + radius);

    for (let dr = fromR; dr <= toR; dr += 1) {
      result.push(cubeAdd(center, cube(dq, dr)));
    }
  }

  return result;
}

/**
 * The hexes exactly `radius` away from the center: 6R hexes for radius R, or the center itself for radius 0.
 * The walk starts at center + R * southWest and takes R steps in each direction of `DIRECTIONS`, in order,
 * so consecutive hexes are neighbors. A negative radius gives an empty list.
 * Throws `RangeError` if the radius is not a safe integer.
 */
export function cubeRing(center: Cube, radius: number): Cube[] {
  checkRadius(radius);

  if (radius < 0) return [];
  if (radius === 0) return [center];

  const result: Cube[] = [];
  let hex = cubeAdd(center, cubeScale(directionVector('southWest'), radius));

  for (const direction of DIRECTIONS) {
    for (let step = 0; step < radius; step += 1) {
      result.push(hex);
      hex = cubeNeighbor(hex, direction);
    }
  }

  return result;
}

/** Checks whether a hex lies inside a rectangular field: 0 <= col < width and 0 <= row < height. */
export function isInside(hex: Offset, size: GridSize): boolean {
  return hex.col >= 0 && hex.row >= 0 && hex.col < size.width && hex.row < size.height;
}

function checkRadius(radius: number): void {
  if (!Number.isSafeInteger(radius)) {
    throw new RangeError(`Radius must be a safe integer, got ${String(radius)}.`);
  }
}
