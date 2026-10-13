import type { CellId, ContentName, SideId, Tag, UnitId, VisibleTo } from '../ids/index.ts';
import type { AbilityUse } from './ability-uses.ts';
import type { AppliedEffect } from './applied-effects.ts';
import type { InventoryItem } from './inventory.ts';

/**
 * A figure on the field: a single creature or a stack of identical creatures.
 */
export interface Unit {
  /** The identifier of the unit. */
  readonly id: UnitId;
  /** The side of the unit. */
  readonly side: SideId;
  /** The creature of the unit. */
  readonly creature: ContentName;
  /** How many creatures are left; 0 for a dead unit. */
  readonly count: number;
  /** The health of the creature that takes damage first. */
  readonly health: number;
  /** The cell of the unit; a unit that is not deployed yet has none. */
  readonly cell?: CellId;
  /** The direction the unit faces, in the terms of the field topology. */
  readonly facing?: string;
  /** The resources other than health, by the full name of the resource. */
  readonly resources: Readonly<Record<ContentName, number>>;
  /** The effects on the unit in the order they were applied. */
  readonly effects: readonly AppliedEffect[];
  /** How many sources give the unit each tag. */
  readonly tags: Readonly<Record<Tag, number>>;
  /**
   * The flags of the unit by full name, sorted, for example `rules-stdlib:waited`. Unlike tags, flags have no
   * hierarchy and no count of sources.
   */
  readonly flags: readonly string[];
  /** The items of the unit. */
  readonly inventory: readonly InventoryItem[];
  /** How the unit has used its abilities. */
  readonly abilityUses: readonly AbilityUse[];
  /** Whether the unit was summoned during the battle. */
  readonly summoned: boolean;
  /** Which sides see the unit. */
  readonly visibleTo: VisibleTo;
}
