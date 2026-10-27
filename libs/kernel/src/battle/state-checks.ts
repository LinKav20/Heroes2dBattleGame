import {
  abilityDefinition,
  ContentError,
  creatureDefinition,
  effectDefinition,
  type ContentRegistry,
  type Ruleset,
  type Scenario,
  type ScenarioTrigger,
} from '../content/index.ts';
import { KERNEL_EVENTS, RUNNER_EVENTS } from '../events/index.ts';
import type { EventKind, FieldGeometry } from '../extensions/index.ts';
import { summonedUnitNumber, type SideId, type VisibleTo } from '../ids/index.ts';
import type { BattleState, Unit } from '../model/index.ts';
import { BATTLE_MOMENTS, KERNEL_OPERATIONS, type Registry } from '../names/index.ts';
import { sortedEntries } from '../shared/index.ts';
import { fitsZone, scenarioSide } from './deployment-zones.ts';
import { rulesetFailure } from './mechanics.ts';

/**
 * The end of the sentence about a unit that its side does not see or that a side the scenario does not have sees.
 */
export const UNSEEN = 'needs to be seen by its side and by no side the scenario does not have';

/**
 * Checks a scenario as the kernel needs it: local names are unique, units are not named like summoned units and have
 * creatures, every unit is seen by its side, units and hazard zones are seen by no side the scenario lacks, the content
 * has every creature, effect and ability of a side it refers to, a victory or a defeat names a side of the scenario and
 * a draw names none, a trigger waits for a kind of event that can fire it or for a moment of the battle and does not
 * plainly fire itself without end, and deployment zones of different sides do not share cells.
 *
 * @throws {ContentError} If it does not.
 */
export function checkScenario(content: ContentRegistry, events: Registry<EventKind>, scenario: Scenario): void {
  const units = scenario.sides.flatMap((side) => side.units);
  const sides = new Set(scenario.sides.map(({ id }) => id));
  const fail = failure(scenario);

  unique(scenario, 'side', scenario.sides.map(({ id }) => id));
  unique(scenario, 'unit', units.map(({ id }) => id));
  unique(scenario, 'obstacle', scenario.field.obstacles.map(({ id }) => id));
  unique(scenario, 'hazard zone', scenario.field.hazards.map(({ id }) => id));
  unique(scenario, 'trigger', scenario.triggers.map(({ id }) => id));
  unique(scenario, 'outcome', scenario.outcomes.map(({ id }) => id));
  unique(scenario, 'cell of deployment', scenario.sides.flatMap(({ deploymentZone }) => [...new Set(deploymentZone)]));

  for (const side of scenario.sides) {
    for (const unit of side.units) {
      const name = JSON.stringify(unit.id);

      if (summonedUnitNumber(unit.id) !== undefined) throw fail(`The unit ${name} is named like a summoned unit.`);

      if (!Number.isSafeInteger(unit.count) || unit.count < 1) throw fail(`The unit ${name} needs a count from 1.`);

      if (!seenBySides(scenario, unit.visibleTo, side.id)) throw fail(`The unit ${name} ${UNSEEN}.`);

      creatureDefinition(content, unit.creature);
    }
  }

  for (const { id, visibleTo } of scenario.field.hazards) {
    if (!seenBySides(scenario, visibleTo)) {
      throw fail(`The hazard zone ${JSON.stringify(id)} is seen by a side the scenario does not have.`);
    }
  }

  for (const effect of [...scenario.sides, ...scenario.field.hazards, ...units].flatMap((holder) => holder.effects)) {
    effectDefinition(content, effect);
  }

  for (const ability of scenario.sides.flatMap((side) => side.abilities)) {
    abilityDefinition(content, ability);
  }

  for (const { id, outcome, side } of scenario.outcomes) {
    if ((outcome === 'draw') !== (side === undefined) || (side !== undefined && !sides.has(side))) {
      throw fail(`The outcome ${JSON.stringify(id)} needs a side of the scenario, unless it is a draw with none.`);
    }
  }

  for (const trigger of scenario.triggers) {
    const name = JSON.stringify(trigger.id);

    if (!waitable(events, trigger.on)) {
      throw fail(`The trigger ${name} waits for ${JSON.stringify(trigger.on)} in vain.`);
    }

    if (firesItself(trigger)) throw fail(`The trigger ${name} fires itself again without end; give it a limit.`);
  }
}

/**
 * Tells whether the sides that see a part of a battle are sides of the scenario and, if `side` is given, include it.
 */
export function seenBySides(scenario: Scenario, visibleTo: VisibleTo, side?: SideId): boolean {
  if (visibleTo === 'all') return true;

  const known = visibleTo.every((one) => scenarioSide(scenario, one) !== undefined);

  return known && (side === undefined || visibleTo.includes(side));
}

