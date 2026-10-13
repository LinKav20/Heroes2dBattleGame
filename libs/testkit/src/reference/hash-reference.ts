import type { HashReference } from './types.ts';

/**
 * Reference values of the state hash: JSON inputs, their canonical JSON by RFC 8785 and the SHA-256 of it.
 */
export const HASH_REFERENCE: readonly HashReference[] = [
  {
    json: 'null',
    canonical: 'null',
    hash: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
  },
  {
    json: 'true',
    canonical: 'true',
    hash: 'b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b',
  },
  {
    json: 'false',
    canonical: 'false',
    hash: 'fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa',
  },
  {
    json: '0',
    canonical: '0',
    hash: '5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9',
  },
  {
    json: '-0',
    canonical: '0',
    hash: '5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9',
  },
  {
    json: '9007199254740991',
    canonical: '9007199254740991',
    hash: 'f40b423c2dd95ff2b2f027e22208f438cf7242862e5e746860e697308c9add26',
  },
  {
    json: '-9007199254740991',
    canonical: '-9007199254740991',
    hash: '4c933a456bb8f2e9894b2d0b26480439cd72d52fb8a27cbf8fd7f323f22c7815',
  },
  {
    json: '""',
    canonical: '""',
    hash: '12ae32cb1ec02d01eda3581b127c1fee3b0dc53572ed6baf239721a03d82e126',
  },
  {
    json: '"a\\"b\\\\c\\n\\t\\u0001\\u001f\\u007f\\u2028"',
    canonical: '"a\\"b\\\\c\\n\\t\\u0001\\u001f\u007f\u2028"',
    hash: '27096608169d3def39f80d02ca5d3d4e6f3f0def3d8b6ff2271f89711a8f65c4',
  },
  {
    json: '"\\b\\f\\r\\u0000\\/\\u001F<>&\\u2029"',
    canonical: '"\\b\\f\\r\\u0000/\\u001f<>&\u2029"',
    hash: '43824f96f4bfc2eae18b0e22a236b4cdbfb0f778ad61e72c7581f7b6efaef9b8',
  },
  {
    json: '"\\u00f6\\u20ac\\ud83d\\ude00"',
    canonical: '"\u00f6\u20ac\u{1f600}"',
    hash: 'ecca4ef1d8ef4762d0abaaae4193c7f01c0067d33c734631519a4712274b0318',
  },
  {
    json: '[]',
    canonical: '[]',
    hash: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  },
  {
    json: '{}',
    canonical: '{}',
    hash: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
  },
  {
    json: '[1,[2,[3,[]]],{}]',
    canonical: '[1,[2,[3,[]]],{}]',
    hash: '5db7d23e5474d84be36b236bac8ca6ebd976bff5971ae01bcd8d21ac495073e6',
  },
  {
    json: '{ "b" : [ 1 , 2 ] , "a" : { } }',
    canonical: '{"a":{},"b":[1,2]}',
    hash: '4b42ac649a6785637796cda3552634658d54c4c3fccd17337b11d34ba6f1361e',
  },
  {
    json: '{"ab":1,"a":2,"":3,"b":4}',
    canonical: '{"":3,"a":2,"ab":1,"b":4}',
    hash: '4ff0ef21f3e9bf664a18607645c43fe410953e4c929d0f78082eb5dcf3a8b335',
  },
  {
    json: '{"\\u20ac":1,"\\r":2,"\\ufb33":3,"1":4,"\\ud83d\\ude00":5,"\\u0080":6,'
      + '"\\u00f6":7}',
    canonical: '{"\\r":2,"1":4,"\u0080":6,"\u00f6":7,"\u20ac":1,"\u{1f600}":5,"\ufb33":3}',
    hash: '0d922ac8e15a6d17d5d50fab064983e86009ebae7b5998cbfc4ed172e6ff74a9',
  },
  {
    json: '{"round":3,"phase":{"kind":"turn","unit":"archers-1"},'
      + '"units":[{"id":"archers-1","count":10,"hp":7,"tags":{"Debuff.Poison":2}}],'
      + '"rng":{"seed":"0000000000000000000000000000000000000000000000000000000000000000"'
      + ',"counter":12}}',
    canonical: '{"phase":{"kind":"turn","unit":"archers-1"},"rng":{"counter":12,'
      + '"seed":"0000000000000000000000000000000000000000000000000000000000000000"},'
      + '"round":3,"units":[{"count":10,"hp":7,"id":"archers-1",'
      + '"tags":{"Debuff.Poison":2}}]}',
    hash: 'db10c9c96331980abd84a100809ebfb2bb475e9a73e24f3cfa6cb540d131c12c',
  },
];

/**
 * JSON inputs that canonical JSON rejects: fractions, unsafe integers, an infinite number and lone surrogates.
 */
export const HASH_REJECTED: readonly string[] = [
  '1.5',
  '9007199254740992',
  '-9007199254740992',
  '1e400',
  '"\\ud800"',
  '{"\\udc00":1}',
  '[1,[2.5]]',
];
