import type { ReachableCell, Route } from '../extensions/index.ts';
import type { CellId } from '../ids/index.ts';
import { PriorityQueue } from './queue.ts';

/**
 * The field as one moving unit sees it.
 */
export interface MoverField {
  /** Returns the cells the unit can step to from a cell. */
  neighbors(cell: CellId): readonly CellId[];
  /** Returns the cost of a step of the unit into a neighbor. */
  moveCost(from: CellId, to: CellId): number;
  /** Returns the distance between two cells. */
  distance(from: CellId, to: CellId): number;
  /** Tells whether the unit can stop in a cell. */
  canStop(cell: CellId): boolean;
  /** Tells whether the unit can pass a cell on its way. */
  canPass(cell: CellId): boolean;
}

interface Exploration {
  readonly costs: ReadonlyMap<CellId, number>;
  readonly parents: ReadonlyMap<CellId, CellId>;
  readonly settled: ReadonlySet<CellId>;
  readonly visits: readonly ReachableCell[];
}

/**
 * Returns the cells where a unit can stop within a cost of movement, found by Dijkstra's algorithm: nearest first, and
 * of equal costs in the order the search reaches them through the neighbors of the topology. The start is left out.
 */
export function cheapestCells(field: MoverField, start: CellId, budget: number): readonly ReachableCell[] {
  return explore(field, start, budget, undefined).visits;
}

/**
 * Returns the cheapest way of a unit from a cell to another one within a cost, found by the A* algorithm guided by the
 * distance, or nothing if there is none. Of the cells of equal estimated cost it takes first the one nearer to the
 * goal, then the one it reached first. The caller checks that the unit can stop in the goal.
 */
export function cheapestRoute(field: MoverField, start: CellId, goal: CellId, budget: number): Route | undefined {
  const { costs, parents, settled } = explore(field, start, budget, goal);
  const cost = costs.get(goal);

  if (!settled.has(goal) || cost === undefined) return undefined;

  const cells: CellId[] = [];

  for (let cell: CellId | undefined = goal; cell !== undefined && cell !== start; cell = parents.get(cell)) {
    cells.push(cell);
  }

  return { cells: cells.toReversed(), cost };
}

function explore(field: MoverField, start: CellId, budget: number, goal: CellId | undefined): Exploration {
  const queue = new PriorityQueue<ReachableCell>();
  const costs = new Map<CellId, number>([[start, 0]]);
  const parents = new Map<CellId, CellId>();
  const settled = new Set<CellId>();
  const visits: ReachableCell[] = [];

  queue.push({ cell: start, cost: 0 }, 0);

  for (let visit = queue.pop(); visit !== undefined; visit = queue.pop()) {
    const { cell, cost } = visit;

    if (settled.has(cell)) continue;

    settled.add(cell);

    if (cell === goal) break;

    if (goal === undefined && cell !== start && field.canStop(cell)) visits.push(visit);

    for (const next of field.neighbors(cell)) {
      if (settled.has(next)) continue;

      const total = cost + field.moveCost(cell, next);
      const known = costs.get(next);

      if (total > budget || (known !== undefined && known <= total) || (next !== goal && !field.canPass(next))) {
        continue;
      }

      costs.set(next, total);
      parents.set(next, cell);

      if (goal === undefined) {
        queue.push({ cell: next, cost: total }, total);
      } else {
        const left = field.distance(next, goal);

        queue.push({ cell: next, cost: total }, total + left, left);
      }
    }
  }

  return { costs, parents, settled, visits };
}
