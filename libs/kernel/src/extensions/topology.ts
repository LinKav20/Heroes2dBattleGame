import type { AreaRule, Movement } from '../content/index.ts';
import type { CellId, UnitId } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { Extension } from '../names/index.ts';

/**
 * A field topology, such as hexes: the shape of the field. The kernel keeps a cell as an opaque identifier and asks the
 * topology about everything else, and passes it only cells of the field. Every function has no side effects and gives
 * the same result for the same input. Lists have no repeated cells, and their order matters only where a function
 * says so. The kernel checks part of the contract, see `FieldGeometry`; a topology that breaks another part, such as
 * the symmetry of distances, gives wrong ranges and paths.
 *
 * `Params` is the format of the parameters of the field, such as its size: a JSON object, so an interface of it extends
 * `JsonObject`, or it is a type alias.
 */
export interface TopologyExtension<Params extends JsonObject = JsonObject> extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'topology';
  /** The JSON Schema of the parameters of the field; the content loader checks scenarios by it. */
  readonly schema: JsonObject;
  /**
   * Returns every cell of the field. Where nothing else orders cells, the kernel keeps this order: for example, of the
   * cells a teleporting unit reaches at the same distance.
   */
  cells(params: Params): readonly CellId[];
  /**
   * Returns the cells of the field next to a cell. With a body, only those the creature can step to, for example air
   * cells only for fliers. Dijkstra's algorithm reaches the cells in this order.
   */
  neighbors(params: Params, cell: CellId, body?: TopologyBody): readonly CellId[];
  /**
   * Returns the cost of a step of a creature from a cell into its neighbor, a whole number from 1: for example, more
   * for climbing a height than for going down.
   */
  moveCost(params: Params, from: CellId, to: CellId, body: TopologyBody): number;
  /**
   * Returns the distance between two cells of the field: a whole number from 0, which is 0 only for the same cell and
   * is the same in both directions. The distances of two neighbors to any cell differ by at most 1. The kernel measures
   * ranges and teleports by it and guides pathfinding with it.
   */
  distance(params: Params, from: CellId, to: CellId): number;
  /**
   * Returns the cells of the field in an area, in any order: for `radius`, the cells within `size` of the center, the
   * center included; for `line`, `size` cells along the way from `origin` through the center and beyond it; for
   * `cone`, the cells that widen from `origin` toward the center and are at most `size` away from the origin. A line
   * and a cone leave the origin out, and without an origin they have only the center.
   */
  area(params: Params, rule: AreaRule, center: CellId, origin?: CellId): readonly CellId[];
  /**
   * Returns the cells a creature takes when it stands in a cell of the field, that cell first and all of them on the
   * field, or nothing if the creature does not fit there. The kernel does not ask about a creature of size 1, which
   * takes only its cell.
   */
  footprint(params: Params, cell: CellId, body: TopologyBody): readonly CellId[] | undefined;
  /**
   * Returns the cells on the straight line between two different cells of the field, without both of them, in the
   * order from `from`: none between neighbors, and the same cells in the reverse order from `to` to `from`.
   * Obstacles that block sight on these cells hide one cell from the other. Without this function every cell sees
   * every other.
   */
  line?(params: Params, from: CellId, to: CellId): readonly CellId[];
  /**
   * Returns the directions a creature may face on the field, if the topology has directions. Without this function a
   * unit has no direction, and a command that gives one is invalid.
   */
  directions?(params: Params): readonly string[];
}

/**
 * What a topology knows about a creature that stands or moves on the field.
 */
export interface TopologyBody {
  /** How many cells the creature takes, from 1. */
  readonly size: number;
  /** How the creature moves. */
  readonly movement: Movement;
  /** The direction the creature faces, if the topology has directions. */
  readonly facing?: string;
}

/**
 * The field of a state as the topology of the battle describes it, with the units and obstacles on it.
 *
 * A unit takes the cells of its creature in its cell while it stands on the field, that is while it is alive and has a
 * cell. Walking units cannot pass through obstacles that block movement and the cells of other units on the field, and
 * they stop only where all their cells are free. Flying units pass over them, but stop only in free cells too, and
 * teleporting units jump straight to a free cell within the distance they may go. A unit keeps its direction on the
 * way. Dijkstra's algorithm finds the reachable cells: of equal costs, it takes the cells in the order it reaches them
 * through the neighbors of the topology. The A* algorithm finds a path: of the cells of equal estimated cost, it takes
 * first the one nearer to the goal, then the one it reached first. So both always find the same result.
 *
 * Every method throws a `TypeError` if a unit it names is not in the battle, if no package declares the topology of the
 * field, or if the topology breaks its contract in a way the kernel sees: a cell off the field among the neighbors, the
 * cells of an area, a line or a creature, a creature whose cells do not start with its cell, a distance or a cost of a
 * step that is not whole. A cell the caller gives that is not on the field is a `TypeError` too in `neighbors`,
 * `distance`, `distanceBetween`, `nearestCell`, `sees` and `area`; `cellsAt` and `path` give nothing for it,
 * `canStand` false, and `cellsAlong` and `unitsTouching` leave it out. It throws a
 * `ContentError` if the content has no definition of a creature or an obstacle, or a creature has a size below 1 or an
 * unknown way of movement.
 */
