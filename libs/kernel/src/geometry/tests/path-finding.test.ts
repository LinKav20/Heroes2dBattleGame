import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { FieldGeometry, TopologyExtension } from '../../extensions/index.ts';
import type { JsonObject } from '../../json/index.ts';
import { createKernel } from '../../kernel/index.ts';
import type { BattleState } from '../../model/index.ts';
import { BARE_STATE } from '../../tests/battle.ts';
import { CONTENT, GRID, gridCells, gridDistance } from '../../tests/fixtures.ts';
import { createFieldGeometry, FieldCache } from '../index.ts';

interface WeightedParams extends JsonObject {
  readonly width: number;
  readonly height: number;
  readonly weights: readonly number[];
}

interface Board {
  readonly params: WeightedParams;
  readonly rocks: readonly string[];
  readonly start: string;
  readonly pikemen: string | undefined;
}

describe('the search of paths', () => {
  it('finds the cheapest cost to every cell, as a plain search over the whole field does', () => {
    fc.assert(fc.property(BOARDS, (board) => {
      const field = fieldOf(board);
      const costs = plainCosts(board);
      const reached = new Map(field.reachable('archers-1', 1000).map(({ cell, cost }) => [cell, cost]));

      for (const cell of gridCells(board.params)) {
        if (cell === board.start) continue;

        const path = field.path('archers-1', cell);

        expect(reached.get(cell), cell).toBe(costs.get(cell));
        expect(path?.cost, cell).toBe(costs.get(cell));

        if (path !== undefined) checkPath(board, path.cells, path.cost);
      }
    }), { numRuns: 150, seed: 20_261_019 });
  });

  it('gives the same paths whatever was asked before', () => {
    fc.assert(fc.property(BOARDS, fc.array(fc.nat()), (board, keys) => {
      const cells = gridCells(board.params);
      const order = cells.map((cell, index) => [keys[index] ?? index, cell] as const)
        .toSorted(([left], [right]) => left - right)
        .map(([, cell]) => cell);
      const warm = fieldOf(board, new FieldCache());

      for (const cell of order) {
        expect(warm.path('archers-1', cell), cell).toStrictEqual(fieldOf(board).path('archers-1', cell));
        expect(warm.reachable('archers-1', 3)).toStrictEqual(fieldOf(board).reachable('archers-1', 3));
      }
    }), { numRuns: 60, seed: 20_261_020 });
  });
});

const WEIGHTED: TopologyExtension<WeightedParams> = {
  ...(GRID as unknown as TopologyExtension<WeightedParams>),
  moveCost: (params, from, to) => weightOf(params, to),
  name: 'acme:weighted',
};

const TOPOLOGIES = createKernel({ extensions: [WEIGHTED] }).registries.topologies;

const SIDE = fc.integer({ max: 6, min: 2 });

const BOARDS: fc.Arbitrary<Board> = fc.record({ height: SIDE, width: SIDE })
  .chain(({ height, width }) => {
    const size = width * height;

    return fc.record({
      pikemen: fc.option(fc.nat({ max: size - 1 }), { nil: undefined }),
      rocks: fc.uniqueArray(fc.nat({ max: size - 1 }), { maxLength: Math.floor(size / 3) }),
      start: fc.nat({ max: size - 1 }),
      weights: fc.array(fc.integer({ max: 4, min: 1 }), { maxLength: size, minLength: size }),
    }).map(({ pikemen, rocks, start, weights }) => {
      const params = { height, weights, width };
      const cells = gridCells(params);

      return {
        params,
        pikemen: pikemen === undefined || pikemen === start ? undefined : cells[pikemen],
        rocks: cells.filter((cell, index) => rocks.includes(index) && index !== start && index !== pikemen),
        start: cells[start] ?? '0,0',
      };
    });
  });

function fieldOf(board: Board, cache?: FieldCache): FieldGeometry {
  return createFieldGeometry(stateOf(board), CONTENT, TOPOLOGIES, cache);
}

function stateOf({ params, pikemen, rocks, start }: Board): BattleState {
  return {
    ...BARE_STATE,
    field: {
      ...BARE_STATE.field,
      hazards: [],
      obstacles: rocks.map((cell, index) => ({ cells: [cell], id: `rock-${String(index)}`, obstacle: 'demo:rock' })),
      params,
      topology: WEIGHTED.name,
    },
    units: BARE_STATE.units.map((unit) => {
      if (unit.id === 'archers-1') return { ...unit, cell: start };

      return pikemen === undefined ? { ...unit, cell: start, count: 0 } : { ...unit, cell: pikemen };
    }),
  };
}

function plainCosts({ params, pikemen, rocks, start }: Board): ReadonlyMap<string, number> {
  const blocked = new Set([...rocks, ...(pikemen === undefined ? [] : [pikemen])]);
  const costs = new Map([[start, 0]]);
  let changed = true;

  while (changed) {
    changed = false;

    for (const [cell, cost] of [...costs]) {
      for (const next of WEIGHTED.neighbors(params, cell)) {
        const through = cost + weightOf(params, next);

        if (blocked.has(next) || through >= (costs.get(next) ?? Infinity)) continue;

        costs.set(next, through);
        changed = true;
      }
    }
  }

  costs.delete(start);

  return costs;
}

function checkPath({ params, start }: Board, cells: readonly string[], cost: number): void {
  const steps = [start, ...cells];

  steps.slice(1).forEach((cell, index) => {
    expect(gridDistance(steps[index] ?? '', cell)).toBe(1);
  });

  expect(cells.reduce((total, cell) => total + weightOf(params, cell), 0)).toBe(cost);
}

function weightOf(params: WeightedParams, cell: string): number {
  const index = gridCells(params).indexOf(cell);

  return params.weights[index] ?? 1;
}
