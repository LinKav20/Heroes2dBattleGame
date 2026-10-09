import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cube, cubeAdd, cubeDistance, cubeLine, type Cube } from '../index.ts';
import { anyCube, fieldHexes, hexKey, referenceLine } from './arbitraries.ts';

const FIELD_LINES_SHA256 = '9388560521a9a8a38c86974e128e103a0fd6e39e304e4c19cdc6f5988f0eb959';
const MAX_DISTANCE = 47_452;

describe('line', () => {
  it('starts and ends at the endpoints, has distance + 1 hexes and moves between neighbors', () => {
    fc.assert(
      fc.property(anyCube, anyCube, (a, b) => {
        expectValidLine(a, b, cubeLine(a, b));
      }),
    );
  });

  it('matches the floating-point reference algorithm', () => {
    fc.assert(
      fc.property(anyCube, anyCube, (a, b) => {
        expect(cubeLine(a, b)).toStrictEqual(referenceLine(a, b));
      }),
    );
  });

  it('is the same in both directions', () => {
    fc.assert(
      fc.property(anyCube, anyCube, (a, b) => {
        expect(cubeLine(b, a).reverse()).toStrictEqual(cubeLine(a, b));
      }),
    );
  });

  it('does not depend on where the line is', () => {
    fc.assert(
      fc.property(anyCube, anyCube, anyCube, (a, b, shift) => {
        const shifted = cubeLine(cubeAdd(a, shift), cubeAdd(b, shift));

        expect(shifted).toStrictEqual(cubeLine(a, b).map((hex) => cubeAdd(hex, shift)));
      }),
    );
  });

  it('from a hex to itself is that hex alone', () => {
    fc.assert(
      fc.property(anyCube, (hex) => {
        expect(cubeLine(hex, hex)).toStrictEqual([hex]);
      }),
    );
  });

  it('goes through fixed hexes', () => {
    expect(cubeLine(cube(0, 0), cube(2, -1))).toStrictEqual([cube(0, 0), cube(1, 0), cube(2, -1)]);

    expect(cubeLine(cube(0, 0), cube(3, -5))).toStrictEqual([
      cube(0, 0),
      cube(1, -1),
      cube(1, -2),
      cube(2, -3),
      cube(2, -4),
      cube(3, -5),
    ]);

    expect(cubeLine(cube(-2, 4), cube(4, 1))).toStrictEqual([
      cube(-2, 4),
      cube(-1, 4),
      cube(0, 3),
      cube(1, 3),
      cube(2, 2),
      cube(3, 2),
      cube(4, 1),
    ]);
  });

  it('matches the reference and is symmetric for every pair of hexes on the field', () => {
    const field = fieldHexes();

    for (const a of field) {
      for (const b of field) {
        const line = cubeLine(a, b);

        expect(line).toStrictEqual(referenceLine(a, b));
        expect(cubeLine(b, a).reverse()).toStrictEqual(line);
      }
    }
  });

  it('gives the golden lines on the field: "col,row" keys joined by ";", lines by "\\n", rows then columns', () => {
    const field = fieldHexes();
    const lines = field.flatMap((a) => field.map((b) => cubeLine(a, b).map(hexKey).join(';')));

    expect(createHash('sha256').update(lines.join('\n')).digest('hex')).toBe(FIELD_LINES_SHA256);
  });

  it('works far from the origin', () => {
    const a = cube(2_300_000_000, 0);
    const b = cube(2_300_000_003, -1);

    expectValidLine(a, b, cubeLine(a, b));
  });

  it('accepts the longest exact line and rejects a longer one', () => {
    const a = cube(-30_000, 0);

    expectValidLine(a, cube(MAX_DISTANCE - 30_000, 0), cubeLine(a, cube(MAX_DISTANCE - 30_000, 0)));
    expect(() => cubeLine(a, cube(MAX_DISTANCE + 1 - 30_000, 0))).toThrow(RangeError);
  });
});

function expectValidLine(from: Cube, to: Cube, line: Cube[]): void {
  expect(line).toHaveLength(cubeDistance(from, to) + 1);
  expect(line.at(0)).toStrictEqual(from);
  expect(line.at(-1)).toStrictEqual(to);

  expect(line.slice(1).every((hex, index) => {
    const previous = line[index];

    return previous !== undefined && cubeDistance(previous, hex) === 1;
  })).toBe(true);
}
