import { cubeDistance, cubeRange, cubeToOffset, isInside, offset, offsetKey, offsetToCube } from '@heroes2dgame/hex';
import { checkTopology } from '@heroes2dgame/testkit';
import { describe, expect, it } from 'vitest';
import { HEX_TOPOLOGY, type HexParams } from '../index.ts';

const FIELDS: readonly HexParams[] = [
  { height: 4, width: 5 },
  { height: 1, width: 1 },
  { costs: { '1,1': 3 }, height: 3, width: 3 },
];

checkTopology(HEX_TOPOLOGY, FIELDS, { describe, expect, it });

describe('the topology of hexes', () => {
  it('lists the hexes row by row and their neighbors from east counterclockwise', () => {
    expect(HEX_TOPOLOGY.cells({ height: 2, width: 3 })).toStrictEqual(['0,0', '1,0', '2,0', '0,1', '1,1', '2,1']);
    expect(HEX_TOPOLOGY.neighbors(FIELD, '1,1')).toStrictEqual(['2,1', '2,0', '1,0', '0,1', '1,2', '2,2']);
    expect(HEX_TOPOLOGY.neighbors(FIELD, '1,2')).toStrictEqual(['2,2', '1,1', '0,1', '0,2', '0,3', '1,3']);
    expect(HEX_TOPOLOGY.neighbors(FIELD, '0,0')).toStrictEqual(['1,0', '0,1']);
  });

  it('measures the steps between hexes and the costs of steps into them', () => {
    expect(HEX_TOPOLOGY.distance(FIELD, '0,0', '4,3')).toBe(6);
    expect(HEX_TOPOLOGY.distance(FIELD, '1,1', '1,2')).toBe(1);
    expect(HEX_TOPOLOGY.moveCost(FIELD, '0,0', '1,0', BODY)).toBe(1);
    expect(HEX_TOPOLOGY.moveCost({ ...FIELD, costs: { '1,0': 3 } }, '0,0', '1,0', BODY)).toBe(3);
  });

  it('draws lines between hexes without both ends', () => {
    expect(HEX_TOPOLOGY.line?.(FIELD, '0,0', '4,0')).toStrictEqual(['1,0', '2,0', '3,0']);
    expect(HEX_TOPOLOGY.line?.(FIELD, '0,0', '1,0')).toStrictEqual([]);
    expect(HEX_TOPOLOGY.line?.(FIELD, '0,0', '1,2')).toStrictEqual(['0,1']);
  });

  it('gives a radius, a line through the center and beyond, and a cone of 60 degrees', () => {
    expect(sorted(HEX_TOPOLOGY.area(FIELD, { shape: 'radius', size: 1 }, '0,0'))).toStrictEqual(['0,0', '0,1', '1,0']);
    expect(HEX_TOPOLOGY.area(FIELD, { shape: 'line', size: 3 }, '1,0', '0,0')).toStrictEqual(['1,0', '2,0', '3,0']);

    expect(HEX_TOPOLOGY.area(FIELD, { shape: 'line', size: 5 }, '1,0', '0,0'))
      .toStrictEqual(['1,0', '2,0', '3,0', '4,0']);

    expect(HEX_TOPOLOGY.area(FIELD, { shape: 'line', size: 3 }, '1,0')).toStrictEqual(['1,0']);

    expect(sorted(HEX_TOPOLOGY.area(FIELD, { shape: 'cone', size: 2 }, '2,1', '1,1')))
      .toStrictEqual(['2,1', '3,0', '3,1', '3,2']);
  });

  it('counts sizes beyond the field as its width and height, and leaves an origin in the center empty', () => {
    const all = HEX_TOPOLOGY.cells(FIELD);

    expect(sorted(HEX_TOPOLOGY.area(FIELD, { shape: 'radius', size: 1e9 }, '2,2'))).toStrictEqual(sorted(all));

    expect(HEX_TOPOLOGY.area(FIELD, { shape: 'line', size: 1e9 }, '1,0', '0,0'))
      .toStrictEqual(['1,0', '2,0', '3,0', '4,0']);

    expect(HEX_TOPOLOGY.area(FIELD, { shape: 'cone', size: 1e9 }, '1,0', '0,0').length).toBeGreaterThan(4);
    expect(HEX_TOPOLOGY.area(FIELD, { shape: 'line', size: 3 }, '1,0', '1,0')).toStrictEqual([]);
    expect(HEX_TOPOLOGY.area(FIELD, { shape: 'cone', size: 3 }, '1,0', '1,0')).toStrictEqual([]);
    expect(HEX_TOPOLOGY.area(FIELD, { shape: 'line', size: 0 }, '2,0', '0,0')).toStrictEqual([]);
    expect(HEX_TOPOLOGY.area(FIELD, { shape: 'line', size: 3 }, '2,0', '0,0')).toStrictEqual(['1,0', '2,0', '3,0']);
    expect(HEX_TOPOLOGY.area(FIELD, { shape: 'line', size: 1 }, '2,0', '0,0')).toStrictEqual(['1,0']);
    expect(HEX_TOPOLOGY.footprint(FIELD, '4,0', { ...BODY, size: 1e9 })).toBeUndefined();
    expect(() => HEX_TOPOLOGY.cells({ height: 1, width: 1001 })).toThrow('needs a width and a height from 1 to 1000');
  });

  it('reaches every hex of a square and of a tall field with an area of a huge size', () => {
    const square: HexParams = { height: 9, width: 9 };
    const tall: HexParams = { height: 9, width: 3 };

    for (const params of [square, tall]) {
      expect(sorted(HEX_TOPOLOGY.area(params, { shape: 'radius', size: 1e9 }, '0,0')))
        .toStrictEqual(sorted(HEX_TOPOLOGY.cells(params)));
    }

    expect(HEX_TOPOLOGY.area(square, { shape: 'cone', size: 1e9 }, '8,8', '0,0')).toContain('8,8');
    expect(HEX_TOPOLOGY.area(tall, { shape: 'cone', size: 1e9 }, '2,8', '0,0')).toContain('2,8');
  });

  it('gives the hexes of a radius and a cone in the same order however large they are', () => {
    const square: HexParams = { height: 9, width: 9 };
    const center = offsetToCube(offset(4, 4));

    for (const size of [2, 5, 12]) {
      const expected = cubeRange(center, size).filter((hex) => isInside(cubeToOffset(hex), square))
        .map((hex) => offsetKey(cubeToOffset(hex)));
      const cone = HEX_TOPOLOGY.area(square, { shape: 'cone', size }, '8,4', '4,4');

      expect(HEX_TOPOLOGY.area(square, { shape: 'radius', size }, '4,4')).toStrictEqual(expected);
      expect(cone.every((cell) => cubeDistance(center, offsetToCube(offset(...pointOf(cell)))) <= size)).toBe(true);
      expect(cone.length).toBeGreaterThan(0);
    }
  });

  it('puts a big creature in its hex and the hexes behind it, away from where it faces', () => {
    expect(HEX_TOPOLOGY.footprint(FIELD, '1,1', { ...BODY, size: 2 })).toStrictEqual(['1,1', '0,1']);
    expect(HEX_TOPOLOGY.footprint(FIELD, '1,1', { ...BODY, facing: 'west', size: 2 })).toStrictEqual(['1,1', '2,1']);
    expect(HEX_TOPOLOGY.footprint(FIELD, '0,1', { ...BODY, size: 2 })).toBeUndefined();
    expect(HEX_TOPOLOGY.footprint(FIELD, '1,1', { ...BODY, facing: 'up', size: 2 })).toBeUndefined();

    expect(HEX_TOPOLOGY.directions?.(FIELD))
      .toStrictEqual(['east', 'northEast', 'northWest', 'west', 'southWest', 'southEast']);
  });

  it('refuses a hex that is not a hex and a field of a wrong size', () => {
    expect(() => HEX_TOPOLOGY.distance(FIELD, '0,0', 'a1')).toThrow('The cell "a1" is not a hex like "3,5".');
    expect(() => HEX_TOPOLOGY.cells({ height: 0, width: 3 })).toThrow('needs a width and a height from 1 to 1000');
  });
});

const FIELD: HexParams = { height: 4, width: 5 };

const BODY = { movement: 'walk', size: 1 } as const;

function pointOf(cell: string): readonly [number, number] {
  const [column = 0, row = 0] = cell.split(',').map(Number);

  return [column, row];
}

function sorted(cells: readonly string[]): readonly string[] {
  return [...cells].sort();
}
