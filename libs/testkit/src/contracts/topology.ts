import type { JsonObject, Movement, TopologyBody, TopologyExtension } from '@heroes2dgame/kernel';

/**
 * The functions of a test runner that the contract suites use, as Vitest and Jest give them, or Mocha with an
 * assertion library in the style of Jest, such as the package `expect`. A failed expectation throws. Jest shows no
 * message of an expectation, so the suites also put the cell into the checked value where it helps.
 */
export interface ContractRunner {
  /** Groups tests under a name. */
  readonly describe: (name: string, body: () => void) => void;
  /** Declares a test. */
  readonly it: (name: string, body: () => void) => void;
  /** Starts an expectation about a value, with a message that a failure shows. */
  readonly expect: (value: unknown, message?: string) => ContractExpectation;
}

/**
 * The expectations the contract suites use.
 */
export interface ContractExpectation {
  /** Expects the value to be the same as `expected` by `Object.is`. */
  readonly toBe: (expected: unknown) => void;
  /** Expects the value to equal `expected` deeply and strictly. */
  readonly toStrictEqual: (expected: unknown) => void;
}

/**
 * The sizes of creatures and of areas the suite of a topology tries, and the sizes of creatures that must fit
 * somewhere on every field.
 */
export interface TopologyChecks {
  /** The sizes of creatures, 1 to 3 if not given. */
  readonly sizes?: readonly number[];
  /** The sizes of areas, 0 to 2 if not given. */
  readonly areas?: readonly number[];
  /**
   * The sizes of creatures that fit in some cell of every field, none if not given. The kernel does not ask about a
   * creature of size 1, so a size of 1 here asks the topology about it anyway.
   */
  readonly fits?: readonly number[];
}

interface Suite<Params extends JsonObject> {
  readonly topology: TopologyExtension<Params>;
  readonly params: Params;
  readonly runner: ContractRunner;
  readonly areas: readonly number[];
  readonly bodies: readonly TopologyBody[];
  readonly fits: readonly number[];
}

/**
 * Declares the tests of the contract of a topology, as `TopologyExtension` describes it, on every field of `fields`:
 * - every function gives the same result when it is asked again with the same input;
 * - the cells are different strings, at least one;
 * - the neighbors are on the field, different and not the cell itself, and the neighbors for a body are some of them;
 * - distances are whole numbers from 0, 0 only for the same cell and the same both ways;
 * - the distances of two neighbors to any cell differ by at most 1;
 * - a step into a neighbor costs a whole number from 1;
 * - a radius holds the cells within its size and no others;
 * - a line and a cone from any origin are on the field, different and leave the origin out, a line has at most `size`
 *   cells and a cone only cells at most `size` from the origin, and without an origin both hold only the center;
 * - the cells of a creature start with its cell, are on the field, different and as many as its size, and creatures
 *   of the sizes `fits` fit somewhere;
 * - the directions are different;
 * - a line between two cells leaves both out, is on the field and different, is empty between neighbors and holds
 *   the same cells in the reverse order the other way.
 *
 * The suite walks every cell and every pair of cells, so the fields should be small.
 */
export function checkTopology<Params extends JsonObject>(
  topology: TopologyExtension<Params>,
  fields: readonly Params[],
  runner: ContractRunner,
  checks: TopologyChecks = {},
): void {
  const { describe, it } = runner;
  const fits = checks.fits ?? [];
  const sizes = [...new Set([...(checks.sizes ?? [1, 2, 3]), ...fits])];
  const movements: readonly Movement[] = ['walk', 'fly', 'teleport'];
  const bodies = sizes.flatMap((size) => movements.map((movement) => ({ movement, size })));
  const areas = checks.areas ?? [0, 1, 2];

  describe(`the topology ${topology.name}`, () => {
    for (const [index, params] of fields.entries()) {
      const suite: Suite<Params> = { areas, bodies, fits, params, runner, topology };

      describe(`on the field ${String(index + 1)}`, () => {
        it('gives the same answers when asked again', () => {
          runner.expect(answers(suite), 'the answers asked again').toStrictEqual(answers(suite));
        });

        it('gives cells that are different strings', () => {
          checkCells(suite);
        });

        it('gives neighbors on the field, different and not the cell itself, fewer for a body', () => {
          checkNeighbors(suite);
        });

        it('measures distances that are whole, symmetric and 0 only for the same cell', () => {
          checkDistances(suite);
        });

        it('keeps the distances of two neighbors to any cell within 1 of each other', () => {
          checkNeighborDistances(suite);
        });

        it('costs a step into a neighbor a whole number from 1', () => {
          checkCosts(suite);
        });

        it('gives a radius of the cells within its size', () => {
          checkRadius(suite);
        });

        it('gives lines and cones within their size, without the origin, and only the center without one', () => {
          checkDirectedAreas(suite);
        });

        it('gives the cells of a creature from its cell, on the field, different and as many as its size', () => {
          checkFootprints(suite);
        });

        it('gives different directions', () => {
          const directions = topology.directions?.(params) ?? [];

          runner.expect(new Set(directions).size, 'repeated directions').toBe(directions.length);
        });

        it('gives lines without both ends, on the field, empty between neighbors and the same both ways', () => {
          checkLines(suite);
        });
      });
    }
  });
}

