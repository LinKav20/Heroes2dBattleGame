import {
  abilityDefinition,
  creatureDefinition,
  effectDefinition,
  itemDefinition,
  RANDOM_SOURCES,
  type ContentRegistry,
  type Ruleset,
  type Scenario,
  type ScenarioItem,
  type ScenarioUnit,
} from '../content/index.ts';
import type { MechanicExtension } from '../extensions/index.ts';
import { summonedUnitNumber, type SideId, type UnitId } from '../ids/index.ts';
import type { Registry } from '../names/index.ts';
import { checkItem } from '../operations/index.ts';
import { isRecord, sortedEntries } from '../shared/index.ts';
import { scenarioSide } from './deployment-zones.ts';
import { itemProblem } from './initial-units.ts';
import { checkChoices, checkTurnOwner } from './mechanics.ts';
import type { BattleOptions, StartingEffect, UnitChanges } from './options.ts';
import { seenBySides, UNSEEN } from './state-checks.ts';

/**
 * Checks the options of a battle against the scenario of the content and its ruleset, in one place:
 * - removed units are units of the scenario, all different;
 * - added units join sides of the scenario under names that differ from the units of the scenario, from each other and
 *   from summoned units, have a count from 1 and are seen by their sides and by no side the scenario does not have;
 * - changed units are in the battle, neither removed nor unknown, and get numbers in their bounds;
 * - items of added and changed units have counts, charges and slots their items can have;
 * - changed sides are in the scenario and get no ability they have already;
 * - effects of units and sides have names and parameters as objects or none;
 * - chosen variants are declared, belong to their mechanics and give turns to whom the ruleset does;
 * - sources of random values are known, and the seed is 64 lowercase hexadecimal digits.
 *
 * @throws {ContentError} If the content has no creature, effect, item or ability the options name, or an item they
 * name is described wrongly.
 * @throws {TypeError} If the options are wrong otherwise.
 */
export function checkOptions(
  content: ContentRegistry,
  mechanics: Registry<MechanicExtension>,
  scenario: Scenario,
  ruleset: Ruleset,
  options: BattleOptions,
): void {
  const units = battleUnits(content, scenario, options);
  const sources = Object.values<string>(RANDOM_SOURCES);
  const choices = options.ruleset?.mechanics ?? {};

  for (const [unit, changes] of sortedEntries(options.units ?? {})) {
    if (!units.has(unit)) {
      throw new TypeError(`The battle has no unit ${JSON.stringify(unit)} to change; it is removed or unknown.`);
    }

    checkChanges(content, unit, changes);
  }

  checkSides(content, scenario, options);
  checkChoices(mechanics, choices, 'The options', (message) => new TypeError(message));
  checkTurnOwner(mechanics, choices, ruleset, 'The options', (message) => new TypeError(message));

  for (const [value, source] of sortedEntries(options.ruleset?.randomSources ?? {})) {
    if (!sources.includes(source)) throw new TypeError(`The options give ${JSON.stringify(value)} an unknown source.`);
  }

  if (options.seed !== undefined && !SEED.test(options.seed)) {
    throw new TypeError('The seed needs 64 lowercase hexadecimal digits.');
  }
}

/**
 * Returns the scenario of one battle with the units and sides of the options, which `checkOptions` has checked:
 * without the removed units, with the added units after the units of their sides, with the items the options give
 * units, and with the abilities the options add to sides. The effects of the options apply later, at the start of the
 * battle.
 */
export function scenarioWithOptions(scenario: Scenario, options: BattleOptions): Scenario {
  const removed = new Set(options.removed);
  const sides = scenario.sides.map((side) => ({
    ...side,
    abilities: [...side.abilities, ...options.sides?.[side.id]?.abilities ?? []],
    units: [...side.units.filter(({ id }) => !removed.has(id)), ...options.added?.[side.id] ?? []]
      .map((unit) => withItems(unit, options)),
  }));

  return { ...scenario, sides };
}

const SEED = /^[\da-f]{64}$/;

