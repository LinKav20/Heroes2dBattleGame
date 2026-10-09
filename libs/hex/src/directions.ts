import { cube, type Cube } from './coords.ts';
import { cubeAdd } from './vector.ts';

/** One of the six directions from a hex. */
export type Direction = 'east' | 'northEast' | 'northWest' | 'west' | 'southWest' | 'southEast';

/**
 * The six directions in a fixed order: east, then counterclockwise as seen on screen.
 * Rows grow downwards, so "north" means r - 1. Neighbor lists and ring walks follow this order,
 * and deterministic traversals rely on it. The array is frozen.
 */
export const DIRECTIONS: readonly Direction[] = Object.freeze<Direction[]>([
  'east',
  'northEast',
  'northWest',
  'west',
  'southWest',
  'southEast',
]);

/**
 * The offset of one step in a direction: east (1, 0), northEast (1, -1), northWest (0, -1),
 * west (-1, 0), southWest (-1, 1), southEast (0, 1) as (q, r). The returned object is frozen.
 * Throws `RangeError` for an unknown direction.
 */
export function directionVector(direction: Direction): Cube {
  checkDirection(direction);

  return DIRECTION_VECTORS[direction];
}

/**
 * The neighboring hex in a direction.
 * Throws `RangeError` for an unknown direction or if the result is not a safe integer.
 */
export function cubeNeighbor(hex: Cube, direction: Direction): Cube {
  return cubeAdd(hex, directionVector(direction));
}

/** All six neighbors in the order of `DIRECTIONS`. Throws `RangeError` if a neighbor is not a safe integer. */
export function cubeNeighbors(hex: Cube): Cube[] {
  return DIRECTIONS.map((direction) => cubeAdd(hex, DIRECTION_VECTORS[direction]));
}

/** The direction to a neighboring hex, or `null` if the hexes are not neighbors or are the same hex. */
export function directionTo(from: Cube, to: Cube): Direction | null {
  const dq = to.q - from.q;
  const dr = to.r - from.r;

  for (const direction of DIRECTIONS) {
    const vector = DIRECTION_VECTORS[direction];

    if (vector.q === dq && vector.r === dr) return direction;
  }

  return null;
}

/** The opposite direction. Throws `RangeError` for an unknown direction. */
export function oppositeDirection(direction: Direction): Direction {
  checkDirection(direction);

  return OPPOSITE_DIRECTIONS[direction];
}

const DIRECTION_VECTORS: Readonly<Record<Direction, Cube>> = Object.freeze({
  east: frozenCube(1, 0),
  northEast: frozenCube(1, -1),
  northWest: frozenCube(0, -1),
  west: frozenCube(-1, 0),
  southWest: frozenCube(-1, 1),
  southEast: frozenCube(0, 1),
});

const OPPOSITE_DIRECTIONS: Readonly<Record<Direction, Direction>> = Object.freeze({
  east: 'west',
  northEast: 'southWest',
  northWest: 'southEast',
  west: 'east',
  southWest: 'northEast',
  southEast: 'northWest',
});

function frozenCube(q: number, r: number): Cube {
  return Object.freeze(cube(q, r));
}

function checkDirection(direction: unknown): asserts direction is Direction {
  if (typeof direction !== 'string' || !Object.hasOwn(DIRECTION_VECTORS, direction)) {
    throw new RangeError(`Unknown direction: ${String(direction)}.`);
  }
}
