import type { ContentName, Tag } from '../ids/index.ts';
import type { AreaRule } from './effects.ts';
import type { Op, Predicate } from './expressions.ts';

/**
 * A definition of a creature. A unit on the field refers to it and stores only what changes during the battle.
 */
export interface Creature {
  /** The full name of the creature. */
  readonly name: ContentName;
  /** The tags of the creature, for example `Creature.Undead`. */
  readonly tags: readonly Tag[];
  /** The base values of attributes, by the full name of the attribute. */
  readonly attributes: Readonly<Record<ContentName, number>>;
  /** The resources of the creature, such as mana, by the full name of the resource. */
  readonly resources: Readonly<Record<ContentName, ResourceRule>>;
  /** The abilities of the creature. */
  readonly abilities: readonly ContentName[];
  /** The effects the creature always has. */
  readonly effects: readonly ContentName[];
  /** How many cells the creature takes; the field topology turns the size into cells. */
  readonly size: number;
  /** How the creature moves. */
  readonly movement: Movement;
}

/**
 * How a unit moves: on the ground, over obstacles, or straight to the target cell.
 */
export type Movement = 'fly' | 'teleport' | 'walk';

/**
 * A number stored in the state that never exceeds its bound.
 */
export interface ResourceRule {
  /** The full name of the attribute that bounds the resource. */
  readonly limit: ContentName;
  /** The value at the start of the battle. */
  readonly initial: 'empty' | 'full';
  /** When the resource is restored to its bound, if ever. */
  readonly restore?: 'battle' | 'round' | 'turn';
}

/**
 * A definition of an ability: what a unit or a side can do at will, such as attack, shoot or cast a spell.
 */
export interface Ability {
  /** The full name of the ability. */
  readonly name: ContentName;
  /** The tags of the ability, for example `Spell.Fire`. */
  readonly tags: readonly Tag[];
  /** What using the ability costs. */
  readonly cost: AbilityCost;
  /** How many turns of its user pass before the ability can be used again. */
  readonly cooldown: number;
  /** How many times the ability can be used per turn, round or battle. */
  readonly limits: UseLimits;
  /** The ability can be used only if this condition holds. */
  readonly requires?: Predicate;
  /** The ability cannot be used while its user has any of these tags. */
  readonly forbiddenBy: readonly Tag[];
  /** What the ability targets. */
  readonly target: TargetRule;
  /** The operations to run. */
  readonly ops: readonly Op[];
}

/**
 * The cost of an ability.
 */
export interface AbilityCost {
  /** The kinds of actions of the turn it spends, by full name, for example `core:bonus-action`. */
  readonly actions: Readonly<Record<ContentName, number>>;
  /** The resources it spends, by the full name of the resource. */
  readonly resources: Readonly<Record<ContentName, number>>;
}

/**
 * Limits on how often an ability can be used.
 */
export interface UseLimits {
  /** At most this many times per turn. */
  readonly perTurn?: number;
  /** At most this many times per round. */
  readonly perRound?: number;
  /** At most this many times per battle. */
  readonly perBattle?: number;
}

/**
 * What an ability targets and how far.
 */
export interface TargetRule {
  /** The kind of target. */
  readonly kind: 'area' | 'cell' | 'none' | 'self' | 'side' | 'unit';
  /** The largest distance to the target in cells. */
  readonly range?: number;
  /** The area around the target cell for the kind `area`. */
  readonly area?: AreaRule;
  /** The target must satisfy this condition. */
  readonly filter?: Predicate;
  /** How many targets to choose. */
  readonly count?: number;
}

/**
 * A definition of an item: a weapon, armor, an artifact, a potion or another consumable.
 */
export interface Item {
  /** The full name of the item. */
  readonly name: ContentName;
  /** The tags of the item. */
  readonly tags: readonly Tag[];
  /** The equipment slot the item takes, if any. */
  readonly slot?: string;
  /** How many items fit into one stack; 1 means that items do not stack. */
  readonly stack: number;
  /** The passive effects of the item. */
  readonly effects: readonly ContentName[];
  /** The abilities the item gives. */
  readonly abilities: readonly ContentName[];
  /** How many charges a new item has, if it has charges. */
  readonly charges?: number;
  /** Whether using the item uses it up. */
  readonly consumedOnUse: boolean;
}

/**
 * A definition of a battlefield: the effects that act on the whole battle, for example of the terrain.
 */
export interface Battlefield {
  /** The full name of the battlefield. */
  readonly name: ContentName;
  /** The effects of the battlefield. */
  readonly effects: readonly ContentName[];
}

/**
 * A definition of an obstacle on the field.
 */
export interface Obstacle {
  /** The full name of the obstacle. */
  readonly name: ContentName;
  /** The tags of the obstacle. */
  readonly tags: readonly Tag[];
  /** Whether units cannot walk through the obstacle. */
  readonly blocksMovement: boolean;
  /** Whether the obstacle blocks the line of sight. */
  readonly blocksSight: boolean;
}
