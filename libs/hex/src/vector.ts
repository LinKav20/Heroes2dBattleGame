import { cube, type Cube } from './coords.ts';

/** The sum of two cube vectors. Throws `RangeError` if the result is not a safe integer. */
export function cubeAdd(a: Cube, b: Cube): Cube {
  return cube(a.q + b.q, a.r + b.r);
}

/**
 * The difference of two cube vectors: the offset from `b` to `a`.
 * Throws `RangeError` if the result is not a safe integer.
 */
export function cubeSubtract(a: Cube, b: Cube): Cube {
  return cube(a.q - b.q, a.r - b.r);
}

/**
 * A cube vector multiplied by an integer factor.
 * Throws `RangeError` if the factor or the result is not a safe integer.
 */
export function cubeScale(a: Cube, factor: number): Cube {
  if (!Number.isSafeInteger(factor)) {
    throw new RangeError(`Scale factor must be a safe integer, got ${String(factor)}.`);
  }

  return cube(a.q * factor, a.r * factor);
}

/**
 * The distance between two hexes in steps between neighbors: the largest of |Δq|, |Δr| and |Δs|.
 * Throws `RangeError` if the distance is not a safe integer.
 */
export function cubeDistance(a: Cube, b: Cube): number {
  const distance = Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s));

  if (!Number.isSafeInteger(distance)) {
    throw new RangeError('The distance between the hexes is not a safe integer.');
  }

  return distance;
}
