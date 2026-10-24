import {
  cubeAdd,
  cubeDistance,
  cubeLine,
  cubeNeighbor,
  cubeNeighbors,
  cubeRange,
  cubeScale,
  cubeSubtract,
  cubeToOffset,
  DIRECTIONS,
  isInside,
  offset,
  offsetKey,
  offsetToCube,
  oppositeDirection,
  parseOffsetKey,
  type Cube,
} from '@heroes2dgame/hex';
import type { AreaRule, CellId, JsonObject, TopologyBody, TopologyExtension } from '@heroes2dgame/kernel';
import { RULES_STDLIB_NAMES } from './names.ts';

/**
 * The parameters of a field of hexes: its width and height in hexes, and the costs of stepping into hexes that cost
 * more than 1.
 */
export interface HexParams extends JsonObject {
  /** The number of columns, from 1 to 1000. */
  readonly width: number;
  /** The number of rows, from 1 to 1000. */
  readonly height: number;
  /** The cost of a step into a hex, a whole number from 1 to 1000, by the hex; 1 for the others. */
  readonly costs?: Readonly<Record<CellId, number>>;
}

/**
 * The topology of a rectangular field of pointy-topped hexes with odd rows shifted right by half a hex, as the library
 * `hex` describes it. A cell is `column,row` from `0,0`, and the cells go row by row. Neighbors and directions follow
 * the order of the six directions of `hex`, from east counterclockwise, and the distance is the number of steps
 * between hexes. A line between two hexes is the line of `hex` without both ends and without the hexes off the
 * field, which hold no obstacles. The directions are `east`, `northEast`, `northWest`, `west`, `southWest` and
 * `southEast`. A creature of size 1 takes its hex; a bigger one takes its hex and the hexes behind it, away from the
 * direction it faces, east if it faces none, and a creature that faces a direction the topology does not have fits
 * nowhere. A radius takes the hexes within its size of the center. A line takes
 * `size` hexes, starting with the one next to the origin, along the way through the center and beyond, so a line
 * shorter than the way to the center does not reach it. A cone takes the hexes at most `size` steps from the origin
 * within 30 degrees on both sides of the way to the center. A line and a cone leave the origin out, so with the origin
 * in the center they are empty, and without an origin they hold only the center. A line longer than the width and
 * the height of the field together counts as that long. A step into a hex costs what `costs` gives, and 1 otherwise.
 */
export const HEX_TOPOLOGY: TopologyExtension<HexParams> = Object.freeze({
  area: areaOf,
  cells: cellsOf,
  directions: () => DIRECTIONS,
  distance: (params: HexParams, from: CellId, to: CellId) => cubeDistance(cubeOf(from), cubeOf(to)),
  footprint: (params: HexParams, cell: CellId, body: TopologyBody) => footprintOf(params, cell, body.size, body.facing),
  kind: 'topology',
  line: (params: HexParams, from: CellId, to: CellId) => cubeLine(cubeOf(from), cubeOf(to)).slice(1, -1)
    .filter((hex) => inside(params, hex))
    .map(keyOf),
  moveCost: (params: HexParams, from: CellId, to: CellId) => params.costs?.[to] ?? 1,
  name: RULES_STDLIB_NAMES.hex,
  neighbors: (params: HexParams, cell: CellId) => cubeNeighbors(cubeOf(cell)).filter((hex) => inside(params, hex))
    .map(keyOf),
  schema: {
    additionalProperties: false,
    properties: {
      costs: {
        additionalProperties: { maximum: 1000, minimum: 1, type: 'integer' },
        propertyNames: { pattern: '^(0|[1-9][0-9]*),(0|[1-9][0-9]*)$' },
        type: 'object',
      },
      height: { maximum: 1000, minimum: 1, type: 'integer' },
      width: { maximum: 1000, minimum: 1, type: 'integer' },
    },
    required: ['width', 'height'],
    type: 'object',
  },
});

function cellsOf(params: HexParams): readonly CellId[] {
  return fieldHexes(params).map(keyOf);
}

function fieldHexes({ height, width }: HexParams): readonly Cube[] {
  if (!isSize(width) || !isSize(height)) {
    throw new TypeError(
      `A field of hexes needs a width and a height from 1 to 1000, not ${String(width)} by ${String(height)}.`,
    );
  }

  return Array.from({ length: width * height }, (unused, index) =>
    offsetToCube(offset(index % width, Math.floor(index / width))));
}

function areaOf(params: HexParams, rule: AreaRule, center: CellId, origin?: CellId): readonly CellId[] {
  const middle = cubeOf(center);
  const size = Math.min(rule.size, params.width + params.height);

  if (rule.shape === 'radius') return within(params, middle, size, () => true);

  if (origin === undefined) return [center];

  if (origin === center) return [];

  const start = cubeOf(origin);

  if (rule.shape === 'line') {
    const far = cubeAdd(start, cubeScale(cubeSubtract(middle, start), Math.ceil(size / cubeDistance(start, middle))));

    return cubeLine(start, far).slice(1, size + 1).filter((hex) => inside(params, hex)).map(keyOf);
  }

  return within(params, start, size, (hex) => inCone(start, middle, hex));
}

function within(params: HexParams, from: Cube, size: number, keeps: (hex: Cube) => boolean): readonly CellId[] {
  const hexes = 3 * size * (size + 1) + 1 > params.width * params.height
    ? fieldHexes(params).filter((hex) => cubeDistance(from, hex) <= size)
        .sort((left, right) => left.q - right.q || left.r - right.r)
    : cubeRange(from, size).filter((hex) => inside(params, hex));

  return hexes.filter((hex) => keeps(hex)).map(keyOf);
}

function footprintOf(params: HexParams, cell: CellId, size: number, facing = 'east'): readonly CellId[] | undefined {
  const direction = DIRECTIONS.find((known) => known === facing);

  if (direction === undefined) return undefined;

  const back = oppositeDirection(direction);
  let hex = cubeOf(cell);
  const cells: CellId[] = [];

  while (cells.length < size) {
    if (!inside(params, hex)) return undefined;

    cells.push(keyOf(hex));
    hex = cubeNeighbor(hex, back);
  }

  return cells;
}

function inCone(origin: Cube, center: Cube, hex: Cube): boolean {
  const way = planar(cubeSubtract(center, origin));
  const to = planar(cubeSubtract(hex, origin));
  const dot = way.x * to.x + 3n * way.y * to.y;

  if (dot <= 0n) return false;

  return 4n * dot * dot >= 3n * (way.x * way.x + 3n * way.y * way.y) * (to.x * to.x + 3n * to.y * to.y);
}

function planar(hex: Cube): { readonly x: bigint; readonly y: bigint } {
  return { x: BigInt(2 * hex.q + hex.r), y: BigInt(hex.r) };
}

function cubeOf(cell: CellId): Cube {
  const hex = parseOffsetKey(cell);

  if (hex === null) throw new TypeError(`The cell ${JSON.stringify(cell)} is not a hex like "3,5".`);

  return offsetToCube(hex);
}

function keyOf(hex: Cube): CellId {
  return offsetKey(cubeToOffset(hex));
}

function inside(params: HexParams, hex: Cube): boolean {
  return isInside(cubeToOffset(hex), params);
}

function isSize(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= 1000;
}
