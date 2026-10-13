import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRng, rngNext, rngRange, rngRangeSeries, type RngResult, type RngState } from '../index.ts';
import { anyRange, anyRng, anySeed, referenceRange, referenceValue, ZERO_SEED } from './helpers.ts';

describe('createRng', () => {
  it('starts the counter at 0', () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        expect(createRng(seed)).toStrictEqual({ counter: 0, seed });
      }),
    );
  });

  it.each([
    { name: 'uppercase digits', seed: 'A'.repeat(64) },
    { name: '63 digits', seed: '0'.repeat(63) },
    { name: '65 digits', seed: '0'.repeat(65) },
    { name: 'a non-hexadecimal digit', seed: `${'0'.repeat(63)}g` },
    { name: 'a prefix', seed: `0x${'0'.repeat(62)}` },
  ])('rejects a seed with $name', ({ seed }) => {
    expect(() => createRng(seed)).toThrow(RangeError);
  });
});

describe('rngNext', () => {
  it('returns word counter mod 8 of SHA-256 of the seed and the block number', () => {
    fc.assert(
      fc.property(anyRng, (rng) => {
        expect(valueOf(rngNext(rng))).toBe(referenceValue(rng));
      }),
    );
  });

  it('moves the counter by one and keeps the seed', () => {
    fc.assert(
      fc.property(anyRng, (rng) => {
        expect(stateOf(rngNext(rng))).toStrictEqual({ counter: rng.counter + 1, seed: rng.seed });
      }),
    );
  });

  it('gives the same value for the same state and does not change the state', () => {
    fc.assert(
      fc.property(anyRng, (rng) => {
        const copy = { ...rng };

        expect(rngNext(rng)).toStrictEqual(rngNext(rng));
        expect(rng).toStrictEqual(copy);
      }),
    );
  });

  it('issues the last value at counter 2^53 - 2 and then stops', () => {
    const last = { counter: Number.MAX_SAFE_INTEGER - 1, seed: ZERO_SEED };
    const afterLast = stateOf(rngNext(last));

    expect(afterLast.counter).toBe(Number.MAX_SAFE_INTEGER);
    expect(rngNext(afterLast)).toStrictEqual({ ok: false, reason: 'exhausted' });
  });

  it.each([
    { name: 'a negative counter', rng: { counter: -8, seed: ZERO_SEED } },
    { name: 'a fractional counter', rng: { counter: 0.5, seed: ZERO_SEED } },
    { name: 'an unsafe counter', rng: { counter: Number.MAX_SAFE_INTEGER + 1, seed: ZERO_SEED } },
    { name: 'a short seed', rng: { counter: 0, seed: '00' } },
  ])('rejects a state with $name', ({ rng }) => {
    expect(() => rngNext(rng)).toThrow(RangeError);
    expect(() => rngRange(rng, 1, 6)).toThrow(RangeError);
  });
});