function answers<Params extends JsonObject>({ areas, bodies, params, topology }: Suite<Params>): unknown {
  const cells = topology.cells(params);
  const facings = [undefined, ...(topology.directions?.(params) ?? [])];
  const origins = [undefined, ...cells];

  return {
    areas: cells.map((center) => areas.flatMap((size) => (['radius', 'line', 'cone'] as const)
      .map((shape) => origins.map((origin) => topology.area(params, { shape, size }, center, origin))))),
    cells,
    costs: cells.map((cell) => bodies.map((body) => topology.neighbors(params, cell, body)
      .map((next) => topology.moveCost(params, cell, next, body)))),
    directions: topology.directions?.(params),
    distances: cells.map((from) => cells.map((to) => topology.distance(params, from, to))),
    footprints: cells.map((cell) => bodies.map((body) => facings
      .map((facing) => topology.footprint(params, cell, facing === undefined ? body : { ...body, facing })))),
    lines: cells.map((from) => cells.map((to) => (from === to ? [] : topology.line?.(params, from, to)))),
    neighbors: cells.map((cell) => [topology.neighbors(params, cell), ...bodies
      .map((body) => topology.neighbors(params, cell, body))]),
  };
}

function checkCells<Params extends JsonObject>({ params, runner, topology }: Suite<Params>): void {
  const cells = topology.cells(params);

  runner.expect(cells.length > 0, 'no cells').toBe(true);
  runner.expect(new Set(cells).size, 'repeated cells').toBe(cells.length);
  runner.expect(cells.every((cell) => typeof cell === 'string'), 'a cell that is not a string').toBe(true);
}

function checkNeighbors<Params extends JsonObject>({ bodies, params, runner, topology }: Suite<Params>): void {
  const cells = new Set(topology.cells(params));

  for (const cell of cells) {
    const near = topology.neighbors(params, cell);
    const wrong = near.filter((next) => !cells.has(next) || next === cell);

    runner.expect({ cell, wrong }, `the neighbors of ${cell}`).toStrictEqual({ cell, wrong: [] });
    runner.expect(new Set(near).size, `repeated neighbors of ${cell}`).toBe(near.length);

    for (const body of bodies) {
      const extra = topology.neighbors(params, cell, body).filter((next) => !near.includes(next));

      runner.expect({ cell, extra }, `the neighbors of ${cell} for a body`).toStrictEqual({ cell, extra: [] });
    }
  }
}

function checkDistances<Params extends JsonObject>({ params, runner, topology }: Suite<Params>): void {
  const cells = topology.cells(params);

  for (const from of cells) {
    for (const to of cells) {
      const distance = topology.distance(params, from, to);

      runner.expect(Number.isSafeInteger(distance) && distance >= 0, `the distance ${from} to ${to}`).toBe(true);
      runner.expect(distance === 0, `the distance ${from} to ${to}`).toBe(from === to);
      runner.expect(topology.distance(params, to, from), `the distance ${to} to ${from}`).toBe(distance);
    }
  }
}

function checkNeighborDistances<Params extends JsonObject>({ params, runner, topology }: Suite<Params>): void {
  const cells = topology.cells(params);

  for (const cell of cells) {
    for (const next of topology.neighbors(params, cell)) {
      const apart = cells.filter((to) =>
        Math.abs(topology.distance(params, cell, to) - topology.distance(params, next, to)) > 1);

      runner.expect({ apart, cell, next }, `the distances from ${cell} and ${next}`)
        .toStrictEqual({ apart: [], cell, next });
    }
  }
}

