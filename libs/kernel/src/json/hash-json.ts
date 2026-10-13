import { sha256, utf8Encode } from '../crypto/index.ts';
import { canonicalJson } from './canonical-json.ts';

/**
 * Computes the SHA-256 hash of the canonical JSON of a value and returns it as 64 lowercase hexadecimal digits.
 *
 * The kernel uses it for the state hash and the projection hash, and the content loader uses it for the content
 * hash: the value is written with {@link canonicalJson}, encoded as UTF-8 and hashed.
 *
 * @throws {TypeError | RangeError} If {@link canonicalJson} rejects the value.
 */
export function hashJson(value: unknown): string {
  return toHex(sha256(utf8Encode(canonicalJson(value))));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