describe('rngRange', () => {
  it('draws like the reference algorithm, running out of values included', () => {
    fc.assert(
      fc.property(anyRng, anyRange, (rng, [min, max]) => {
        expect(rngRange(rng, min, max)).toStrictEqual(referenceRange(rng, min, max));
      }),
    );
  });

  it('stays within the bounds', () => {
    fc.assert(
      fc.property(anyRng, anyRange, (rng, [min, max]) => {
        const result = rngRange(rng, min, max);

        expect(!result.ok || (result.value >= min && result.value <= max)).toBe(true);
      }),
    );
  });

  it('runs out of values in the middle of rejections', () => {
    const seed = '4'.repeat(64);
    const rejected = valueOf(rngNext({ counter: Number.MAX_SAFE_INTEGER - 1, seed }));
    const result = rngRange({ counter: Number.MAX_SAFE_INTEGER - 1, seed }, 0, rejected - 1);

    expect(rejected).toBeGreaterThan(2 ** 31);
    expect(result).toStrictEqual({ ok: false, reason: 'exhausted' });
  });

  it('counts the rejected values', () => {
    const size = 2 ** 31 + 1;
    const rejecting = { counter: 0, seed: ZERO_SEED };
    const draws = Array.from({ length: 200 }, (unused, counter) => rngRange({ ...rejecting, counter }, 0, size - 1));
    const skips = draws.map((draw, counter) => stateOf(draw).counter - counter - 1);

    expect(skips.some((skip) => skip > 0)).toBe(true);
    expect(skips.every((skip) => skip >= 0)).toBe(true);
  });

  it('rejects a value equal to the limit', () => {
    const rng = { counter: 1, seed: ZERO_SEED };
    const value = valueOf(rngNext(rng));
    const result = rngRange(rng, 0, value - 1);

    expect(value).toBeGreaterThan(2 ** 31);
    expect(stateOf(result).counter).toBeGreaterThan(2);
    expect(result).toStrictEqual(rngRange({ ...rng, counter: 2 }, 0, value - 1));
  });

  it('uses one value for a range of one number', () => {
    const result = rngRange({ counter: 5, seed: ZERO_SEED }, 7, 7);

    expect(result).toStrictEqual({ ok: true, rng: { counter: 6, seed: ZERO_SEED }, value: 7 });
  });

  it('accepts the widest ranges', () => {
    const rng = { counter: 0, seed: ZERO_SEED };

    expect(valueOf(rngRange(rng, 0, 2 ** 32 - 1))).toBe(valueOf(rngNext(rng)));
    expect(rngRange(rng, -Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER + 2 ** 32 - 1).ok).toBe(true);
    expect(rngRange(rng, Number.MAX_SAFE_INTEGER - 2 ** 32 + 1, Number.MAX_SAFE_INTEGER).ok).toBe(true);
  });

  it('spreads values evenly over a small range', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    let rng: RngState = { counter: 0, seed: ZERO_SEED };

    for (let draw = 0; draw < 6000; draw += 1) {
      const result = rngRange(rng, 0, 5);

      counts[valueOf(result)] = (counts[valueOf(result)] ?? 0) + 1;
      rng = stateOf(result);
    }

    expect(counts.every((count) => count > 900 && count < 1100)).toBe(true);
  });

  it.each([
    { max: 6, min: 7, name: 'min greater than max' },
    { max: 6.5, min: 1, name: 'a fractional bound' },
    { max: Number.MAX_SAFE_INTEGER + 1, min: 0, name: 'an unsafe bound' },
    { max: Number.NaN, min: 0, name: 'NaN' },
    { max: 2 ** 32, min: 0, name: 'more than 2^32 numbers' },
    { max: Number.MAX_SAFE_INTEGER, min: -Number.MAX_SAFE_INTEGER, name: 'the whole safe range' },
  ])('fails with invalid-range for $name without moving the counter', ({ max, min }) => {
    expect(rngRange({ counter: 3, seed: ZERO_SEED }, min, max)).toStrictEqual({ ok: false, reason: 'invalid-range' });
  });

  it('fails with exhausted when the counter runs out', () => {
    const exhausted = { counter: Number.MAX_SAFE_INTEGER, seed: ZERO_SEED };

    expect(rngRange(exhausted, 1, 6)).toStrictEqual({ ok: false, reason: 'exhausted' });
  });
});

describe('rngRangeSeries', () => {
  it('draws the same values as one call of rngRange after another', () => {
    fc.assert(
      fc.property(anyRng, anyRange, fc.integer({ max: 20, min: 0 }), (rng, [min, max], count) => {
        let current: RngResult = { ok: true, rng, value: 0 };
        const values: number[] = [];

        for (let index = 0; index < count && current.ok; index += 1) {
          current = rngRange(current.rng, min, max);

          if (current.ok) values.push(current.value);
        }

        const series = rngRangeSeries(rng, min, max, count);

        expect(series).toStrictEqual(current.ok ? { ok: true, rng: current.rng, values } : current);
      }),
    );
  });

  it('crosses blocks of eight values', () => {
    const series = rngRangeSeries({ counter: 6, seed: ZERO_SEED }, 0, 2 ** 32 - 1, 4);
    const one = [6, 7, 8, 9].map((counter) => valueOf(rngNext({ counter, seed: ZERO_SEED })));

    expect(series).toStrictEqual({ ok: true, rng: { counter: 10, seed: ZERO_SEED }, values: one });
  });

  it('checks the state and the range before it draws', () => {
    expect(() => rngRangeSeries({ counter: -1, seed: ZERO_SEED }, 1, 6, 1)).toThrow(RangeError);
    expect(() => rngRangeSeries({ counter: 0, seed: ZERO_SEED }, 1, 6, 1.5)).toThrow(RangeError);

    expect(rngRangeSeries({ counter: 0, seed: ZERO_SEED }, 6, 1, 1))
      .toStrictEqual({ ok: false, reason: 'invalid-range' });

    expect(rngRangeSeries({ counter: 0, seed: ZERO_SEED }, 1, 6, 0)).toStrictEqual({
      ok: true,
      rng: { counter: 0, seed: ZERO_SEED },
      values: [],
    });
  });
});

function valueOf(result: RngResult): number {
  if (!result.ok) throw new Error(`The draw failed: ${result.reason}`);

  return result.value;
}

function stateOf(result: RngResult): RngState {
  if (!result.ok) throw new Error(`The draw failed: ${result.reason}`);

  return result.rng;
}
