import type { SideId, UnitId } from '../ids/index.ts';
import type { SideTarget, Target, UnitTarget } from './input-requests.ts';

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

/**
 * Returns a holder as a participant of a formula: a unit or a side, or nothing for the field and a hazard zone.
 */
export function holderTarget(holder: EffectHolder): SideTarget | UnitTarget | undefined {
  if (holder.kind === 'side') return { kind: 'side', side: holder.side };

  return holder.kind === 'unit' ? { kind: 'unit', unit: holder.unit } : undefined;
}

/**
 * Returns a participant of a formula as a holder: a unit or a side, or nothing for a cell or no participant.
 */
export function targetHolder(target: Target | undefined): SideHolder | UnitHolder | undefined {
  if (target?.kind === 'side') return { kind: 'side', side: target.side };

  return target?.kind === 'unit' ? { kind: 'unit', unit: target.unit } : undefined;
}