export interface FieldGeometry {
  /** Every cell of the field in the order of the topology. */
  readonly cells: readonly CellId[];
  /** The directions a unit may face, none if the topology has no directions. */
  readonly directions: readonly string[];
  /** Tells whether a cell is on the field. */
  hasCell(cell: CellId): boolean;
  /** Returns the neighbors of a cell of the field. */
  neighbors(cell: CellId): readonly CellId[];
  /** Returns the distance between two cells of the field. */
  distance(from: CellId, to: CellId): number;
  /** Returns the least distance between two groups of cells, or nothing if a group is empty. */
  distanceBetween(from: readonly CellId[], to: readonly CellId[]): number | undefined;
  /** Returns the cell of a group that is nearest to a cell, the first of them if several are as near, or nothing. */
  nearestCell(from: readonly CellId[], to: CellId): CellId | undefined;
  /**
   * Tells whether a cell of one group sees a cell of the other: they are the same cell, or no obstacle that blocks
   * sight stands on the line between them, as {@link TopologyExtension.line} gives it. Units do not block sight. An
   * empty group sees nothing and is not seen. A cell off the field in either group is a `TypeError`.
   */
  sees(from: readonly CellId[], to: readonly CellId[]): boolean;
  /** Returns the cells of an area, as {@link TopologyExtension.area} describes. */
  area(rule: AreaRule, center: CellId, origin?: CellId): readonly CellId[];
  /** Returns the cells a unit takes, its own cell first, or none if it does not stand on the field. */
  cellsOf(unit: UnitId): readonly CellId[];
  /**
   * Returns the cells a unit would take in a cell facing a direction, its current one if none is given, that cell
   * first, or nothing if the cell is not on the field or the unit does not fit there.
   */
  cellsAt(unit: UnitId, cell: CellId, facing?: string): readonly CellId[] | undefined;
  /**
   * Tells whether a unit can stand in a cell facing a direction, its current one if none is given: it fits there, and
   * none of its cells is taken by an obstacle that blocks movement or by another unit on the field.
   */
  canStand(unit: UnitId, cell: CellId, facing?: string): boolean;
  /**
   * Returns the cells a unit touches on a way from its cell: the cells it takes in every cell of the way in its current
   * direction, and in the last cell in the direction it ends with, its current one if none is given. A flying unit
   * touches only the cells where it stops, and a way without cells touches nothing.
   */
  cellsAlong(unit: UnitId, way: readonly CellId[], facing?: string): readonly CellId[];
  /** Returns the units that stand on the field and take one of the cells, in the order of units. */
  unitsTouching(cells: readonly CellId[]): readonly UnitId[];
  /**
   * Returns the cells where a unit can stop within a cost of movement, a whole number, nearest first, without the cell
   * where it stands; none for a cost below 0 or a unit that does not stand on the field.
   */
  reachable(unit: UnitId, budget: number): readonly ReachableCell[];
  /** Returns the cheapest way of a unit to a cell where it can stop, or nothing if there is none. */
  path(unit: UnitId, to: CellId, options?: PathOptions): Route | undefined;
}

/**
 * How a way is found.
 */
export interface PathOptions {
  /** The direction to face at the end; the current one if not given. */
  readonly facing?: string;
  /** The largest cost of movement, a whole number; no limit if not given. */
  readonly budget?: number;
}

/**
 * A cell a unit can reach, and what it costs.
 */
export interface ReachableCell {
  /** The cell. */
  readonly cell: CellId;
  /** The cost of movement to the cell. */
  readonly cost: number;
}

/**
 * A way of a unit to a cell.
 */
export interface Route {
  /**
   * The cells the unit passes, ending with the cell where it stops, without the cell where it stands. None if it
   * already stands there: then it does not move, and a step that only turns it gives no `kernel:unit-moved`.
   */
  readonly cells: readonly CellId[];
  /** The cost of movement. */
  readonly cost: number;
}
