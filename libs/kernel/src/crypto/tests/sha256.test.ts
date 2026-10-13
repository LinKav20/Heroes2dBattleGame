import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sha256 } from '../index.ts';

describe('sha256', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ])('hashes the FIPS 180-4 example %j', (text, digest) => {
    expect(hex(sha256(new TextEncoder().encode(text)))).toBe(digest);
  });

  it('matches node:crypto for every length around the padding boundaries', () => {
    const mismatches = [...new Array<number>(200).keys()]
      .map(patternBytes)
      .filter((bytes) => hex(sha256(bytes)) !== reference(bytes))
      .map((bytes) => bytes.length);

    expect(mismatches).toStrictEqual([]);
  });

  it('matches node:crypto on random bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 1000 }), (bytes) => {
        expect(hex(sha256(bytes))).toBe(reference(bytes));
      }),
    );
  });

  it('matches node:crypto on an input of many blocks', () => {
    const bytes = patternBytes(1_000_003);

    expect(hex(sha256(bytes))).toBe(reference(bytes));
  });

  it('does not change its input', () => {
    const bytes = patternBytes(100);
    const copy = bytes.slice();

    sha256(bytes);

    expect(bytes).toStrictEqual(copy);
  });

  it('returns a new 32-byte digest on every call', () => {
    const first = sha256(patternBytes(10));
    const second = sha256(patternBytes(10));

    expect(first).toHaveLength(32);
    expect(first).not.toBe(second);
    expect(first).toStrictEqual(second);
  });
});

function patternBytes(length: number): Uint8Array {
  return Uint8Array.from(new Array<number>(length).keys(), (index) => (index * 31 + 7) % 256);
}

function reference(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}
