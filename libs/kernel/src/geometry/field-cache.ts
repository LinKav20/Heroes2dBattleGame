import { definitionOf, type ContentRegistry } from '../content/index.ts';
import type { TopologyBody, TopologyExtension } from '../extensions/index.ts';
import type { CellId } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { FieldObstacle } from '../model/index.ts';

/**
 * The cells of a field: in the order of its topology, and as a set to check that a cell is on the field.
 */
export interface FieldCells {
  /** The cells in the order of the topology, frozen. */
  readonly list: readonly CellId[];
  /** The same cells as a set. */
  readonly set: ReadonlySet<CellId>;
}

type ClosedFor = 'blocksMovement' | 'blocksSight';

type ClosedCells = WeakMap<readonly FieldObstacle[], WeakMap<ContentRegistry, ReadonlySet<CellId>>>;

interface KnownField {
  readonly cells: FieldCells;
  readonly neighbors: Map<string, readonly CellId[]>;
}

/**
 * What the kernel has asked topologies about fields: the cells and the neighbors of cells, kept for the object of the
 * parameters of the field and for the topology, and the cells that obstacles close for movement and for sight, kept
 * for the list of obstacles and the content. These objects therefore never change in place, so states of one battle
 * share what is known. After a state is read from JSON, its objects are new, and the kernel asks again.
 */
export class FieldCache {
  private readonly fields = new WeakMap<JsonObject, Map<string, KnownField>>();

  private readonly closed: Readonly<Record<ClosedFor, ClosedCells>> = {
    blocksMovement: new WeakMap(),
    blocksSight: new WeakMap(),
  };

  /**
   * Returns the cells of a field, asking the topology only the first time.
   *
   * @throws {TypeError} If the topology gives a cell that is not a string or gives a cell twice.
   */
  cellsOf(topology: TopologyExtension, params: JsonObject): FieldCells {
    return this.known(topology, params).cells;
  }

  /**
   * Returns the neighbors of a cell for a body, or for no body, asking the topology only the first time.
   *
   * @throws {TypeError} If the topology gives a neighbor that is not on the field.
   */
  neighborsOf(topology: TopologyExtension, params: JsonObject, cell: CellId, body?: TopologyBody): readonly CellId[] {
    const field = this.known(topology, params);
    const key = JSON.stringify(body === undefined ? [cell] : [cell, body.size, body.movement, body.facing ?? null]);
    const found = field.neighbors.get(key);

    if (found !== undefined) return found;

    const neighbors = Object.freeze([...topology.neighbors(params, cell, body)]);

    if (!neighbors.every((next) => field.cells.set.has(next))) {
      throw new TypeError(`The topology ${JSON.stringify(topology.name)} gives a neighbor that is not on the field.`);
    }

    field.neighbors.set(key, neighbors);

    return neighbors;
  }

  /**
   * Returns the cells that obstacles close for movement, or for sight.
   *
   * @throws {ContentError} If the content has no definition of an obstacle.
   */
  closedBy(
    obstacles: readonly FieldObstacle[],
    content: ContentRegistry,
    blocks: ClosedFor,
  ): ReadonlySet<CellId> {
    const known = this.closed[blocks].get(obstacles) ?? new WeakMap<ContentRegistry, ReadonlySet<CellId>>();
    const found = known.get(content);

    if (found !== undefined) return found;

    const cells = new Set(obstacles
      .filter(({ obstacle }) => definitionOf(content.obstacles, obstacle, 'obstacle')[blocks])
      .flatMap(({ cells: taken }) => taken));

    known.set(content, cells);
    this.closed[blocks].set(obstacles, known);

    return cells;
  }

  private known(topology: TopologyExtension, params: JsonObject): KnownField {
    const fields = this.fields.get(params) ?? new Map<string, KnownField>();
    const found = fields.get(topology.name);

    if (found !== undefined) return found;

    const list = Object.freeze([...topology.cells(params)]);
    const set = new Set(list);

    if (set.size !== list.length || !list.every((cell) => typeof cell === 'string')) {
      throw new TypeError(`The topology ${JSON.stringify(topology.name)} gives cells that are not all different.`);
    }

    const field = { cells: { list, set }, neighbors: new Map<string, readonly CellId[]>() };

    fields.set(topology.name, field);
    this.fields.set(params, fields);

    return field;
  }
}
