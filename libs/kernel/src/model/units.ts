import type { CellId, ContentName, SideId, Tag, UnitId, VisibleTo } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';

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

/**
 * An effect applied to a unit or a side.
 */
export interface AppliedEffect {
  /** The identifier of this application; a larger one was applied later. */
  readonly id: number;
  /** The definition of the effect. */
  readonly effect: ContentName;
  /** The unit that applied the effect, if any. */
  readonly sourceUnit?: UnitId;
  /** The side that applied the effect, if any. */
  readonly sourceSide?: SideId;
  /** The rounds or turns left, for an effect with a counted duration. */
  readonly remaining?: number;
  /** How many times the effect is stacked. */
  readonly stacks: number;
  /** Whether the effect acts now; an effect is switched off while its condition does not hold. */
  readonly active: boolean;
  /** The values the effect was applied with, such as its strength. */
  readonly params: JsonObject;
  /** Which sides see the effect. */
  readonly visibleTo: VisibleTo;
}

/**
 * An item in the inventory of a unit.
 */
export interface InventoryItem {
  /** The identifier of the item in the battle. */
  readonly id: number;
  /** The definition of the item. */
  readonly item: ContentName;
  /** The equipment slot the item takes, if it is equipped. */
  readonly slot?: string;
  /** How many items are in the stack. */
  readonly count: number;
  /** The charges left, if the item has charges. */
  readonly charges?: number;
}

/**
 * How an ability has been used.
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
