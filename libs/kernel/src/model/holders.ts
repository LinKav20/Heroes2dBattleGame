import type { SideTarget, UnitTarget } from './input-requests.ts';

/**
 * What an effect is applied to: a unit, a side, the whole field or a hazard zone.
 */
export type EffectHolder = FieldHolder | HazardHolder | SideTarget | UnitTarget;

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
