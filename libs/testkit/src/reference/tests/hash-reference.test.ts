import { canonicalJson, hashJson } from '@heroes2dgame/kernel';
import { describe, expect, it } from 'vitest';
import { HASH_REFERENCE, HASH_REJECTED } from '../index.ts';

describe('HASH_REFERENCE', () => {
  it.each(HASH_REFERENCE)('matches the kernel canonical JSON of $json', ({ canonical, json }) => {
    expect(canonicalJson(JSON.parse(json))).toBe(canonical);
  });

  it.each(HASH_REFERENCE)('matches the kernel hash of $json', ({ hash, json }) => {
    expect(hashJson(JSON.parse(json))).toBe(hash);
  });

  it.each(HASH_REJECTED)('rejects %s like the kernel', (json) => {
    expect(() => hashJson(JSON.parse(json))).toThrow();
  });
});
