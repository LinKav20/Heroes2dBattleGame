import type { CellId, ContentName, VisibleTo } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { AppliedEffect } from './units.ts';

/**
 * The field of the battle.
 */
export interface Field {
  /** The name of the field topology in the registry. */
  readonly topology: string;
  /** The parameters of the topology, such as the size of the field. */
  readonly params: JsonObject;
  /** The battlefield whose effects act on the whole battle, if any. */
  readonly battlefield?: ContentName;
  /** The obstacles on the field. */
  readonly obstacles: readonly FieldObstacle[];
  /** The hazard zones on the field. */
  readonly hazards: readonly Hazard[];
  /** The effects applied to the whole field, in the order they were applied. */
  readonly effects: readonly AppliedEffect[];
}

/**
 * An obstacle on the field.
 */
export interface FieldObstacle {
  /** The identifier of the obstacle. */
  readonly id: string;
  /** The definition of the obstacle. */
  readonly obstacle: ContentName;
  /** The cells the obstacle takes. */
  readonly cells: readonly CellId[];
}

/**
 * A hazard zone: cells whose effects act on the units that enter or stand in them.
 */
export interface Hazard {
  /** The identifier of the zone. */
  readonly id: string;
  /** The cells of the zone. */
  readonly cells: readonly CellId[];
  /** The effects of the zone, with their durations and sources. */
  readonly effects: readonly AppliedEffect[];
  /** Which sides see the zone. */
  readonly visibleTo: VisibleTo;
}
