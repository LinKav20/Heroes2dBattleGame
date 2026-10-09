import { cube, type Cube } from './coords.ts';
import { cubeDistance } from './vector.ts';

/**
 * The hexes on a straight line from `from` to `to`, including both ends: distance + 1 hexes,
 * each a neighbor of the previous one. The line from `to` to `from` has the same hexes in reverse order.
 *
 * The algorithm is specified exactly, so that other implementations give the same hexes.
 * For each i from 0 to N, where N is the distance, the point (to - from) * i / N + (1, 2, -3) / 1 000 000
 * is rounded to a hex and added to `from`. Each coordinate is rounded to the nearest integer, halves up,
 * which is floor(x + 1/2). Then one coordinate is recomputed from the other two: q if its rounding error
 * is strictly the largest, otherwise r if its error is larger than the error of s, otherwise s.
 * All arithmetic is exact: coordinates are multiplied by 1 000 000 * N and divided as integers.
 *
 * Throws `RangeError` if the distance is above 47 452, where exact arithmetic in doubles ends.
 */
export function cubeLine(from: Cube, to: Cube): Cube[] {
  const steps = cubeDistance(from, to);

  if (steps === 0) return [from];

  if ((steps + 2) * steps > MAX_LINE_SPAN) {
    throw new RangeError(`Line is too long for exact integer arithmetic: the distance is ${String(steps)}.`);
  }

  const dq = to.q - from.q;
  const dr = to.r - from.r;
  const ds = to.s - from.s;
  const denominator = steps * NUDGE_SCALE;
  const result: Cube[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const x = dq * i * NUDGE_SCALE + NUDGE.q * steps;
    const y = dr * i * NUDGE_SCALE + NUDGE.r * steps;
    const z = ds * i * NUDGE_SCALE + NUDGE.s * steps;
    const offset = roundCubeFraction(x, y, z, denominator);

    result.push(cube(from.q + offset.q, from.r + offset.r));
  }

  return result;
}

const NUDGE_SCALE = 1_000_000;
const NUDGE = Object.freeze({ q: 1, r: 2, s: -3 });
const MAX_LINE_SPAN = Math.floor(Number.MAX_SAFE_INTEGER / (4 * NUDGE_SCALE));

function floorDiv(numerator: number, denominator: number): number {
  let quotient = Math.floor(numerator / denominator);

  if (quotient * denominator > numerator) quotient -= 1;
  if ((quotient + 1) * denominator <= numerator) quotient += 1;

  return quotient;
}

function roundDiv(numerator: number, denominator: number): number {
  return floorDiv(2 * numerator + denominator, 2 * denominator);
}

function roundCubeFraction(x: number, y: number, z: number, denominator: number): Cube {
  let q = roundDiv(x, denominator);
  let r = roundDiv(y, denominator);
  const s = roundDiv(z, denominator);

  const dq = Math.abs(q * denominator - x);
  const dr = Math.abs(r * denominator - y);
  const ds = Math.abs(s * denominator - z);

  if (dq > dr && dq > ds) {
    q = 0 - r - s;
  } else if (dr > ds) {
    r = 0 - q - s;
  }

  return cube(q, r);
}
