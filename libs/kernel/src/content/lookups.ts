import type { ContentName } from '../ids/index.ts';
import { definitionOf } from './content-error.ts';
import type { ContentRegistry } from './content-registry.ts';
import type { Ability, Creature, Item } from './definitions.ts';
import type { Effect } from './effects.ts';
import type { Ruleset } from './ruleset.ts';
import type { Scenario } from './scenario.ts';

/**
 * Returns the definition of an ability.
 *
 * @throws {ContentError} If the content has no such ability.
 */
export function abilityDefinition(content: ContentRegistry, name: ContentName): Ability {
  return definitionOf(content.abilities, name, 'ability');
}

/**
 * Returns the definition of a creature.
 *
 * @throws {ContentError} If the content has no such creature.
 */
export function creatureDefinition(content: ContentRegistry, name: ContentName): Creature {
  return definitionOf(content.creatures, name, 'creature');
}

/**
 * Returns the definition of an effect.
 *
 * @throws {ContentError} If the content has no such effect.
 */
export function effectDefinition(content: ContentRegistry, name: ContentName): Effect {
  return definitionOf(content.effects, name, 'effect');
}

/**
 * Returns the definition of an item.
 *
 * @throws {ContentError} If the content has no such item.
 */
export function itemDefinition(content: ContentRegistry, name: ContentName): Item {
  return definitionOf(content.items, name, 'item');
}

/**
 * Returns the definition of a ruleset.
 *
 * @throws {ContentError} If the content has no such ruleset.
 */
export function rulesetDefinition(content: ContentRegistry, name: ContentName): Ruleset {
  return definitionOf(content.rulesets, name, 'ruleset');
}

/**
 * Returns the definition of a scenario.
 *
 * @throws {ContentError} If the content has no such scenario.
 */
export function scenarioDefinition(content: ContentRegistry, name: ContentName): Scenario {
  return definitionOf(content.scenarios, name, 'scenario');
}
