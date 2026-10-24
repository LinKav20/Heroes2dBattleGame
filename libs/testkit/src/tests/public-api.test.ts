import { describe, expect, it } from 'vitest';
import * as testkit from '../index.ts';

describe('the public API of testkit', () => {
  it('exports only these values', () => {
    expect(Object.keys(testkit).sort())
      .toStrictEqual(['HASH_REFERENCE', 'HASH_REJECTED', 'RNG_REFERENCE', 'checkTopology']);
  });
});