/**
 * Checks the rule of the turn of a ruleset: the kinds of actions and the actions that count the cost of movement are
 * attributes of the content without repeats, the costs of a move are whole numbers from 0, the actions that count the
 * cost of movement are not among the other actions of a move, and a turn can end: the rule lists kinds of actions or
 * lets a command end the turn.
 *
 * @throws {ContentError} If it does not.
 */
export function checkRuleset(content: ContentRegistry, ruleset: Ruleset): void {
  const { actions, movement } = ruleset.turn;
  const fail = rulesetFailure(ruleset);
  const named = [...actions, ...movement === undefined ? [] : [movement.points, ...Object.keys(movement.actions)]];
  const unknown = named.find((name) => !Object.hasOwn(content.attributes, name));

  if (unknown !== undefined) throw fail(`The rule of the turn names ${JSON.stringify(unknown)}, not an attribute.`);

  if (new Set(actions).size !== actions.length) throw fail('The rule of the turn repeats a kind of action.');

  if (actions.length === 0 && !ruleset.turn.endTurn) {
    throw fail('The rule of the turn has no kinds of actions and no command to end the turn, so a turn never ends.');
  }

  if (movement === undefined) return;

  if (Object.hasOwn(movement.actions, movement.points)) {
    throw fail('The rule of movement counts the cost of a path with an action it also spends on every move.');
  }

  for (const [action, cost] of sortedEntries(movement.actions)) {
    if (!Number.isSafeInteger(cost) || cost < 0) {
      throw fail(`A move costs ${String(cost)} of ${JSON.stringify(action)}, not a whole number from 0.`);
    }
  }
}

/**
 * Checks where the units of a new battle stand and can be placed: every unit with a cell of the scenario fits there,
 * and the units of a side without one can all be placed in its deployment zone together, one after another, the
 * biggest creatures first, each in the first cell and direction of the field where it fits with all its cells.
 * `fieldOf` returns the field of a state.
 *
 * @throws {ContentError} If a unit does not fit where it stands or the units of a side cannot be placed.
 */
export function checkPlacement(
  content: ContentRegistry,
  fieldOf: (state: BattleState) => FieldGeometry,
  state: BattleState,
  scenario: Scenario,
): void {
  const fail = failure(scenario);
  const field = fieldOf(state);
  const placed = state.units.filter(({ cell }) => cell !== undefined);

  for (const { cell = '', facing, id } of placed) {
    if (field.cellsAt(id, cell, facing) === undefined || !field.canStand(id, cell, facing)) {
      throw fail(`The unit ${JSON.stringify(id)} does not fit where it stands.`);
    }
  }

  let current = state;

  for (const unit of placingOrder(content, state)) {
    const zone = new Set(scenarioSide(scenario, unit.side)?.deploymentZone);
    const now = fieldOf(current);
    const facings = now.directions.length === 0 ? [undefined] : now.directions;
    const spot = [...zone].flatMap((cell) => facings.map((facing) => ({ cell, facing })))
      .find(({ cell, facing }) => now.hasCell(cell) && fitsZone(now, unit.id, cell, facing, zone));

    if (spot === undefined) {
      throw fail(`The units of the side ${JSON.stringify(unit.side)} do not all fit in its deployment zone.`);
    }

    const { cell, facing } = spot;

    current = {
      ...current,
      units: current.units.map((one) => (one.id === unit.id ? placedAt(one, cell, facing) : one)),
    };
  }
}

const NEVER_FIRE: readonly string[] = [...RUNNER_EVENTS, KERNEL_EVENTS.battleEnded, KERNEL_EVENTS.unitPlaced];

function placingOrder(content: ContentRegistry, state: BattleState): readonly Unit[] {
  return state.units
    .filter(({ cell }) => cell === undefined)
    .map((unit, index) => ({ index, size: creatureDefinition(content, unit.creature).size, unit }))
    .sort((left, right) => right.size - left.size || left.index - right.index)
    .map(({ unit }) => unit);
}

function firesItself({ condition, limit, on, ops }: ScenarioTrigger): boolean {
  if (limit !== undefined || condition !== undefined) return false;

  if (on === KERNEL_EVENTS.triggerFired) return true;

  return on === KERNEL_EVENTS.variableSet && ops.some(({ type }) => type === KERNEL_OPERATIONS.setVariable);
}

function placedAt(unit: Unit, cell: string, facing: string | undefined): Unit {
  return { ...unit, cell, ...(facing === undefined ? {} : { facing }) };
}

function waitable(events: Registry<EventKind>, on: string): boolean {
  if (Object.values<string>(BATTLE_MOMENTS).includes(on)) return true;

  return events.get(on) !== undefined && !NEVER_FIRE.includes(on);
}

function unique(scenario: Scenario, what: string, ids: readonly string[]): void {
  const repeated = ids.find((id, index) => ids.indexOf(id) !== index);

  if (repeated === undefined) return;

  throw failure(scenario)(`The scenario has two of the ${what} ${JSON.stringify(repeated)}.`);
}

function failure(scenario: Scenario): (message: string) => ContentError {
  return (message) => new ContentError(message, { definition: scenario.name });
}
