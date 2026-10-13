import fc from 'fast-check';
import { createHash } from 'node:crypto';
import type { RngResult, RngState } from '../index.ts';

export const ZERO_SEED = '0'.repeat(64);

export const anySeed = fc
  .uint8Array({ maxLength: 32, minLength: 32 })
  .map((bytes) => Buffer.from(bytes).toString('hex'));

export const anyCounter = fc.oneof(
  fc.integer({ max: 1000, min: 0 }),
  fc.integer({ max: Number.MAX_SAFE_INTEGER - 1, min: 0 }),
);

export const anyRng = fc.record({ counter: anyCounter, seed: anySeed }, { noNullPrototype: true });

export const anyRange = fc
  .oneof(
    fc.tuple(fc.integer({ max: 100, min: -100 }), fc.integer({ max: 20, min: 0 })),
    fc.tuple(fc.maxSafeInteger(), fc.integer({ max: 2 ** 32 - 1, min: 0 })),
    fc.tuple(fc.integer({ max: 2 ** 31, min: 0 }), fc.integer({ max: 2 ** 31 + 2, min: 2 ** 31 - 2 })),
  )
  .map(([min, extra]) => [min, min + extra] as const)
  .filter(([, max]) => Number.isSafeInteger(max));

export function referenceValue(rng: RngState): number {
  const block = Buffer.alloc(8);

  block.writeBigUInt64BE(BigInt(rng.counter) / 8n);

  const digest = createHash('sha256').update(Buffer.from(rng.seed, 'hex')).update(block).digest();

  return digest.readUInt32BE((rng.counter % 8) * 4);
}

export function referenceRange(rng: RngState, min: number, max: number): RngResult {
  const size = BigInt(max) - BigInt(min) + 1n;
  const limit = 2n ** 32n - (2n ** 32n % size);

  for (let counter = rng.counter; counter < Number.MAX_SAFE_INTEGER; counter += 1) {
    const value = BigInt(referenceValue({ counter, seed: rng.seed }));

    if (value < limit) {
      return { ok: true, rng: { counter: counter + 1, seed: rng.seed }, value: Number(BigInt(min) + (value % size)) };
    }
  }

  return { ok: false, reason: 'exhausted' };
}
