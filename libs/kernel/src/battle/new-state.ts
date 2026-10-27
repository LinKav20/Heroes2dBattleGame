import {
  rulesetDefinition,
  scenarioDefinition,
  type ContentRegistry,
  type Ruleset,
  type Scenario,
} from '../content/index.ts';
import { applicationDraft } from '../effects/index.ts';
import { createExpressions } from '../expressions/index.ts';
import type { FieldGeometry, StepDraft } from '../extensions/index.ts';
import { createFieldGeometry } from '../geometry/index.ts';
import type { BattleState, SideHolder, StateFormatVersion, Unit, UnitHolder } from '../model/index.ts';
import { createRng } from '../rng/index.ts';
import { settledUnit, sideOf, stacksOf, startingUnit, unitBounds, unitOf, type UnitBounds } from './initial-units.ts';
import { checkMechanics } from './mechanics.ts';
import type { BattleOptions, RulesetChanges, StartingEffect, StateSetup } from './options.ts';
import { checkOptions, scenarioWithOptions } from './scenario-options.ts';
import { checkPlacement, checkRuleset, checkScenario } from './state-checks.ts';

/**
 * A new battle that `checkedState` creates: the scenario with the units and sides of the options and the checked
 * state.
 */
export interface CheckedBattle {
  /** The scenario of the battle with the units and sides of the options, as `scenarioWithOptions` tells. */
  readonly scenario: Scenario;
  /** The state before the effects of the scenario are applied. */
  readonly state: BattleState;
}

/**
 * Creates the checked state of a new battle before the effects of the scenario are applied, from the scenario with the
 * units and sides of the options: in deployment, where the sides that have units without a cell deploy them in the
 * order of the scenario, with every unit at the values it starts with by its attributes without effects, as
 * `startingUnit` tells. Items fill stacks of the size of the item, the first stack with the given charges and the
 * others full, with identifiers from 1.
 *
 * @throws {ContentError} If the content has no scenario, ruleset or definition the scenario or the options refer to,
 * the scenario or the ruleset is described wrongly, as `checkScenario`, `checkRuleset` and `checkMechanics` tell, or a
 * unit does not fit where it stands or the units of a side cannot be placed in its zone.
 * @throws {TypeError} If the options are wrong, as `checkOptions` tells, or no package declares the topology of the
 * field.
 */
export function checkedState(setup: StateSetup, options: BattleOptions): CheckedBattle {
  const { content, registries } = setup;
  const own = scenarioDefinition(content, options.scenario);
  const ruleset = rulesetDefinition(content, own.ruleset);

  checkScenario(content, registries.events, own);
  checkRuleset(content, ruleset);
  checkMechanics(registries.mechanics, ruleset);
  checkOptions(content, registries.mechanics, own, ruleset, options);

  if (registries.topologies.get(own.field.topology) === undefined) {
    throw new TypeError(`No package declares the topology ${JSON.stringify(own.field.topology)}.`);
  }

  const scenario = scenarioWithOptions(own, options);
  const state = bareState(content, scenario, withChanges(ruleset, options.ruleset), setup.format, options.seed);

  checkPlacement(content, (current) => fieldOf(setup, current), state, scenario);

  const bounds = boundsIn(setup, state);

  return { scenario, state: { ...state, units: state.units.map((unit) => startingUnit(content, unit, bounds(unit))) } };
}

/**
 * Returns the steps that apply the effects of the scenario of a battle to sides, hazard zones and units, and then the
 * effects of the options to sides and units, one effect each, in the order of the sides and the units of the battle.
 */
export function scenarioEffects(scenario: Scenario, options: BattleOptions): readonly StepDraft[] {
  const units = scenario.sides.flatMap((side) => side.units);

  return [
    ...scenario.sides.flatMap(({ effects, id }) =>
      effects.map((effect) => applicationDraft({ effect, holder: { kind: 'side', side: id } }))),
    ...scenario.field.hazards.flatMap(({ effects, id }) =>
      effects.map((effect) => applicationDraft({ effect, holder: { hazard: id, kind: 'hazard' } }))),
    ...units.flatMap(({ effects, id }) =>
      effects.map((effect) => applicationDraft({ effect, holder: { kind: 'unit', unit: id } }))),
    ...scenario.sides.flatMap(({ id }) =>
      startingDrafts(options.sides?.[id]?.effects, { kind: 'side', side: id })),
    ...units.flatMap(({ id }) => startingDrafts(options.units?.[id]?.effects, { kind: 'unit', unit: id })),
  ];
}

