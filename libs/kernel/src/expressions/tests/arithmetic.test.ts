import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { difference, percentOf, product, quotient, sum } from '../arithmetic.ts';

describe('exact arithmetic', () => {
  it('adds, subtracts and multiplies exactly and stays within safe integers', () => {
    const max = Number.MAX_SAFE_INTEGER;

    expect(sum([max - 1, 1])).toBe(max);
    expect(sum([max, 1])).toBeUndefined();
    expect(sum([-max, -1])).toBeUndefined();
    expect(difference(-max + 1, 1)).toBe(-max);
    expect(difference(-max, 1)).toBeUndefined();
    expect(product([2 ** 26, 2 ** 26])).toBe(2 ** 52);
    expect(product([2 ** 27, 2 ** 26])).toBeUndefined();
    expect(product([max, -1])).toBe(-max);
  });

  it.each([
    { dividend: 7, divisor: 2, down: 3, nearest: 4, up: 4 },
    { dividend: -7, divisor: 2, down: -4, nearest: -3, up: -3 },
    { dividend: 7, divisor: -2, down: -4, nearest: -3, up: -3 },
    { dividend: -7, divisor: -2, down: 3, nearest: 4, up: 4 },
    { dividend: 8, divisor: 3, down: 2, nearest: 3, up: 3 },
    { dividend: 7, divisor: 3, down: 2, nearest: 2, up: 3 },
    { dividend: 6, divisor: 3, down: 2, nearest: 2, up: 2 },
    { dividend: 0, divisor: -5, down: 0, nearest: 0, up: 0 },
  ])('divides $dividend by $divisor', ({ dividend, divisor, down, nearest, up }) => {
    expect(quotient(dividend, divisor, 'down')).toBe(down);
    expect(quotient(dividend, divisor, 'nearest')).toBe(nearest);
    expect(quotient(dividend, divisor, 'up')).toBe(up);
  });

  it('rounds like the floor, the ceiling and half up of the exact quotient, never to -0', () => {
    const anyInteger = fc.integer({ max: 1_000_000, min: -1_000_000 });

    fc.assert(
      fc.property(anyInteger, anyInteger.filter((divisor) => divisor !== 0), (dividend, divisor) => {
        expect(quotient(dividend, divisor, 'down')).toBe(Math.floor(dividend / divisor) + 0);
        expect(quotient(dividend, divisor, 'up')).toBe(Math.ceil(dividend / divisor) + 0);
        expect(quotient(dividend, divisor, 'nearest')).toBe(Math.floor(dividend / divisor + 0.5) + 0);
      }),
    );
  });

  it('takes a percent with the rounding of the ruleset, even when the product is not a safe integer', () => {
    expect(percentOf(7, 150, 'down')).toBe(10);
    expect(percentOf(7, 150, 'up')).toBe(11);
    expect(percentOf(7, 150, 'nearest')).toBe(11);
    expect(percentOf(-7, 150, 'down')).toBe(-11);
    expect(percentOf(-7, 150, 'nearest')).toBe(-10);
    expect(percentOf(2 ** 52, 150, 'down')).toBe(1.5 * 2 ** 52);
    expect(percentOf(2 ** 52, 250, 'down')).toBeUndefined();
  });
});