function checkCosts<Params extends JsonObject>({ bodies, params, runner, topology }: Suite<Params>): void {
  for (const cell of topology.cells(params)) {
    for (const body of bodies) {
      for (const next of topology.neighbors(params, cell, body)) {
        const cost = topology.moveCost(params, cell, next, body);

        runner.expect(Number.isSafeInteger(cost) && cost >= 1, `the cost ${cell} to ${next}`).toBe(true);
      }
    }
  }
}

function checkRadius<Params extends JsonObject>({ areas, params, runner, topology }: Suite<Params>): void {
  const cells = topology.cells(params);

  for (const center of cells) {
    for (const size of areas) {
      const radius = [...topology.area(params, { shape: 'radius', size }, center)].sort();
      const within = cells.filter((cell) => topology.distance(params, center, cell) <= size).sort();

      runner.expect({ center, radius, size }, `the radius ${String(size)} at ${center}`)
        .toStrictEqual({ center, radius: within, size });
    }
  }
}

function checkDirectedAreas<Params extends JsonObject>({ areas, params, runner, topology }: Suite<Params>): void {
  const cells = topology.cells(params);
  const known = new Set(cells);

  for (const center of cells) {
    for (const size of areas) {
      for (const shape of ['line', 'cone'] as const) {
        const alone = topology.area(params, { shape, size }, center);

        runner.expect({ alone, center }, `a ${shape} at ${center}`).toStrictEqual({ alone: [center], center });

        for (const origin of cells) {
          const area = topology.area(params, { shape, size }, center, origin);
          const wrong = area.filter((cell) => !known.has(cell) || cell === origin
            || (shape === 'cone' && topology.distance(params, origin, cell) > size));

          runner.expect({ origin, wrong }, `a ${shape} from ${origin} to ${center}`)
            .toStrictEqual({ origin, wrong: [] });

          runner.expect(new Set(area).size, `a ${shape} from ${origin} to ${center}`).toBe(area.length);
          runner.expect(shape === 'cone' || area.length <= size, `a line from ${origin} to ${center}`).toBe(true);
        }
      }
    }
  }
}

function checkFootprints<Params extends JsonObject>({ bodies, fits, params, runner, topology }: Suite<Params>): void {
  const cells = topology.cells(params);
  const known = new Set(cells);
  const facings = [undefined, ...(topology.directions?.(params) ?? [])];
  const fitting = new Set<number>();

  for (const cell of cells) {
    for (const body of bodies) {
      for (const facing of facings) {
        const taken = topology.footprint(params, cell, facing === undefined ? body : { ...body, facing });

        if (taken === undefined) continue;

        fitting.add(body.size);

        const valid = taken[0] === cell && taken.length === body.size && new Set(taken).size === taken.length
          && taken.every((one) => known.has(one));

        runner.expect({ cell, taken, valid }, `the cells of a creature in ${cell}`)
          .toStrictEqual({ cell, taken, valid: true });
      }
    }
  }

  for (const size of fits) {
    runner.expect(fitting.has(size), `no creature of size ${String(size)} fits`).toBe(true);
  }
}

function checkLines<Params extends JsonObject>({ params, runner, topology }: Suite<Params>): void {
  if (topology.line === undefined) return;

  const cells = topology.cells(params);
  const known = new Set(cells);

  for (const from of cells) {
    for (const to of cells) {
      if (from === to) continue;

      const between = topology.line(params, from, to);
      const back = topology.line(params, to, from);
      const near = topology.neighbors(params, from).includes(to);
      const wrong = between.filter((cell) => !known.has(cell) || cell === from || cell === to);

      runner.expect({ from, to, wrong }, `the line ${from} to ${to}`).toStrictEqual({ from, to, wrong: [] });
      runner.expect(new Set(between).size, `the line ${from} to ${to}`).toBe(between.length);

      runner.expect({ back, from, to }, `the line ${to} to ${from}`)
        .toStrictEqual({ back: [...between].reverse(), from, to });

      if (near) {
        runner.expect({ between, from, to }, `the line ${from} to ${to}`).toStrictEqual({ between: [], from, to });
      }
    }
  }
}
