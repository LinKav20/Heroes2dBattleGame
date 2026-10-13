import { sha256 } from '../crypto/index.ts';

/**
 * The state of the random number generator: the seed and the number of values the generator has issued.
 *
 * The value with number `k` is a 32-bit unsigned integer. The generator computes SHA-256 of 40 bytes: the 32 bytes
 * of the seed followed by the block number `floor(k / 8)` as 8 bytes, most significant first. It splits the digest
 * into eight 4-byte words and takes word `k mod 8`, most significant byte first. Values cannot be predicted from
 * earlier values without the seed.
 */
export interface RngState {
  /** The 32 bytes of the seed as 64 lowercase hexadecimal digits. */
  readonly seed: string;
  /**
   * The number of the next value, which equals the number of values issued so far, rejected ones included.
   * It starts at 0 and never exceeds `Number.MAX_SAFE_INTEGER`.
   */
  readonly counter: number;
}

/**
 * The result of drawing from the generator: a value and the new generator state, or the reason it failed.
 */
export type RngResult = RngFailure | RngSuccess;

/**
 * The result of drawing several values in a row: the values and the new generator state, or the reason it failed.
 */
export type RngSeriesResult = RngFailure | RngSeries;

/**
 * Why a draw failed: the counter has reached `Number.MAX_SAFE_INTEGER`, or the requested range is not allowed.
 */
export type RngFailureReason = (typeof RNG_FAILURES)[keyof typeof RNG_FAILURES];

/**
 * A successful draw.
 */
export interface RngSuccess {
  /** Marks a successful draw. */
  readonly ok: true;
  /** The drawn value. */
  readonly value: number;
  /** The generator state after the draw. */
  readonly rng: RngState;
}

/**
 * Several values drawn in a row.
 */
export interface RngSeries {
  /** Marks a successful draw. */
  readonly ok: true;
  /** The drawn values in order. */
  readonly values: readonly number[];
  /** The generator state after the last value. */
  readonly rng: RngState;
}

/**
 * A failed draw. The kernel rejects the command that needed the value, because the rules cannot go on.
 */
export interface RngFailure {
  /** Marks a failed draw. */
  readonly ok: false;
  /** Why the draw failed. */
  readonly reason: RngFailureReason;
}

/**
 * The reasons why a draw fails.
 */
export const RNG_FAILURES = Object.freeze({
  exhausted: 'exhausted',
  invalidRange: 'invalid-range',
} as const);

/**
 * Creates a generator with the given seed and a counter of 0.
 *
 * @param seed The 32 bytes of the seed as 64 lowercase hexadecimal digits.
 * @throws {RangeError} If the seed is not 64 lowercase hexadecimal digits.
 */
export function createRng(seed: string): RngState {
  checkSeed(seed);

  return { counter: 0, seed };
}

/**
 * Draws the next 32-bit unsigned value, the one with number `rng.counter`, and moves the counter by one.
 *
 * Fails with `exhausted` when the counter has reached `Number.MAX_SAFE_INTEGER`.
 *
 * @throws {RangeError} If the state is invalid: the seed is not 64 lowercase hexadecimal digits, or the counter is
 * not a safe integer from 0 to `Number.MAX_SAFE_INTEGER`.
 */
export function rngNext(rng: RngState): RngResult {
  const words = new WordStream(rng);
  const value = words.next();

  return value === undefined ? EXHAUSTED : { ok: true, rng: words.state(), value };
}

/**
 * Draws a uniformly distributed integer from `min` to `max` inclusive.
 *
 * The bounds are safe integers, `min` is not greater than `max`, and the range holds at most 2^32 numbers;
 * otherwise the draw fails with `invalid-range` and the counter does not move. With `n = max - min + 1` and
 * `L = 2^32 - (2^32 mod n)`, the generator draws values until one is less than `L` and returns `min + (value mod n)`.
 * Every drawn value moves the counter, the rejected ones too. The draw fails with `exhausted` if the counter reaches
 * `Number.MAX_SAFE_INTEGER` first.
 *
 * @throws {RangeError} If the state is invalid, as in {@link rngNext}.
 */