/**
 * Returns the state after the effects of the scenario with every unit at the values it starts the battle with: the
 * health and the resources move together with their bounds from `before`, the state before the effects, as
 * `settledUnit` tells, and then the changes of the options apply.
 *
 * @throws {ContentError} If an attribute cannot be calculated or a health of one creature is below 1.
 * @throws {TypeError} If the changes give a resource the creature does not have or a health out of its bounds.
 */
export function withStartingValues(
  setup: StateSetup,
  before: BattleState,
  state: BattleState,
  options: BattleOptions,
): BattleState {
  const earlier = boundsIn(setup, before);
  const later = boundsIn(setup, state);
  const units = state.units.map((unit) => {
    const was = before.units.find(({ id }) => id === unit.id) ?? unit;

    return settledUnit(setup.content, unit, earlier(was), later(unit), options.units?.[unit.id]);
  });

  return { ...state, units };
}

function startingDrafts(
  effects: readonly StartingEffect[] = [],
  holder: SideHolder | UnitHolder,
): readonly StepDraft[] {
  return effects.map(({ effect, params }) =>
    applicationDraft({ effect, holder, ...(params === undefined ? {} : { params }) }));
}

function boundsIn(setup: StateSetup, state: BattleState): (unit: Unit) => UnitBounds {
  const expressions = createExpressions({ ...setup, field: fieldOf(setup, state), inputs: [], state })
    .within({ rolls: false });

  return (unit) => unitBounds(setup.content, expressions, state.ruleset.healthAttribute, unit);
}

function fieldOf(setup: StateSetup, state: BattleState): FieldGeometry {
  return createFieldGeometry(state, setup.content, setup.registries.topologies, setup.fields);
}

function withChanges(ruleset: Ruleset, changes: RulesetChanges = {}): Ruleset {
  return {
    ...ruleset,
    mechanics: { ...ruleset.mechanics, ...changes.mechanics },
    randomSources: { ...ruleset.randomSources, ...changes.randomSources },
  };
}

function bareState(
  content: ContentRegistry,
  scenario: Scenario,
  ruleset: Ruleset,
  format: StateFormatVersion,
  seed: string | undefined,
): BattleState {
  let nextId = 1;
  const units = scenario.sides.flatMap((side) => side.units.map((unit) => {
    const inventory = unit.items.flatMap((item) => {
      const stacks = stacksOf(content, item, nextId);

      nextId += stacks.length;

      return stacks;
    });

    return unitOf(side.id, unit, inventory);
  }));
  const { field } = scenario;
  const pending = scenario.sides
    .filter(({ id }) => units.some((unit) => unit.side === id && unit.cell === undefined))
    .map(({ id }) => id);

  return {
    contentHash: content.contentHash,
    extensions: scenario.extensions,
    field: {
      effects: [],
      hazards: field.hazards.map(({ cells, id, visibleTo }) => ({ cells, effects: [], id, visibleTo })),
      obstacles: field.obstacles.map(({ cells, id, obstacle }) => ({ cells, id, obstacle })),
      params: field.params,
      topology: field.topology,
      ...(field.battlefield === undefined ? {} : { battlefield: field.battlefield }),
    },
    format,
    nextId,
    nextRequestId: 1,
    packs: content.packs,
    phase: { kind: 'deployment', pending },
    round: 0,
    ruleset,
    scenario: scenario.name,
    sides: scenario.sides.map(sideOf),
    steps: [],
    triggers: {},
    turns: [],
    units,
    variables: scenario.variables,
    ...(seed === undefined ? {} : { rng: createRng(seed) }),
  };
}
