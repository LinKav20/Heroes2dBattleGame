import type { AreaRule, ContentRegistry } from '../content/index.ts';
import type {
  FieldGeometry,
  PathOptions,
  ReachableCell,
  Route,
  TopologyBody,
  TopologyExtension,
} from '../extensions/index.ts';
import type { CellId, UnitId } from '../ids/index.ts';
import { battleUnit, standsOnField, type BattleState, type Unit } from '../model/index.ts';
import type { Registry } from '../names/index.ts';
import { FieldCache, type FieldCells } from './field-cache.ts';
import { bodyOf, type Ground, UnitMover } from './mover.ts';
import { cheapestCells, cheapestRoute } from './path-finding.ts';

/**
 * Returns the field of a state as its topology describes it. The topology is looked up when the field is first used,
 * and what the kernel knows about the field comes from the cache if one is given.
 *
 * @throws {TypeError} When the field is used, as {@link FieldGeometry} describes.
 * @throws {ContentError} When the field is used, as {@link FieldGeometry} describes.
 */
export function createFieldGeometry(
  state: BattleState,
  content: ContentRegistry,
  topologies: Registry<TopologyExtension>,
  cache: FieldCache = new FieldCache(),
): FieldGeometry {
  return new StateGeometry(state, content, topologies, cache);
}

class StateGeometry implements FieldGeometry, Ground {
  private readonly state: BattleState;

  private readonly content: ContentRegistry;

  private readonly topologies: Registry<TopologyExtension>;

  private readonly cache: FieldCache;

  private found?: TopologyExtension;

  private known?: FieldCells;

  private readonly occupied = new Map<UnitId, readonly CellId[]>();

  constructor(
    state: BattleState,
    content: ContentRegistry,
    topologies: Registry<TopologyExtension>,
    cache: FieldCache,
  ) {
    this.state = state;
    this.content = content;
    this.topologies = topologies;
    this.cache = cache;
  }

  get cells(): readonly CellId[] {
    return this.fieldCells.list;
  }

  get directions(): readonly string[] {
    const { topology } = this;

    return topology.directions?.(this.state.field.params) ?? [];
  }

  hasCell(cell: CellId): boolean {
    return this.fieldCells.set.has(cell);
  }

  neighbors(cell: CellId): readonly CellId[] {
    return this.cache.neighborsOf(this.topology, this.state.field.params, this.onField(cell));
  }

  distance(from: CellId, to: CellId): number {
    if (this.onField(from) === this.onField(to)) return 0;

    const distance = this.topology.distance(this.state.field.params, from, to);

    if (!Number.isSafeInteger(distance) || distance < 1) {
      throw new TypeError(`The topology ${JSON.stringify(this.topology.name)} gives a distance that is not whole.`);
    }

    return distance;
  }

  distanceBetween(from: readonly CellId[], to: readonly CellId[]): number | undefined {
    let least: number | undefined;

    for (const start of from) {
      for (const end of to) {
        const distance = this.distance(start, end);

        if (least === undefined || distance < least) least = distance;
      }
    }

    return least;
  }

  nearestCell(from: readonly CellId[], to: CellId): CellId | undefined {
    let best: { readonly cell: CellId; readonly distance: number } | undefined;

    for (const cell of from) {
      const distance = this.distance(cell, to);

      if (best === undefined || distance < best.distance) best = { cell, distance };
    }

    return best?.cell;
  }

  sees(from: readonly CellId[], to: readonly CellId[]): boolean {
    const { topology } = this;
    const { obstacles, params } = this.state.field;
    const hidden = this.cache.closedBy(obstacles, this.content, 'blocksSight');

    for (const cell of [...from, ...to]) {
      this.onField(cell);
    }

    return from.some((start) => to.some((end) => {
      if (start === end || topology.line === undefined) return true;

      return this.allOnField(topology.line(params, start, end), 'a line').every((cell) => !hidden.has(cell));
    }));
  }

  area(rule: AreaRule, center: CellId, origin?: CellId): readonly CellId[] {
    const start = origin === undefined ? undefined : this.onField(origin);
    const cells = this.topology.area(this.state.field.params, rule, this.onField(center), start);

    return this.allOnField(cells, 'an area');
  }

  cellsOf(unit: UnitId): readonly CellId[] {
    const known = this.occupied.get(unit);

    if (known !== undefined) return known;

    const found = battleUnit(this.state, unit);
    const cells = found.cell === undefined || !standsOnField(found)
      ? []
      : this.footprint(found.cell, bodyOf(this.content, found));

    if (cells === undefined) throw new TypeError(`The unit ${JSON.stringify(unit)} does not fit where it stands.`);

    this.occupied.set(unit, cells);

    return cells;
  }

  cellsAt(unit: UnitId, cell: CellId, facing?: string): readonly CellId[] | undefined {
    return this.footprint(cell, bodyOf(this.content, battleUnit(this.state, unit), facing));
  }

  canStand(unit: UnitId, cell: CellId, facing?: string): boolean {
    const found = battleUnit(this.state, unit);
    const blocked = this.blockedFor(found);

    return this.cellsAt(unit, cell, facing)?.every((taken) => !blocked.has(taken)) === true;
  }

