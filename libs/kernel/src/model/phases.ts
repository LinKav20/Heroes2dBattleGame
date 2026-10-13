import type { SideId, UnitId } from '../ids/index.ts';

/**
 * Where a battle is by the rules: deployment, the start of a round, whose turn it is, or the end of the battle.
 */
export type BattlePhase = ActivePhase | EndedPhase;

/**
 * A phase of a battle that goes on: deployment, the start of a round or a turn.
 */
export type ActivePhase = DeploymentPhase | RoundStartPhase | TurnPhase;

/**
 * Sides deploy their units before the first round.
 */
export interface DeploymentPhase {
  /** The kind of phase. */
  readonly kind: 'deployment';
  /** The sides that have not finished deployment, in the order the ruleset gives; the first one deploys now. */
  readonly pending: readonly SideId[];
}

/**
 * A round is starting.
 */
export interface RoundStartPhase {
  /** The kind of phase. */
  readonly kind: 'round-start';
}

/**
 * A side or a unit has the turn.
 */
export interface TurnPhase {
  /** The kind of phase. */
  readonly kind: 'turn';
  /** The side that has the turn, or the side of the unit that has it. */
  readonly side: SideId;
  /** The unit that has the turn, if the turn belongs to a unit. */
  readonly unit?: UnitId;
}

/**
 * The battle is over.
 */
export interface EndedPhase {
  /** The kind of phase. */
  readonly kind: 'ended';
  /** How the battle ended. */
  readonly outcome: Outcome;
}

/**
 * How a battle ended.
 */
export interface Outcome {
  /** A side won or lost by a condition of the scenario, the battle ended in a draw, or a side retreated or gave up. */
  readonly kind: 'defeat' | 'draw' | 'retreat' | 'surrender' | 'victory';
  /** The sides that won; empty for a draw. */
  readonly winners: readonly SideId[];
  /** The side the outcome is about: the one that won, lost, retreated or gave up. A draw has none. */
  readonly side?: SideId;
  /** The local name of the scenario condition that ended the battle, if a condition did. */
  readonly condition?: string;
}
