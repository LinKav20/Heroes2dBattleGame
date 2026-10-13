import type { SideId, UnitId } from '../ids/index.ts';

/**
 * What an effect is applied to: a unit, a side, the whole field or a hazard zone.
 */
export type EffectHolder = FieldHolder | HazardHolder | SideHolder | UnitHolder;

/**
 * A unit as the holder of an effect or of a used ability.
 */
export interface UnitHolder {
  /** The kind of holder. */
  readonly kind: 'unit';
  /** The unit. */
  readonly unit: UnitId;
}

/**
 * A side as the holder of an effect or of a used ability.
 */
export interface SideHolder {
  /** The kind of holder. */
  readonly kind: 'side';
  /** The side. */
  readonly side: SideId;
}

/**
 * The whole field as the holder of an effect.
 */
export interface FieldHolder {
  /** The kind of holder. */
  readonly kind: 'field';
}

/**
 * A hazard zone as the holder of an effect.
 */
export interface HazardHolder {
  /** The kind of holder. */
  readonly kind: 'hazard';
  /** The identifier of the zone. */
  readonly hazard: string;
}
