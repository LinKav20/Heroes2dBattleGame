import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isWellFormedText, utf8Encode } from '../index.ts';
import { LONE_SURROGATES, textWithLoneSurrogate } from './helpers.ts';

describe('utf8Encode', () => {
  it.each([
    ['', []],
    ['A', [0x41]],
    ['\u007f', [0x7f]],
    ['\u0080', [0xc2, 0x80]],
    ['\u07ff', [0xdf, 0xbf]],
    ['\u0800', [0xe0, 0xa0, 0x80]],
    ['\uffff', [0xef, 0xbf, 0xbf]],
    ['\u{10000}', [0xf0, 0x90, 0x80, 0x80]],
    ['\u{10ffff}', [0xf4, 0x8f, 0xbf, 0xbf]],
  ])('encodes %j at the edge of a byte length', (text, bytes) => {
    expect(Array.from(utf8Encode(text))).toStrictEqual(bytes);
  });

  it('matches TextEncoder on well-formed text', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        expect(utf8Encode(text)).toStrictEqual(new TextEncoder().encode(text));
      }),
    );
  });

  it.each(LONE_SURROGATES)('rejects the lone surrogate in %j', (text) => {
    expect(() => utf8Encode(text)).toThrow(TypeError);
  });

  it('rejects any text with a lone surrogate', () => {
    fc.assert(
      fc.property(textWithLoneSurrogate, (text) => {
        expect(() => utf8Encode(text)).toThrow(TypeError);
      }),
    );
  });
});

describe('isWellFormedText', () => {
  it('accepts well-formed text', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        expect(isWellFormedText(text)).toBe(true);
      }),
    );
  });

  it.each(LONE_SURROGATES)('rejects the lone surrogate in %j', (text) => {
    expect(isWellFormedText(text)).toBe(false);
  });

  it('rejects any text with a lone surrogate', () => {
    fc.assert(
      fc.property(textWithLoneSurrogate, (text) => {
        expect(isWellFormedText(text)).toBe(false);
      }),
    );
  });
});