  cellsAlong(unit: UnitId, way: readonly CellId[], facing?: string): readonly CellId[] {
    const body = bodyOf(this.content, battleUnit(this.state, unit));
    const end = way.at(-1);

    if (end === undefined) return [];

    const passed = body.movement === 'fly' ? [] : way.slice(0, -1);
    const cells = [
      ...passed.flatMap((cell) => this.footprint(cell, body) ?? []),
      ...this.footprint(end, facing === undefined ? body : { ...body, facing }) ?? [],
    ];

    return [...new Set(cells)];
  }

  unitsTouching(cells: readonly CellId[]): readonly UnitId[] {
    const set = new Set(cells);

    return this.state.units
      .filter((unit) => standsOnField(unit) && this.cellsOf(unit.id).some((cell) => set.has(cell)))
      .map(({ id }) => id);
  }

  reachable(unit: UnitId, budget: number): readonly ReachableCell[] {
    wholeCost(budget);

    const mover = this.mover(unit);

    if (mover === undefined || budget < 0) return [];

    if (mover.body.movement !== 'teleport') return cheapestCells(mover, mover.start, budget);

    return this.cells
      .map((cell) => ({ cell, cost: this.distance(mover.start, cell) }))
      .filter(({ cell, cost }) => cell !== mover.start && cost <= budget && mover.canStop(cell))
      .toSorted((left, right) => left.cost - right.cost);
  }

  path(unit: UnitId, to: CellId, options: PathOptions = {}): Route | undefined {
    const { budget = Number.MAX_SAFE_INTEGER, facing } = options;

    wholeCost(budget);

    const mover = this.mover(unit);

    if (mover === undefined || budget < 0 || !this.hasCell(to)) return undefined;

    if (!mover.fits(to, facing === undefined ? mover.body : { ...mover.body, facing })) return undefined;

    if (to === mover.start) return { cells: [], cost: 0 };

    if (mover.body.movement !== 'teleport') return cheapestRoute(mover, mover.start, to, budget);

    const cost = this.distance(mover.start, to);

    return cost <= budget ? { cells: [to], cost } : undefined;
  }

  stepsFrom(cell: CellId, body: TopologyBody): readonly CellId[] {
    return this.cache.neighborsOf(this.topology, this.state.field.params, cell, body);
  }

  stepCost(from: CellId, to: CellId, body: TopologyBody): number {
    const cost = this.topology.moveCost(this.state.field.params, from, to, body);

    if (!Number.isSafeInteger(cost) || cost < 1) {
      throw new TypeError(`The topology ${JSON.stringify(this.topology.name)} gives a cost of a step below 1.`);
    }

    return cost;
  }

  footprint(cell: CellId, body: TopologyBody): readonly CellId[] | undefined {
    if (!this.hasCell(cell)) return undefined;

    if (body.size === 1) return [cell];

    const cells = this.topology.footprint(this.state.field.params, cell, body);

    if (cells === undefined) return undefined;

    if (cells[0] !== cell || new Set(cells).size !== cells.length) {
      throw new TypeError(`The topology ${JSON.stringify(this.topology.name)} gives cells without the cell first.`);
    }

    return this.allOnField(cells, 'the cells of a creature');
  }

  private get topology(): TopologyExtension {
    if (this.found !== undefined) return this.found;

    const { topology } = this.state.field;
    const found = this.topologies.get(topology);

    if (found === undefined) throw new TypeError(`No package declares the topology ${JSON.stringify(topology)}.`);

    this.found = found;

    return found;
  }

  private get fieldCells(): FieldCells {
    this.known ??= this.cache.cellsOf(this.topology, this.state.field.params);

    return this.known;
  }

  private mover(unit: UnitId): UnitMover | undefined {
    const found = battleUnit(this.state, unit);

    if (found.cell === undefined || !standsOnField(found)) return undefined;

    return new UnitMover(this, found.cell, bodyOf(this.content, found), this.blockedFor(found));
  }

  private blockedFor(unit: Unit): ReadonlySet<CellId> {
    const closed = this.cache.closedBy(this.state.field.obstacles, this.content, 'blocksMovement');
    const units = this.state.units
      .filter((other) => other.id !== unit.id && standsOnField(other))
      .flatMap(({ id }) => this.cellsOf(id));

    return new Set([...closed, ...units]);
  }

  private onField(cell: CellId): CellId {
    if (!this.hasCell(cell)) throw new TypeError(`The cell ${JSON.stringify(cell)} is not on the field.`);

    return cell;
  }

  private allOnField(cells: readonly CellId[], what: string): readonly CellId[] {
    if (!cells.every((cell) => this.hasCell(cell))) {
      throw new TypeError(`The topology ${JSON.stringify(this.topology.name)} gives ${what} with cells off the field.`);
    }

    return cells;
  }
}

function wholeCost(budget: number): void {
  if (!Number.isSafeInteger(budget)) {
    throw new TypeError(`A cost of movement needs a whole number, not ${String(budget)}.`);
  }
}
