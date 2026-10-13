/**
 * Computes the SHA-256 digest of bytes as specified in FIPS 180-4.
 */
export function sha256(bytes: Uint8Array): Uint8Array {
  const message = padMessage(bytes);
  const state = new DataView(INITIAL_HASH.buffer.slice(0));
  const schedule = new DataView(new ArrayBuffer(ROUNDS * WORD_BYTES));

  for (let offset = 0; offset < message.byteLength; offset += BLOCK_BYTES) {
    compressBlock(state, message, offset, schedule);
  }

  return new Uint8Array(state.buffer);
}

const WORD_BYTES = 4;
const BLOCK_BYTES = 64;
const LENGTH_BYTES = 8;
const ROUNDS = 64;
const WORD_RANGE = 0x100000000;
const BITS_PER_BYTE = 8;
const END_MARKER = 0x80;

const INITIAL_HASH = wordsView([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const ROUND_CONSTANTS = wordsView([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function padMessage(bytes: Uint8Array): DataView {
  const blocks = Math.ceil((bytes.length + 1 + LENGTH_BYTES) / BLOCK_BYTES);
  const padded = new Uint8Array(blocks * BLOCK_BYTES);
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * BITS_PER_BYTE;

  padded.set(bytes);
  padded.set([END_MARKER], bytes.length);
  view.setUint32(padded.length - LENGTH_BYTES, Math.floor(bitLength / WORD_RANGE));
  view.setUint32(padded.length - WORD_BYTES, bitLength % WORD_RANGE);

  return view;
}

function compressBlock(state: DataView, message: DataView, offset: number, schedule: DataView): void {
  for (let round = 0; round < 16; round += 1) {
    schedule.setUint32(round * WORD_BYTES, message.getUint32(offset + round * WORD_BYTES));
  }

  for (let round = 16; round < ROUNDS; round += 1) {
    const sum = smallSigma1(word(schedule, round - 2))
      + word(schedule, round - 7)
      + smallSigma0(word(schedule, round - 15))
      + word(schedule, round - 16);

    schedule.setUint32(round * WORD_BYTES, toUint32(sum));
  }

  let a = word(state, 0);
  let b = word(state, 1);
  let c = word(state, 2);
  let d = word(state, 3);
  let e = word(state, 4);
  let f = word(state, 5);
  let g = word(state, 6);
  let h = word(state, 7);

  for (let round = 0; round < ROUNDS; round += 1) {
    const first = h + bigSigma1(e) + choose(e, f, g) + word(ROUND_CONSTANTS, round) + word(schedule, round);
    const second = bigSigma0(a) + majority(a, b, c);

    h = g;
    g = f;
    f = e;
    e = toUint32(d + first);
    d = c;
    c = b;
    b = a;
    a = toUint32(first + second);
  }

  [a, b, c, d, e, f, g, h].forEach((value, index) => {
    state.setUint32(index * WORD_BYTES, toUint32(word(state, index) + value));
  });
}

function word(view: DataView, index: number): number {
  return view.getUint32(index * WORD_BYTES);
}

function toUint32(value: number): number {
  return value >>> 0;
}

function rotateRight(value: number, bits: number): number {
  return toUint32((value >>> bits) | (value << (32 - bits)));
}

function choose(x: number, y: number, z: number): number {
  return toUint32((x & y) ^ (~x & z));
}

function majority(x: number, y: number, z: number): number {
  return toUint32((x & y) ^ (x & z) ^ (y & z));
}

function bigSigma0(x: number): number {
  return toUint32(rotateRight(x, 2) ^ rotateRight(x, 13) ^ rotateRight(x, 22));
}

function bigSigma1(x: number): number {
  return toUint32(rotateRight(x, 6) ^ rotateRight(x, 11) ^ rotateRight(x, 25));
}

function smallSigma0(x: number): number {
  return toUint32(rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3));
}

function smallSigma1(x: number): number {
  return toUint32(rotateRight(x, 17) ^ rotateRight(x, 19) ^ (x >>> 10));
}

function wordsView(words: readonly number[]): DataView {
  const view = new DataView(new ArrayBuffer(words.length * WORD_BYTES));

  words.forEach((value, index) => {
    view.setUint32(index * WORD_BYTES, value);
  });

  return view;
}
