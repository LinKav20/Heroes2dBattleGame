import fc from 'fast-check';

export const LONE_SURROGATES = ['\ud800', '\udfff', 'a\ud83d', '\ude00b', '\ude00\ud83d', '\ud83d\ud83d\ude00'];

export const textWithLoneSurrogate = fc
  .tuple(fc.string({ unit: 'binary' }), fc.integer({ min: 0xd800, max: 0xdfff }), fc.string({ unit: 'binary' }))
  .map(([before, surrogate, after]) => `${before}${String.fromCharCode(surrogate)}${after}`);
