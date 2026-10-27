import { fixedUnits, scenarioDefinition } from '../content/index.ts';
import { auraVisibility, zoneVisibility } from '../effects/index.ts';
import { requestAudience } from '../execution/index.ts';
import { canSee, type SidesVisibility, type UnitId, type Visibility } from '../ids/index.ts';
import type { JsonValue } from '../json/index.ts';
import {
  findSide,
  type AppliedEffect,
  type BattlePhase,
  type BattleState,
  type Field,
  type InputRequest,
  type TurnRecord,
  type Unit,
} from '../model/index.ts';
import type { DataView } from '../names/index.ts';
import { withoutKey } from '../shared/index.ts';
import type { Lens, ProjectionSetup, SidesSetup } from './setup.ts';

/**
 * Returns the projection of a full state for an actor: the state without the random number generator, with the
 * visibility of the actor. An actor with full visibility sees everything else. An actor who sees what some sides see
 * gets only what they see:
 * - only the units they see, and of these units only the effects, the auras and the zones they see;
 * - in every effect they see, no unit that applied it if they do not see that unit;
 * - during deployment, no cells and directions of the units that other sides place;
 * - of the sides and the field, only the effects and the hazard zones they see;
 * - no turns of units they do not see, and in the phase the side of such a unit without the unit;
 * - in place of an input request they do not see, a hidden request of its side, and in a request they see no unit
 *   they do not see;
 * - no saved steps and no counts of fired triggers;
 * - of the data of extensions, what the extensions project for them, and none of the data whose extension projects
 *   nothing.
 *
 * The sides of the visibility in the projection go in the order of the battle.
 *
 * @throws {TypeError} If the state is a projection already, or the visibility names a side twice or a side the battle
 * does not have.
 */
export function projectState(state: BattleState, setup: ProjectionSetup): BattleState {
  if (state.visibility !== undefined) throw new TypeError('The state is a projection already.');

  const visibility = checkedVisibility(state, setup.visibility);
  const full = { ...withoutKey(state, 'rng'), visibility };

  if (visibility.kind === 'full') return full;

  const sides = { ...setup, visibility };
  const lens = lensOf(state, sides, fixedOf(state, sides));
  const { view } = lens;
  const seen = state.units.filter((unit) => view.seesUnit(unit.id));

  return {
    ...full,
    extensions: projectedData(state, setup, view),
    field: projectedField(state.field, visibility, view),
    phase: projectedPhase(state.phase, view),
    sides: state.sides.map((side) => ({ ...side, effects: seenEffects(side.effects, visibility, view) })),
    steps: [],
    triggers: {},
    turns: state.turns.filter((record) => seesHolder(record, view)),
    units: seen.map((unit) => projectedUnit(unit, lens)),
    ...(state.inputRequest === undefined
      ? {}
      : { inputRequest: projectedRequest(state.inputRequest, visibility, view) }),
  };
}

/**
 * Returns the data of extensions as the projection for sides shows it.
 */
export function projectedData(
  state: BattleState,
  setup: ProjectionSetup,
  view: DataView,
): Readonly<Record<string, JsonValue>> {
  const projected = Object.entries(state.extensions).flatMap(([name, data]) => {
    const value = setup.data.get(name)?.project?.(data, view);

    return value === undefined ? [] : [[name, value] as const];
  });

  return Object.fromEntries(projected);
}

/**
 * Returns the visibility of an actor with the sides in the order of the battle, frozen.
 *
 * @throws {TypeError} If the visibility names a side twice or a side the battle does not have.
 */
export function checkedVisibility(state: BattleState, visibility: Visibility): Visibility {
  if (visibility.kind === 'full') return visibility;

  const { sides } = visibility;
  const repeated = sides.find((side, index) => sides.indexOf(side) !== index);
  const unknown = sides.find((side) => findSide(state, side) === undefined);

  if (repeated !== undefined) throw new TypeError(`The visibility names the side ${JSON.stringify(repeated)} twice.`);

  if (unknown !== undefined) throw new TypeError(`The battle has no side ${JSON.stringify(unknown)} to see as.`);

  const ordered = state.sides.map(({ id }) => id).filter((side) => sides.includes(side));

  return Object.freeze({ kind: 'sides', sides: Object.freeze(ordered) });
}

/**
 * Returns the units whose cells the scenario of a battle fixed, for the lenses of its states.
 */
export function fixedOf(state: BattleState, setup: ProjectionSetup): ReadonlySet<UnitId> {
  return fixedUnits(scenarioDefinition(setup.content, state.scenario));
}

