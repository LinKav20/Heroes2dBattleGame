import canonicalize from 'canonicalize';
import fc from 'fast-check';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashJson } from '../index.ts';
import { anyJson } from './helpers.ts';

describe('hashJson', () => {
  it('is the SHA-256 of the canonical JSON in UTF-8', () => {
    fc.assert(
      fc.property(anyJson, (value) => {
        const reference = createHash('sha256').update(canonicalize(value) ?? '', 'utf8').digest('hex');

        expect(hashJson(value)).toBe(reference);
      }),
    );
  });

  it('returns 64 lowercase hexadecimal digits', () => {
    fc.assert(
      fc.property(anyJson, (value) => {
        expect(hashJson(value)).toMatch(/^[0-9a-f]{64}$/);
      }),
    );
  });

  it('does not depend on the order of keys', () => {
    expect(hashJson({ hp: 3, count: 10 })).toBe(hashJson({ count: 10, hp: 3 }));
  });

  it('tells apart values that differ in one field', () => {
    expect(hashJson({ hp: 3 })).not.toBe(hashJson({ hp: 4 }));
  });

  it('rejects what canonical JSON rejects', () => {
    expect(() => hashJson({ hp: 0.5 })).toThrow(RangeError);
  });
});
