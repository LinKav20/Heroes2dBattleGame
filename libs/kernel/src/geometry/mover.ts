import { ContentError, creatureDefinition, MOVEMENTS, type ContentRegistry } from '../content/index.ts';
import type { TopologyBody } from '../extensions/index.ts';
import type { CellId } from '../ids/index.ts';
import type { Unit } from '../model/index.ts';
import type { MoverField } from './pathfinding.ts';

/**
 * What a moving unit needs from the field: the cells it takes in a cell, its steps and their costs, and distances.
 */
export interface Ground {
  /** Returns the cells a creature takes in a cell, or nothing if it does not fit there. */
  footprint(cell: CellId, body: TopologyBody): readonly CellId[] | undefined;
  /** Returns the cells a creature can step to from a cell. */
  stepsFrom(cell: CellId, body: TopologyBody): readonly CellId[];
  /** Returns the cost of a step of a creature into a neighbor. */
  stepCost(from: CellId, to: CellId, body: TopologyBody): number;
  /** Returns the distance between two cells. */
  distance(from: CellId, to: CellId): number;
}

/**
 * The field as one unit that moves sees it: the unit passes and stops by its way of movement, the obstacles that block
 * movement and the cells of other units that are alive. Whether it can stop in a cell is found once per cell.
 */
export class UnitMover implements MoverField {
  /** The cell where the unit stands. */
  readonly start: CellId;

  /** The creature of the unit as the topology sees it. */
  readonly body: TopologyBody;

  private readonly ground: Ground;

  private readonly blocked: ReadonlySet<CellId>;

  private readonly stops = new Map<CellId, boolean>();

  constructor(ground: Ground, start: CellId, body: TopologyBody, blocked: ReadonlySet<CellId>) {
    this.ground = ground;
    this.start = start;
    this.body = body;
    this.blocked = blocked;
  }

  neighbors(cell: CellId): readonly CellId[] {
    return this.ground.stepsFrom(cell, this.body);
  }

  moveCost(from: CellId, to: CellId): number {
    return this.ground.stepCost(from, to, this.body);
  }

  distance(from: CellId, to: CellId): number {
    return this.ground.distance(from, to);
  }

  canStop(cell: CellId): boolean {
    const known = this.stops.get(cell);

    if (known !== undefined) return known;

    const free = this.fits(cell, this.body);

    this.stops.set(cell, free);

    return free;
  }

  canPass(cell: CellId): boolean {
    if (this.body.movement === 'walk') return this.canStop(cell);

    return this.ground.footprint(cell, this.body) !== undefined;
  }

  /** Tells whether the unit can stop in a cell facing as the body says. */
  fits(cell: CellId, body: TopologyBody): boolean {
    return this.ground.footprint(cell, body)?.every((taken) => !this.blocked.has(taken)) === true;
  }
}

/**
 * Returns what the topology needs to know about the creature of a unit, facing the given direction or its own.
 *
 * @throws {ContentError} If the content has no such creature, or its size is not a whole number from 1 or its way of
 * movement is unknown.
 */
export function bodyOf(content: ContentRegistry, unit: Unit, facing = unit.facing): TopologyBody {
  const { movement, name, size } = creatureDefinition(content, unit.creature);

  if (!Number.isSafeInteger(size) || size < 1 || !MOVEMENTS.some((known) => known === movement)) {
    throw new ContentError(
      `The creature ${JSON.stringify(name)} needs a size from 1 and the movement walk, fly or teleport.`,
      { definition: name },
    );
  }

  return { movement, size, ...(facing === undefined ? {} : { facing }) };
}