function battleUnits(content: ContentRegistry, scenario: Scenario, options: BattleOptions): ReadonlySet<UnitId> {
  const own = new Set(scenario.sides.flatMap(({ units }) => units.map(({ id }) => id)));
  const units = new Set(own);

  for (const unit of options.removed ?? []) {
    if (!own.has(unit)) throw new TypeError(`The scenario has no unit ${JSON.stringify(unit)} to remove.`);

    if (!units.has(unit)) throw new TypeError(`The options remove the unit ${JSON.stringify(unit)} twice.`);

    units.delete(unit);
  }

  for (const [side, added] of sortedEntries(options.added ?? {})) {
    if (scenarioSide(scenario, side) === undefined) {
      throw new TypeError(`The scenario has no side ${JSON.stringify(side)} to add units to.`);
    }

    for (const unit of added) {
      const name = JSON.stringify(unit.id);

      if (own.has(unit.id)) throw new TypeError(`The options add the unit ${name} under a name of the scenario.`);

      if (units.has(unit.id)) throw new TypeError(`The options add the unit ${name} twice.`);

      checkAdded(content, scenario, side, unit);
      units.add(unit.id);
    }
  }

  return units;
}

function checkAdded(content: ContentRegistry, scenario: Scenario, side: SideId, unit: ScenarioUnit): void {
  const name = JSON.stringify(unit.id);

  if (summonedUnitNumber(unit.id) !== undefined) {
    throw new TypeError(`The options add the unit ${name} named like a summoned unit.`);
  }

  if (!Number.isSafeInteger(unit.count) || unit.count < 1) {
    throw new TypeError(`The unit ${name} needs a count from 1.`);
  }

  if (!seenBySides(scenario, unit.visibleTo, side)) throw new TypeError(`The unit ${name} ${UNSEEN}.`);

  creatureDefinition(content, unit.creature);

  for (const effect of unit.effects) {
    effectDefinition(content, effect);
  }

  checkItems(content, unit.items, name);
}

function checkChanges(content: ContentRegistry, unit: UnitId, changes: UnitChanges): void {
  const name = JSON.stringify(unit);

  if (changes.count !== undefined && (!Number.isSafeInteger(changes.count) || changes.count < 1)) {
    throw new TypeError(`The unit ${name} needs a count from 1.`);
  }

  for (const [resource, value] of sortedEntries(changes.resources ?? {})) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`The resource ${JSON.stringify(resource)} of ${name} needs a value of 0+.`);
    }
  }

  for (const [ability, { battle = 0, cooldown = 0 }] of sortedEntries(changes.abilityUses ?? {})) {
    abilityDefinition(content, ability);

    if (![battle, cooldown].every((value) => Number.isSafeInteger(value) && value >= 0)) {
      throw new TypeError(`The uses of ${JSON.stringify(ability)} by ${name} need numbers of 0+.`);
    }
  }

  checkItems(content, changes.items ?? [], name);
  checkEffects(content, changes.effects ?? [], `The unit ${name}`);
}

function checkSides(content: ContentRegistry, scenario: Scenario, options: BattleOptions): void {
  for (const [id, changes] of sortedEntries(options.sides ?? {})) {
    const side = scenarioSide(scenario, id);

    if (side === undefined) throw new TypeError(`The scenario has no side ${JSON.stringify(id)} to change.`);

    const abilities = [...side.abilities];

    for (const ability of changes.abilities ?? []) {
      abilityDefinition(content, ability);

      if (abilities.includes(ability)) {
        throw new TypeError(`The side ${JSON.stringify(id)} has the ability ${JSON.stringify(ability)} already.`);
      }

      abilities.push(ability);
    }

    checkEffects(content, changes.effects ?? [], `The side ${JSON.stringify(id)}`);
  }
}

function checkItems(content: ContentRegistry, items: readonly ScenarioItem[], unit: string): void {
  for (const item of items) {
    const definition = itemDefinition(content, item.item);

    checkItem(definition);

    const problem = itemProblem(definition, item);

    if (problem !== undefined) {
      throw new TypeError(`An item ${JSON.stringify(item.item)} of the unit ${unit} in the options ${problem}.`);
    }
  }
}

function checkEffects(content: ContentRegistry, effects: readonly StartingEffect[], label: string): void {
  for (const { effect, params } of effects) {
    if (typeof effect !== 'string' || (params !== undefined && !isRecord(params))) {
      throw new TypeError(`${label} gets an effect that needs a full name and parameters as an object or none.`);
    }

    effectDefinition(content, effect);
  }
}

function withItems(unit: ScenarioUnit, options: BattleOptions): ScenarioUnit {
  const items = options.units?.[unit.id]?.items;

  return items === undefined ? unit : { ...unit, items };
}
