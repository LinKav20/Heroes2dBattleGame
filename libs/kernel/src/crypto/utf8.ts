/**
 * Encodes a string as UTF-8.
 *
 * @throws {TypeError} If the string contains a lone surrogate, which has no UTF-8 form.
 */
export function utf8Encode(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * MAX_BYTES_PER_UNIT);
  let length = 0;
  let index = 0;

  while (index < text.length) {
    const unit = text.charCodeAt(index);

    if (unit < 0x80) {
      bytes[length] = unit;
      length += 1;
      index += 1;
      continue;
    }

    const codePoint = readCodePoint(text, index);
    const size = utf8Size(codePoint);

    if (size === 1) {
      bytes[length] = codePoint;
    } else {
      bytes[length] = ((LEAD_BITS >> size) & 0xff) | (codePoint >> (6 * (size - 1)));

      for (let continuation = 1; continuation < size; continuation += 1) {
        bytes[length + continuation] = 0x80 | ((codePoint >> (6 * (size - 1 - continuation))) & 0x3f);
      }
    }

    length += size;
    index += codePoint > MAX_SINGLE_UNIT ? 2 : 1;
  }

  return bytes.slice(0, length);
}

/**
 * Tells whether a string has no lone surrogates, that is, whether every UTF-16 surrogate is part of a pair.
 */
export function isWellFormedText(text: string): boolean {
  return findLoneSurrogate(text) === -1;
}

const MAX_SINGLE_UNIT = 0xffff;
const MAX_BYTES_PER_UNIT = 3;
const LEAD_BITS = 0xff00;
const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;
const LOW_SURROGATE_MIN = 0xdc00;
const LOW_SURROGATE_MAX = 0xdfff;

function readCodePoint(text: string, index: number): number {
  const unit = text.charCodeAt(index);

  if (isLowSurrogate(unit)) throw loneSurrogateError(index);

  if (!isHighSurrogate(unit)) return unit;

  const next = text.charCodeAt(index + 1);

  if (!isLowSurrogate(next)) throw loneSurrogateError(index);

  return (unit - HIGH_SURROGATE_MIN) * 0x400 + (next - LOW_SURROGATE_MIN) + 0x10000;
}

function utf8Size(codePoint: number): number {
  if (codePoint < 0x80) return 1;

  if (codePoint < 0x800) return 2;

  return codePoint < 0x10000 ? 3 : 4;
}

function findLoneSurrogate(text: string): number {
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);

    if (isLowSurrogate(unit)) return index;

    if (isHighSurrogate(unit)) {
      if (!isLowSurrogate(text.charCodeAt(index + 1))) return index;

      index += 1;
    }
  }

  return -1;
}

function isHighSurrogate(unit: number): boolean {
  return unit >= HIGH_SURROGATE_MIN && unit <= HIGH_SURROGATE_MAX;
}

function isLowSurrogate(unit: number): boolean {
  return unit >= LOW_SURROGATE_MIN && unit <= LOW_SURROGATE_MAX;
}

function loneSurrogateError(index: number): TypeError {
  return new TypeError(`The text has a lone surrogate at index ${String(index)}, which has no UTF-8 form.`);
}
