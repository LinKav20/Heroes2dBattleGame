/**
 * Reference values of the random number generator for one seed.
 */
export interface RngReference {
  /** The seed as 64 lowercase hexadecimal digits. */
  readonly seed: string;
  /** Single values of the generator. */
  readonly values: readonly RngValueReference[];
  /** Draws from ranges. */
  readonly ranges: readonly RngRangeReference[];
  /** Draws that must fail. */
  readonly failures: readonly RngFailureReference[];
}

/**
 * The value the generator issues at a counter.
 */
export interface RngValueReference {
  /** The counter before the draw. */
  readonly counter: number;
  /** The 32-bit unsigned value with this number. */
  readonly value: number;
}

/**
 * A draw from the range from `min` to `max` inclusive.
 */
export interface RngRangeReference {
  /** The counter before the draw. */
  readonly counter: number;
  /** The lower bound. */
  readonly min: number;
  /** The upper bound. */
  readonly max: number;
  /** The drawn number. */
  readonly value: number;
  /** The counter after the draw, rejected values included. */
  readonly nextCounter: number;
}

/**
 * A draw that must fail: a single value when `min` and `max` are absent, otherwise a draw from the range.
 */
export interface RngFailureReference {
  /** The counter before the draw; it does not move. */
  readonly counter: number;
  /** The lower bound of the range, if the draw is from a range. */
  readonly min?: number;
  /** The upper bound of the range, if the draw is from a range. */
  readonly max?: number;
  /** Why the draw fails. */
  readonly reason: 'exhausted' | 'invalid-range';
}

/**
 * A JSON input with its canonical JSON and state hash.
 */
export interface HashReference {
  /** The input as JSON text. */
  readonly json: string;
  /** The canonical JSON of the input by RFC 8785. */
  readonly canonical: string;
  /** The SHA-256 of the canonical JSON in UTF-8 as 64 lowercase hexadecimal digits. */
  readonly hash: string;
}
