import type { SideTarget, Target, UnitTarget } from './input-requests.ts';
import type { BattlePhase } from './phases.ts';

/**
 * What an effect is applied to: a unit, a side, the whole field or a hazard zone.
 */
export type EffectHolder = FieldHolder | HazardHolder | SideHolder | UnitHolder;

/**
 * A side or a unit: the one that has the turn, uses an ability or holds an effect. It has the same shape as a unit or
 * a side as a target.
 */
export type TurnHolder = SideHolder | UnitHolder;

/**
 * A unit as the holder of the turn, of an effect or of a used ability; the same shape as a unit as a target.
 */
export type UnitHolder = UnitTarget;

/**
 * A side as the holder of the turn, of an effect or of a used ability; the same shape as a side as a target.
 */
export type SideHolder = SideTarget;

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
  return holder.kind === 'side' || holder.kind === 'unit' ? holder : undefined;
}

/**
 * Returns the side or the unit that has the turn in a phase, or nothing if nobody has it.
 */
export function turnHolderOf(phase: BattlePhase): TurnHolder | undefined {
  if (phase.kind !== 'turn') return undefined;

  return phase.unit === undefined ? { kind: 'side', side: phase.side } : { kind: 'unit', unit: phase.unit };
}

/**
 * Tells whether two holders of a turn are the same side or the same unit.
 */
export function sameHolder(left: TurnHolder | undefined, right: TurnHolder | undefined): boolean {
  if (left?.kind === 'unit') return right?.kind === 'unit' && left.unit === right.unit;

  return left?.kind === 'side' && right?.kind === 'side' && left.side === right.side;
}

/**
 * Returns a participant of a formula as a holder: a unit or a side, or nothing for a cell or no participant.
 */
export function targetHolder(target: Target | undefined): SideHolder | UnitHolder | undefined {
  return target?.kind === 'side' || target?.kind === 'unit' ? target : undefined;
}
