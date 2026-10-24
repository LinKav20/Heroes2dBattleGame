import type { JsonObject, TopologyExtension } from '@heroes2dgame/kernel';
import { describe, expect, it } from 'vitest';
import { checkTopology, type ContractRunner } from '../index.ts';

interface SquareParams extends JsonObject {
  readonly width: number;
  readonly height: number;
}

checkTopology(squareTopology(), [{ height: 3, width: 4 }, { height: 1, width: 1 }], { describe, expect, it });

describe('checkTopology', () => {
  it('passes a topology that keeps the contract', () => {
    expect(failures(squareTopology())).toStrictEqual([]);
  });

  it.each(brokenTopologies())('fails the tests of a topology that $breaks', ({ tests, topology }) => {
    expect(failures(topology)).toStrictEqual(tests);
  });

  it('fails a field where no creature of a size that must fit fits, and checks no size by default', () => {
    const nowhere: TopologyExtension<SquareParams> = { ...squareTopology(), footprint: () => undefined };

    expect(failures(squareTopology(), { fits: [4] })).toStrictEqual([FOOTPRINTS]);
    expect(failures(nowhere, { fits: [2] })).toStrictEqual([FOOTPRINTS]);
    expect(failures(nowhere)).toStrictEqual([]);
  });
});

const REPEATS = 'gives the same answers when asked again';
const CELLS = 'gives cells that are different strings';
const NEIGHBORS = 'gives neighbors on the field, different and not the cell itself, fewer for a body';
const DISTANCES = 'measures distances that are whole, symmetric and 0 only for the same cell';
const NEIGHBOR_DISTANCES = 'keeps the distances of two neighbors to any cell within 1 of each other';
const COSTS = 'costs a step into a neighbor a whole number from 1';
const RADIUS = 'gives a radius of the cells within its size';
const DIRECTED = 'gives lines and cones within their size, without the origin, and only the center without one';
const FOOTPRINTS = 'gives the cells of a creature from its cell, on the field, different and as many as its size';
const DIRECTIONS = 'gives different directions';
const LINES = 'gives lines without both ends, on the field, empty between neighbors and the same both ways';

