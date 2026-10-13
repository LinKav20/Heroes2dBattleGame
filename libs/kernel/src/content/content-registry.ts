import type { ContentName, Tag } from '../ids/index.ts';
import type { Attribute } from './attributes.ts';
import type { Ability, Battlefield, Creature, Item, Obstacle } from './definitions.ts';
import type { Effect } from './effects.ts';
import type { Ruleset } from './ruleset.ts';
import type { Scenario } from './scenario.ts';

/**
 * The content of a battle as the kernel reads it: the final definitions from the loaded and checked packs.
 *
 * The definitions are final: inheritance and patches are applied, there is no `extends` and no alias table, every
 * reference is a full name, and text fields are left out. Every table is keyed by the full name of the definition.
 */
export interface ContentRegistry {
  /** The packs of the battle with their exact versions, in the order of loading. */
  readonly packs: readonly PackVersion[];
  /** The content hash, as 64 lowercase hexadecimal digits. */
  readonly contentHash: string;
  /** The declared tags. */
  readonly tags: readonly Tag[];
  /** The attributes. */
  readonly attributes: Readonly<Record<ContentName, Attribute>>;
  /** The rulesets. */
  readonly rulesets: Readonly<Record<ContentName, Ruleset>>;
  /** The creatures. */
  readonly creatures: Readonly<Record<ContentName, Creature>>;
  /** The effects. */
  readonly effects: Readonly<Record<ContentName, Effect>>;
  /** The abilities, spells included. */
  readonly abilities: Readonly<Record<ContentName, Ability>>;
  /** The items. */
  readonly items: Readonly<Record<ContentName, Item>>;
  /** The battlefields. */
  readonly battlefields: Readonly<Record<ContentName, Battlefield>>;
  /** The obstacles. */
  readonly obstacles: Readonly<Record<ContentName, Obstacle>>;
  /** The scenarios. */
  readonly scenarios: Readonly<Record<ContentName, Scenario>>;
}

/**
 * A pack with its exact version.
 */
export interface PackVersion {
  /** The name of the pack, for example `core`. */
  readonly name: string;
  /** The exact version of the pack, for example `1.3.0`. */
  readonly version: string;
}
