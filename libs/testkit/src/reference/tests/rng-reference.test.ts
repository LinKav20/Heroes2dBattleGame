import { rngNext, rngRange, type RngResult } from '@heroes2dgame/kernel';
import { describe, expect, it } from 'vitest';
import { RNG_REFERENCE } from '../index.ts';

const WORD_RANGE = 0x1_0000_0000;

describe('RNG_REFERENCE', () => {
  it.each(RNG_REFERENCE)('matches the kernel values for the seed $seed', ({ seed, values }) => {
    const actual = values.map(({ counter }) => ({ counter, value: valueOf(rngNext({ counter, seed })) }));

    expect(actual).toStrictEqual(values);
  });

  it.each(RNG_REFERENCE)('matches the kernel range draws for the seed $seed', ({ ranges, seed }) => {
    const actual = ranges.map(({ counter, max, min }) => {
      const result = rngRange({ counter, seed }, min, max);

      return { counter, max, min, nextCounter: counterOf(result), value: valueOf(result) };
    });

    expect(actual).toStrictEqual(ranges);
  });

  it.each(RNG_REFERENCE)('fails like the kernel for the seed $seed', ({ failures, seed }) => {
    const actual = failures.map(({ counter, max, min }) => {
      const result = min === undefined || max === undefined
        ? rngNext({ counter, seed })
        : rngRange({ counter, seed }, min, max);

      return { counter, ...(min === undefined ? {} : { max, min }), reason: result.ok ? 'none' : result.reason };
    });

    expect(actual).toStrictEqual(failures);
  });

  it('includes draws that skip rejected values, one of them equal to the bound', () => {
    const rejected = RNG_REFERENCE.flatMap(({ ranges, seed }) => ranges.flatMap(({ counter, max, min, nextCounter }) =>
      Array.from({ length: nextCounter - counter - 1 }, (unused, index) =>
        valueOf(rngNext({ counter: counter + index, seed })) - bound(min, max))));

    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected.every((overBound) => overBound >= 0)).toBe(true);
    expect(rejected).toContain(0);
  });

  it('includes running out of values in the middle of rejections', () => {
    const midway = RNG_REFERENCE.flatMap(({ failures, seed }) => failures
      .filter(({ counter, reason }) => reason === 'exhausted' && counter === Number.MAX_SAFE_INTEGER - 1)
      .filter(({ max, min }) => min !== undefined && max !== undefined
        && valueOf(rngNext({ counter: Number.MAX_SAFE_INTEGER - 1, seed })) >= bound(min, max)));

    expect(midway.length).toBeGreaterThan(0);
  });
});

function valueOf(result: RngResult): number {
  if (!result.ok) throw new Error(`The draw failed: ${result.reason}`);

  return result.value;
}

function bound(min: number, max: number): number {
  const size = max - min + 1;

  return WORD_RANGE - (WORD_RANGE % size);
}

function counterOf(result: RngResult): number {
  if (!result.ok) throw new Error(`The draw failed: ${result.reason}`);

  return result.rng.counter;
}
