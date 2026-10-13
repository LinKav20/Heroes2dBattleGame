import type { ContentName } from '../ids/index.ts';

/**
 * How a unit or a side has used an ability.
 */
export interface AbilityUse {
  /** The ability. */
  readonly ability: ContentName;
  /** Uses during the current turn. */
  readonly turn: number;
  /** Uses during the current round. */
  readonly round: number;
  /** Uses during the whole battle. */
  readonly battle: number;
  /** The turns left until the ability can be used again. */
  readonly cooldown: number;
}
