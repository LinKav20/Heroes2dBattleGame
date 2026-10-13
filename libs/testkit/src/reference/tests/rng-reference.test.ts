import { rngNext, rngRange, type RngResult } from '@heroes2dgame/kernel';
import { describe, expect, it } from 'vitest';
import { RNG_REFERENCE } from '../index.ts';

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
    const ranges = RNG_REFERENCE.flatMap(({ ranges: draws }) => draws);
    const skipping = ranges.filter(({ counter, nextCounter }) => nextCounter > counter + 1);
    const atBound = ranges.filter(({ max, min }) => min === 0 && max >= 2 ** 31 && max < 2 ** 32 - 1);

    expect(skipping.length).toBeGreaterThan(0);
    expect(atBound.length).toBeGreaterThan(0);
  });

  it('includes running out of values in the middle of rejections', () => {
    const midway = RNG_REFERENCE.flatMap(({ failures }) => failures)
      .filter(({ counter, reason }) => reason === 'exhausted' && counter === Number.MAX_SAFE_INTEGER - 1);

    expect(midway.length).toBeGreaterThan(0);
  });
});

function valueOf(result: RngResult): number {
  if (!result.ok) throw new Error(`The draw failed: ${result.reason}`);

  return result.value;
}

function counterOf(result: RngResult): number {
  if (!result.ok) throw new Error(`The draw failed: ${result.reason}`);

  return result.rng.counter;
}
