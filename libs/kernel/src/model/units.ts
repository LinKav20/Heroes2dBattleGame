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
  /**
   * How many creatures the unit started the battle with or was summoned with: the number of the scenario or of the
   * options of the battle, which losses to the effects of the scenario do not change. Healing that revives brings
   * dead creatures back only up to this number, and the unit never has more creatures.
   */
  readonly startCount: number;
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
  /**
   * The effects of the auras that cover the unit, by full name, sorted. They act on the unit as the effects of its
   * creature do. The kernel brings them up to date after every game command.
   */
  readonly auras: readonly ContentName[];
  /**
   * The hazard zones the unit stands in, sorted. The effects of these zones act on the unit. The kernel brings them up
   * to date together with the auras.
   */
  readonly zones: readonly string[];
  /**
   * The tags that operations gave the unit through `kernel:tags-changed`, with how many sources gave each. The full
   * tags of the unit also include the tags of its creature and of the effects acting on it; the kernel calculates
   * them.
   */
  readonly tags: Readonly<Record<Tag, number>>;
  /**
   * The flags of the unit by full name, sorted, for example `acme-frost:frozen`. Unlike tags, flags have no
   * hierarchy and no count of sources.
   */
  readonly flags: readonly string[];
  /** The items of the unit. */
  readonly inventory: readonly InventoryItem[];
  /**
   * The actions of the turn the unit has spent during its current turn, by the full name of the kind of action, for
   * example `core:bonus-action`. How many actions of a kind a unit has every turn is the value of the attribute with
   * the same name.
   */
  readonly spentActions: Readonly<Record<ContentName, number>>;
  /** How the unit has used its abilities. */
  readonly abilityUses: readonly AbilityUse[];
  /** Whether the unit was summoned during the battle. */
  readonly summoned: boolean;
  /** Which sides see the unit. */
  readonly visibleTo: VisibleTo;
}