function brokenTopologies(): ReadonlyArray<{
  readonly breaks: string;
  readonly tests: readonly string[];
  readonly topology: TopologyExtension<SquareParams>;
}> {
  const square = squareTopology();
  const neighborCalls = counter();
  const lineSweeps = counter();
  let sweep = 0;

  return [
    {
      breaks: 'answers neighbors differently when asked again',
      tests: [REPEATS],
      topology: {
        ...square,
        neighbors: (params, cell, body) => {
          const near = square.neighbors(params, cell, body);

          return neighborCalls() % 2 === 0 ? [...near].reverse() : near;
        },
      },
    },
    {
      breaks: 'answers lines differently when asked again',
      tests: [REPEATS],
      topology: {
        ...square,
        line: (params, from, to) => {
          if (from === '0,0' && to === '1,0') sweep = lineSweeps();

          return sweep === 2 ? [] : square.line?.(params, from, to) ?? [];
        },
      },
    },
    { breaks: 'has no cells', tests: [CELLS], topology: { ...square, cells: () => [] } },
    {
      breaks: 'repeats a cell',
      tests: [CELLS, RADIUS],
      topology: { ...square, cells: (params) => [...cellsOf(params), '0,0'] },
    },
    {
      breaks: 'gives a cell that is not a string',
      tests: [CELLS, RADIUS],
      topology: { ...square, cells: (params) => [...cellsOf(params), notAString()] },
    },
    {
      breaks: 'gives the cell as its own neighbor',
      tests: [NEIGHBORS],
      topology: { ...square, neighbors: (params, cell, body) => [...square.neighbors(params, cell, body), cell] },
    },
    {
      breaks: 'gives a neighbor off the field',
      tests: [NEIGHBORS, NEIGHBOR_DISTANCES],
      topology: { ...square, neighbors: (params, cell, body) => [...square.neighbors(params, cell, body), '9,9'] },
    },
    {
      breaks: 'repeats a neighbor',
      tests: [NEIGHBORS],
      topology: {
        ...square,
        neighbors: (params, cell, body) => square.neighbors(params, cell, body).flatMap((next) => [next, next]),
      },
    },
    {
      breaks: 'gives a body more neighbors than without one',
      tests: [NEIGHBORS],
      topology: {
        ...square,
        neighbors: (params, cell, body) => (body === undefined
          ? square.neighbors(params, cell).slice(1)
          : square.neighbors(params, cell)),
      },
    },
    {
      breaks: 'measures distances one way only',
      tests: [DISTANCES, NEIGHBOR_DISTANCES, RADIUS, DIRECTED],
      topology: {
        ...square,
        distance: (params, from, to) => (from < to ? distanceOf(from, to) : 2 * distanceOf(from, to)),
      },
    },
    {
      breaks: 'measures a distance that is not whole',
      tests: [DISTANCES, NEIGHBOR_DISTANCES, RADIUS, DIRECTED],
      topology: { ...square, distance: (params, from, to) => (from === to ? 0 : distanceOf(from, to) + 0.5) },
    },
    {
      breaks: 'measures a negative distance',
      tests: [DISTANCES, RADIUS],
      topology: { ...square, distance: (params, from, to) => -distanceOf(from, to) },
    },
    {
      breaks: 'measures a distance of 0 between different cells',
      tests: [DISTANCES, NEIGHBOR_DISTANCES, RADIUS],
      topology: {
        ...square,
        distance: (params, from, to) => (from === '0,0' || to === '0,0' ? 0 : distanceOf(from, to)),
      },
    },
    {
      breaks: 'lets neighbors differ by 2 in distance',
      tests: [NEIGHBOR_DISTANCES, RADIUS, DIRECTED],
      topology: { ...square, distance: (params, from, to) => 2 * distanceOf(from, to) },
    },
    { breaks: 'costs a step 0', tests: [COSTS], topology: { ...square, moveCost: () => 0 } },
    { breaks: 'costs a step 1.5', tests: [COSTS], topology: { ...square, moveCost: () => 1.5 } },
    {
      breaks: 'leaves a cell out of a radius',
      tests: [RADIUS],
      topology: {
        ...square,
        area: (params, rule, center, origin) => (rule.shape === 'radius'
          ? square.area(params, rule, center, origin).slice(1)
          : square.area(params, rule, center, origin)),
      },
    },
    {
      breaks: 'puts the origin into a line',
      tests: [DIRECTED],
      topology: directed(square, (params, rule, center, origin) => {
        if (origin === undefined) return [center];

        return rule.size === 0 ? [] : [origin];
      }),
    },
    {
      breaks: 'gives a line without an origin with more than the center',
      tests: [DIRECTED],
      topology: directed(square, (params, rule, center, origin) => (origin === undefined
        ? [center, ...square.neighbors(params, center)]
        : square.area(params, rule, center, origin))),
    },
    {
      breaks: 'gives a cone with a cell off the field',
      tests: [DIRECTED],
      topology: directed(square, (params, rule, center, origin) => {
        const area = square.area(params, rule, center, origin);

        return rule.shape === 'cone' && origin === '0,0' && rule.size > 0 ? [...area, '-1,0'] : area;
      }),
    },
    {
      breaks: 'repeats a cell in a cone',
      tests: [DIRECTED],
      topology: directed(square, (params, rule, center, origin) => square.area(params, rule, center, origin)
        .flatMap((cell) => (origin === undefined || rule.shape === 'line' ? [cell] : [cell, cell]))),
    },
    {
      breaks: 'gives a line longer than its size',
      tests: [DIRECTED],
      topology: directed(square, (params, rule, center, origin) => (rule.shape === 'line' && origin !== undefined
        && origin !== center
        ? [center]
        : square.area(params, rule, center, origin))),
    },
    {
      breaks: 'gives a cone with a cell farther than its size from the origin',
      tests: [DIRECTED],
      topology: directed(square, (params, rule, center, origin) => (rule.shape === 'cone' && origin !== undefined
        ? cellsOf(params).filter((cell) => cell !== origin)
        : square.area(params, rule, center, origin))),
    },
    {
      breaks: 'puts a creature into a cell that is not its own first',
      tests: [FOOTPRINTS],
      topology: { ...square, footprint: (params, cell, body) => square.footprint(params, cell, body)?.toReversed() },
    },
    {
      breaks: 'repeats a cell of a creature',
      tests: [FOOTPRINTS],
      topology: { ...square, footprint: (params, cell, body) => Array.from({ length: body.size }, () => cell) },
    },
    {
      breaks: 'gives a creature more cells than its size',
      tests: [FOOTPRINTS],
      topology: {
        ...square,
        footprint: (params, cell, body) => {
          const taken = square.footprint(params, cell, body) ?? [cell];

          return [...taken, ...cellsOf(params).filter((one) => !taken.includes(one)).slice(0, 1)];
        },
      },
    },
    {
      breaks: 'puts a creature on cells off the field',
      tests: [FOOTPRINTS],
      topology: {
        ...square,
        footprint: (params, cell, { size }) => Array.from({ length: size }, (unused, index) => (index === 0
          ? cell
          : `${String(index + 10)},0`)),
      },
    },
    { breaks: 'repeats a direction', tests: [DIRECTIONS], topology: { ...square, directions: () => ['east', 'east'] } },
    {
      breaks: 'puts an end into a line',
      tests: [LINES],
      topology: { ...square, line: (params, from, to) => (distanceOf(from, to) > 1 ? [from < to ? from : to] : []) },
    },
    {
      breaks: 'draws different lines both ways',
      tests: [LINES],
      topology: { ...square, line: (params, from, to) => (from < to ? square.line?.(params, from, to) ?? [] : []) },
    },
    {
      breaks: 'draws a line between neighbors',
      tests: [LINES],
      topology: { ...square, line: (params, from, to) => lineBetween(from, to, true) },
    },
    {
      breaks: 'draws a line off the field',
      tests: [LINES],
      topology: { ...square, line: (params, from, to) => (distanceOf(from, to) > 1 ? ['9,9'] : []) },
    },
    {
      breaks: 'repeats a cell in a line',
      tests: [LINES],
      topology: {
        ...square,
        line: (params, from, to) => (square.line?.(params, from, to) ?? []).flatMap((cell) => [cell, cell]),
      },
    },
  ];
}

