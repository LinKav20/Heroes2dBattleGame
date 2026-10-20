import { ContentError, type Rounding } from '../content/index.ts';

/**
 * Returns the sum of safe integers, or nothing if it is not a safe integer.
 *
 * @throws {RangeError} If a value is not an integer.
 */
export function sum(values: readonly number[]): number | undefined {
  return exact(values.reduce((total, value) => total + BigInt(value), 0n));
}

/**
 * Returns the smallest of numbers, or `Infinity` for none, going through them one by one, so a list of any length fits.
 */
export function smallest(values: readonly number[]): number {
  let found = Infinity;

  for (const value of values) {
    if (value < found) found = value;
  }

  return found;
}

/**
 * Returns the largest of numbers, or `-Infinity` for none, going through them one by one, so a list of any length fits.
 */
export function largest(values: readonly number[]): number {
  let found = -Infinity;

  for (const value of values) {
    if (value > found) found = value;
  }

  return found;
}

/**
 * Returns the difference of two safe integers, or nothing if it is not a safe integer.
 *
 * @throws {RangeError} If a value is not an integer.
 */
export function difference(left: number, right: number): number | undefined {
  return exact(BigInt(left) - BigInt(right));
}

/**
 * Returns the product of safe integers, or nothing if it is not a safe integer.
 *
 * @throws {RangeError} If a value is not an integer.
 */
export function product(values: readonly number[]): number | undefined {
  return exact(values.reduce((total, value) => total * BigInt(value), 1n));
}

/**
 * Divides one safe integer by another, which is not 0, and rounds the quotient: `down` to the smaller integer, `up` to
 * the larger one, `nearest` to the nearest one with a half rounded up. Returns nothing if the result is not a safe
 * integer.
 *
 * @throws {RangeError} If a value is not an integer or the divisor is 0.
 * @throws {ContentError} If the rounding is unknown.
 */
export function quotient(dividend: number, divisor: number, rounding: Rounding): number | undefined {
  return exact(rounded(BigInt(dividend), BigInt(divisor), rounding));
}

/**
 * Returns a percent of a safe integer, rounded as {@link quotient} rounds: 150 percent of 7 rounded down is 10.
 *
 * @throws {RangeError} If a value is not an integer.
 * @throws {ContentError} If the rounding is unknown.
 */
export function percentOf(value: number, percent: number, rounding: Rounding): number | undefined {
  return exact(rounded(BigInt(value) * BigInt(percent), PERCENT, rounding));
}

const PERCENT = 100n;
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function rounded(dividend: bigint, divisor: bigint, rounding: Rounding): bigint {
  const numerator = divisor < 0n ? -dividend : dividend;
  const denominator = divisor < 0n ? -divisor : divisor;

  switch (rounding) {
    case 'down': {
      return floorDivide(numerator, denominator);
    }

    case 'nearest': {
      return floorDivide(2n * numerator + denominator, 2n * denominator);
    }

    case 'up': {
      return -floorDivide(-numerator, denominator);
    }

    default: {
      throw new ContentError(`The ruleset has an unknown rounding ${JSON.stringify(rounding)}.`);
    }
  }
}

function floorDivide(numerator: bigint, denominator: bigint): bigint {
  const truncated = numerator / denominator;

  return numerator % denominator < 0n ? truncated - 1n : truncated;
}

function exact(value: bigint): number | undefined {
  return value > MAX || value < -MAX ? undefined : Number(value);
}
