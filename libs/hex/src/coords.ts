/**
 * A hex in zero-based "column, row" coordinates. This is how a hex is stored in data and shown to people.
 * Hexes are pointy-topped, and odd rows are shifted right by half a hex (the "odd-r" layout).
 * Create values with `offset` or the other functions of this package: they check every coordinate.
 * The type carries a type-only brand, so a plain object literal does not type-check, and data from JSON
 * goes through `offset` as well. Spread copies, `Object.assign`, `as`, `any` and a literal that spells out
 * the brand key still bypass the brand: do not build hexes that way.
 */
export interface Offset {
  readonly col: number;
  readonly row: number;

  /** A type-only brand. It does not exist at runtime and is not part of the JSON form. */
  readonly '@heroes2dgame/hex:Offset': true;
}

/**
 * A hex in cube coordinates. The sum q + r + s is always zero.
 * Create values with `cube` or the other functions of this package: they check every coordinate.
 * The type carries a type-only brand, so a plain object literal does not type-check, and data from JSON
 * goes through `cube` as well. Spread copies, `Object.assign`, `as`, `any` and a literal that spells out
 * the brand key still bypass the brand: do not build hexes that way.
 */
export interface Cube {
  readonly q: number;
  readonly r: number;
  readonly s: number;

  /** A type-only brand. It does not exist at runtime and is not part of the JSON form. */
  readonly '@heroes2dgame/hex:Cube': true;
}

/** Creates a hex in cube coordinates from q and r. Throws `RangeError` if q, r or s is not a safe integer. */
export function cube(q: number, r: number): Cube {
  const s = 0 - q - r;

  if (!Number.isSafeInteger(q) || !Number.isSafeInteger(r) || !Number.isSafeInteger(s)) {
    throw new RangeError(`Cube coordinates must be safe integers, got q=${String(q)}, r=${String(r)}.`);
  }

  const hex = { q: normalizeZero(q), r: normalizeZero(r), s: normalizeZero(s) };

  return hex as Cube;
}

/** Creates a hex in "column, row" coordinates. Throws `RangeError` if a coordinate is not a safe integer. */
export function offset(col: number, row: number): Offset {
  if (!Number.isSafeInteger(col) || !Number.isSafeInteger(row)) {
    throw new RangeError(`Offset coordinates must be safe integers, got col=${String(col)}, row=${String(row)}.`);
  }

  const hex = { col: normalizeZero(col), row: normalizeZero(row) };

  return hex as Offset;
}

/**
 * Converts "column, row" coordinates to cube coordinates: q = col - (row - (row & 1)) / 2, r = row.
 * Throws `RangeError` if the result is not a safe integer.
 */
export function offsetToCube(hex: Offset): Cube {
  const q = hex.col - (hex.row - (hex.row & 1)) / 2;

  return cube(q, hex.row);
}

/**
 * Converts cube coordinates to "column, row" coordinates: col = q + (r - (r & 1)) / 2, row = r.
 * For a valid cube the result is always a safe integer.
 */
export function cubeToOffset(hex: Cube): Offset {
  const col = hex.q + (hex.r - (hex.r & 1)) / 2;

  return offset(col, hex.r);
}

/** Checks whether two hexes are the same. */
export function cubeEquals(a: Cube, b: Cube): boolean {
  return a.q === b.q && a.r === b.r;
}

/** Checks whether two hexes are the same. */
export function offsetEquals(a: Offset, b: Offset): boolean {
  return a.col === b.col && a.row === b.row;
}

/** A string key of the form "column,row". Suitable for maps and sets. */
export function offsetKey(hex: Offset): string {
  return `${String(hex.col)},${String(hex.row)}`;
}

/**
 * Parses a key of the form "column,row", as produced by `offsetKey`.
 * Returns `null` for anything else: extra characters, leading zeros, "-0" or numbers outside safe integers.
 */
export function parseOffsetKey(key: string): Offset | null {
  const match = /^(0|-?[1-9]\d*),(0|-?[1-9]\d*)$/.exec(key);

  if (match === null) return null;

  const col = Number(match[1]);
  const row = Number(match[2]);

  if (!Number.isSafeInteger(col) || !Number.isSafeInteger(row)) return null;

  return offset(col, row);
}

function normalizeZero(value: number): number {
  return value + 0;
}
