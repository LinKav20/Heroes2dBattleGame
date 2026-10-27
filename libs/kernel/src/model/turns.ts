import type { SideId } from '../ids/index.ts';
import { sameHolder, type SideHolder, type TurnHolder, type UnitHolder } from './holders.ts';
import { battleSide, battleUnit, standsOnField } from './lookups.ts';
import { forbidden, REJECTION_REASONS, type Forbidden } from './rejection.ts';
import type { BattleState, TurnRecord } from './state.ts';
import type { Unit } from './units.ts';

/**
 * Returns the turns of a side or a unit that have ended in the current round, in the order they ended.
 */
export function turnRecordsOf(state: BattleState, holder: TurnHolder): readonly TurnRecord[] {
  return state.turns.filter((record) => sameHolder(record.holder, holder));
}

/**
 * Tells whether a side or a unit has had a turn in the current round that it did not put off by waiting.
 */
export function hasActed(state: BattleState, holder: TurnHolder): boolean {
  return turnRecordsOf(state, holder).some(({ waited }) => !waited);
}

/**
 * Returns the units of a side that stand on the field, in the order of the state.
 */
export function fieldUnitsOf(state: BattleState, side: SideId): readonly Unit[] {
  return state.units.filter((unit) => unit.side === side && standsOnField(unit));
}

/**
 * Returns why a unit or a side cannot act now by the turn, or nothing if it can: a unit must be alive, the battle must
 * be in a turn, and the turn must belong to the unit or its whole side, or for a side to the side or any of its units.
 * A turn of a side without a unit belongs to the whole side only if the ruleset gives turns to sides; where it gives
 * turns to units, such a phase is the turn of a unit that a projection does not show, and no unit of the side acts in
 * it but that unit.
 *
 * @throws {TypeError} If the unit or the side is not in the battle.
 */
export function turnRejection(state: BattleState, actor: SideHolder | UnitHolder): Forbidden | undefined {
  const unit = actor.kind === 'unit' ? battleUnit(state, actor.unit) : undefined;
  const side = unit?.side ?? (actor.kind === 'side' ? battleSide(state, actor.side).id : '');

  if (unit?.count === 0) return forbidden(REJECTION_REASONS.unitDead, { unit: unit.id });

  const { phase } = state;

  if (phase.kind !== 'turn') return forbidden(REJECTION_REASONS.wrongPhase);

  const whole = phase.unit === undefined && state.ruleset.turnOwner !== 'unit';
  const own = phase.side === side && (unit === undefined || whole || phase.unit === unit.id);

  return own ? undefined : forbidden(REJECTION_REASONS.notYourTurn);
}