/**
 * Returns a full state as an actor who sees what some sides see looks at it.
 */
export function lensOf(state: BattleState, setup: SidesSetup, fixed: ReadonlySet<UnitId>): Lens {
  const { visibility } = setup;
  const seen = new Set(state.units.filter((unit) => canSee(visibility, unit.visibleTo)).map(({ id }) => id));
  const hidden = new Set(state.units.filter((unit) => hidesCell(state, visibility, fixed, unit)).map(({ id }) => id));
  const view: DataView = Object.freeze({
    seesCell: (unit: UnitId) => seen.has(unit) && !hidden.has(unit),
    seesUnit: (unit: UnitId) => seen.has(unit),
    sides: visibility.sides,
  });

  return { fixed, setup, state, view };
}

/**
 * Returns an applied effect as an actor sees it who sees the effect: without the unit that applied it if the actor
 * does not see that unit.
 */
export function projectedEffect(effect: AppliedEffect, view: DataView): AppliedEffect {
  if (effect.sourceUnit === undefined || view.seesUnit(effect.sourceUnit)) return effect;

  return withoutKey(effect, 'sourceUnit');
}

/**
 * Returns a unit of the state of a lens as the actor sees it who sees the unit: only the effects, the auras and the
 * zones the actor sees, as the refresh of areas marks their events, effects without units the actor does not see, and
 * during deployment no cell and direction of a unit that another side places.
 */
export function projectedUnit(unit: Unit, lens: Lens): Unit {
  const { setup: { content, visibility }, state, view } = lens;
  const auras = unit.auras.filter((aura) => canSee(visibility, auraVisibility(content, state, unit, aura)));
  const zones = unit.zones.filter((zone) => canSee(visibility, zoneVisibility(state, unit, zone)));
  const shown = { ...unit, auras, effects: seenEffects(unit.effects, visibility, view), zones };

  return placesHidden(unit, lens) ? withoutKey(withoutKey(shown, 'cell'), 'facing') : shown;
}

/**
 * Tells whether the cell and the direction of a unit are hidden from the actor: during deployment, for a unit that a
 * side the actor does not see through places, unless the scenario fixed its cell.
 */
export function placesHidden(unit: Unit, lens: Lens): boolean {
  return hidesCell(lens.state, lens.setup.visibility, lens.fixed, unit);
}

/**
 * Returns an input request as the actor sees it: a hidden request of its side in place of one the actor does not see,
 * and no unit the actor does not see.
 */
export function projectedRequest(request: InputRequest, visibility: SidesVisibility, view: DataView): InputRequest {
  if (!canSee(visibility, requestAudience(request)) && request.side !== undefined) {
    return { id: request.id, kind: 'hidden', side: request.side };
  }

  return request.kind !== 'hidden' && request.unit !== undefined && !view.seesUnit(request.unit)
    ? withoutUnit(request)
    : request;
}

/**
 * Returns the phase as an actor sees it: the turn of a unit the actor does not see shows only the side.
 */
export function projectedPhase(phase: BattlePhase, view: DataView): BattlePhase {
  if (phase.kind !== 'turn' || phase.unit === undefined || view.seesUnit(phase.unit)) return phase;

  return { kind: 'turn', side: phase.side };
}

function hidesCell(state: BattleState, visibility: SidesVisibility, fixed: ReadonlySet<UnitId>, unit: Unit): boolean {
  return state.phase.kind === 'deployment' && !visibility.sides.includes(unit.side) && !fixed.has(unit.id);
}

function withoutUnit(request: InputRequest): InputRequest {
  const shown: unknown = Object.fromEntries(Object.entries(request).filter(([key]) => key !== 'unit'));

  return shown as InputRequest;
}

function seesHolder({ holder }: TurnRecord, view: DataView): boolean {
  return holder.kind !== 'unit' || view.seesUnit(holder.unit);
}

function projectedField(field: Field, visibility: SidesVisibility, view: DataView): Field {
  const hazards = field.hazards
    .filter((hazard) => canSee(visibility, hazard.visibleTo))
    .map((hazard) => ({ ...hazard, effects: seenEffects(hazard.effects, visibility, view) }));

  return { ...field, effects: seenEffects(field.effects, visibility, view), hazards };
}

function seenEffects(
  effects: readonly AppliedEffect[],
  visibility: SidesVisibility,
  view: DataView,
): readonly AppliedEffect[] {
  return effects
    .filter((effect) => canSee(visibility, effect.visibleTo))
    .map((effect) => projectedEffect(effect, view));
}