export function rngRange(rng: RngState, min: number, max: number): RngResult {
  const series = rngRangeSeries(rng, min, max, 1);

  if (!series.ok) return series;

  const [value = min] = series.values;

  return { ok: true, rng: series.rng, value };
}

/**
 * Draws `count` integers from `min` to `max` inclusive one after another, as `count` calls of {@link rngRange} would,
 * but reads the seed once and computes each block of eight values once.
 *
 * @throws {RangeError} If the state is invalid, as in {@link rngNext}, or `count` is not a safe integer from 0.
 */
export function rngRangeSeries(rng: RngState, min: number, max: number, count: number): RngSeriesResult {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('The number of values must be a whole number.');

  const words = new WordStream(rng);

  if (!isAllowedRange(min, max)) return INVALID_RANGE;

  const size = max - min + 1;
  const limit = WORD_RANGE - (WORD_RANGE % size);
  const values: number[] = [];

  while (values.length < count) {
    const word = words.next();

    if (word === undefined) return EXHAUSTED;

    if (word < limit) values.push(min + (word % size));
  }

  return { ok: true, rng: words.state(), values };
}

const SEED = /^[0-9a-f]{64}$/;
const MAX_COUNTER = Number.MAX_SAFE_INTEGER;
const WORD_RANGE = 0x100000000;
const VALUES_PER_BLOCK = 8;
const WORD_BYTES = 4;
const SEED_BYTES = 32;
const EXHAUSTED: RngFailure = Object.freeze({ ok: false, reason: RNG_FAILURES.exhausted });
const INVALID_RANGE: RngFailure = Object.freeze({ ok: false, reason: RNG_FAILURES.invalidRange });

class WordStream {
  private readonly seed: string;

  private readonly message: Uint8Array;

  private counter: number;

  private block = -1;

  private digest: DataView = new DataView(new ArrayBuffer(0));

  constructor(rng: RngState) {
    checkSeed(rng.seed);
    checkCounter(rng.counter);
    this.seed = rng.seed;
    this.counter = rng.counter;
    this.message = new Uint8Array(SEED_BYTES + 8);
    this.message.set(seedBytes(rng.seed));
  }

  next(): number | undefined {
    if (this.counter === MAX_COUNTER) return undefined;

    const block = Math.floor(this.counter / VALUES_PER_BLOCK);

    if (block !== this.block) {
      const view = new DataView(this.message.buffer);

      view.setUint32(SEED_BYTES, Math.floor(block / WORD_RANGE));
      view.setUint32(SEED_BYTES + WORD_BYTES, block % WORD_RANGE);
      this.digest = new DataView(sha256(this.message).buffer);
      this.block = block;
    }

    const value = this.digest.getUint32((this.counter % VALUES_PER_BLOCK) * WORD_BYTES);

    this.counter += 1;

    return value;
  }

  state(): RngState {
    return { counter: this.counter, seed: this.seed };
  }
}

function seedBytes(seed: string): Uint8Array {
  return Uint8Array.from(
    new Array<number>(SEED_BYTES).keys(),
    (index) => Number.parseInt(seed.slice(index * 2, index * 2 + 2), 16),
  );
}

function isAllowedRange(min: number, max: number): boolean {
  return Number.isSafeInteger(min) && Number.isSafeInteger(max) && min <= max && max - min < WORD_RANGE;
}

function checkSeed(seed: string): void {
  if (!SEED.test(seed)) throw new RangeError('The seed must be 64 lowercase hexadecimal digits.');
}

function checkCounter(counter: number): void {
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new RangeError('The counter must be a safe integer from 0 to Number.MAX_SAFE_INTEGER.');
  }
}
