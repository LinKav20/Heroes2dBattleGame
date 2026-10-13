import type { ContentName, SideId } from '../ids/index.ts';
import type { AbilityUse } from './ability-uses.ts';
import type { AppliedEffect } from './applied-effects.ts';

/**
 * A side of the battle with its own effects and abilities, which belong to no unit on the field.
 */
export interface Side {
  /** The local name of the side. */
  readonly id: SideId;
  /** The effects on the side. */
  readonly effects: readonly AppliedEffect[];
  /** The abilities of the side. */
  readonly abilities: readonly ContentName[];
  /** How the side has used its abilities. */
  readonly abilityUses: readonly AbilityUse[];
}