function failures(topology: TopologyExtension<SquareParams>, checks = {}): readonly string[] {
  const failed: string[] = [];
  const runner: ContractRunner = {
    describe: (name, body) => {
      body();
    },
    expect,
    it: (name, body) => {
      try {
        body();
      } catch {
        failed.push(name);
      }
    },
  };

  checkTopology(topology, [{ height: 3, width: 3 }], runner, { areas: [0, 1], sizes: [1, 2], ...checks });

  return failed;
}

function squareTopology(): TopologyExtension<SquareParams> {
  return {
    area: (params, rule, center, origin) => {
      if (rule.shape === 'radius') return cellsOf(params).filter((cell) => distanceOf(cell, center) <= rule.size);

      if (origin === undefined) return [center];

      if (origin === center) return [];

      if (rule.shape === 'cone') {
        return cellsOf(params).filter((cell) => cell !== origin && distanceOf(origin, cell) <= rule.size
          && distanceOf(cell, center) < distanceOf(origin, center));
      }

      return ray(params, origin, center).slice(0, rule.size);
    },
    cells: cellsOf,
    directions: () => ['east'],
    distance: (params, from, to) => distanceOf(from, to),
    footprint: (params, cell, { size }) => {
      const [x, y] = pointOf(cell);
      const cells = Array.from({ length: size }, (unused, index) => `${String(x + index)},${String(y)}`);

      return cells.every((one) => cellsOf(params).includes(one)) ? cells : undefined;
    },
    kind: 'topology',
    line: (params, from, to) => lineBetween(from, to),
    moveCost: () => 1,
    name: 'acme:square',
    neighbors: (params, cell) => {
      const [x, y] = pointOf(cell);

      return [[x + 1, y], [x, y + 1], [x - 1, y], [x, y - 1]]
        .map(([nextX = 0, nextY = 0]) => `${String(nextX)},${String(nextY)}`)
        .filter((next) => cellsOf(params).includes(next));
    },
    schema: { type: 'object' },
  };
}

function counter(): () => number {
  let calls = 0;

  return () => {
    calls += 1;

    return calls;
  };
}

function directed(
  topology: TopologyExtension<SquareParams>,
  area: TopologyExtension<SquareParams>['area'],
): TopologyExtension<SquareParams> {
  return {
    ...topology,
    area: (params, rule, center, origin) => (rule.shape === 'radius'
      ? topology.area(params, rule, center, origin)
      : area(params, rule, center, origin)),
  };
}

function lineBetween(from: string, to: string, near = false): readonly string[] {
  const [fromX, fromY] = pointOf(from);
  const [toX, toY] = pointOf(to);
  const steps = distanceOf(from, to);

  if (fromX !== toX && fromY !== toY) return [];

  const between = Array.from({ length: Math.max(steps - 1, 0) }, (unused, index) => {
    const part = (index + 1) / steps;

    return `${String(fromX + (toX - fromX) * part)},${String(fromY + (toY - fromY) * part)}`;
  });

  return near && steps === 1 ? [['2,2', '0,0'].find((cell) => cell !== from && cell !== to) ?? '1,1'] : between;
}

function ray(params: SquareParams, origin: string, center: string): readonly string[] {
  const [fromX, fromY] = pointOf(origin);
  const [toX, toY] = pointOf(center);

  if (fromX !== toX && fromY !== toY) return [center];

  const stepX = Math.sign(toX - fromX);
  const stepY = Math.sign(toY - fromY);

  return Array.from({ length: params.width + params.height }, (unused, index) =>
    `${String(fromX + stepX * (index + 1))},${String(fromY + stepY * (index + 1))}`)
    .filter((cell) => cellsOf(params).includes(cell));
}

function notAString(): string {
  const cell: unknown = Object('9,9');

  return cell as string;
}

function cellsOf({ height, width }: SquareParams): readonly string[] {
  return Array.from({ length: width * height }, (unused, index) =>
    `${String(index % width)},${String(Math.floor(index / width))}`);
}

function pointOf(cell: string): readonly [number, number] {
  const [x = 0, y = 0] = cell.split(',').map(Number);

  return [x, y];
}

function distanceOf(from: string, to: string): number {
  const [fromX, fromY] = pointOf(from);
  const [toX, toY] = pointOf(to);

  return Math.abs(fromX - toX) + Math.abs(fromY - toY);
}
