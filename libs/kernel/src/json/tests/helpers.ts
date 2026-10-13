import fc from 'fast-check';

export const anyJson: fc.Arbitrary<unknown> = fc.letrec<{ json: unknown }>((tie) => ({
  json: fc.oneof(
    { depthSize: 'small' },
    fc.constant(null),
    fc.boolean(),
    fc.maxSafeInteger(),
    fc.string({ unit: 'binary' }),
    fc.array(tie('json')),
    fc.dictionary(fc.string({ unit: 'binary' }), tie('json')),
  ),
})).json;
