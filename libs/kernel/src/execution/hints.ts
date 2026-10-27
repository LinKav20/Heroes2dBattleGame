import {
  actionsLeft,
  planContext,
  scenarioSide,
  type PlanContext,
} from '../battle/index.ts';
import {
  abilityDefinition,
  creatureDefinition,
  fixedUnits,
  itemDefinition,
  scenarioDefinition,
  type ContentRegistry,
  type TargetRule,
} from '../content/index.ts';
import { sideSees, type ContentName, type SideId } from '../ids/index.ts';
import {
  findSide,
  standsOnField,
  type BattleState,
  type GameCommand,
  type SideTarget,
  type Target,
  type Unit,
  type UnitTarget,
} from '../model/index.ts';
import { compareCodeUnits } from '../shared/index.ts';
import { commandSetup, type ExecutionCaches, type ExecutionRegistries } from './context.ts';
import { checkContent } from './execute.ts';
import { simulateUnmarked, unmarked } from './simulate.ts';

/**
 * Returns the game commands that the holder of the turn, or the side that deploys now, can give: not only the actions
 * of the turn, but the end of the turn, the retreat and the rest too. The kernel lists the candidates and keeps those
 * that run in a simulation with the lowest rolls. The candidates are, for every unit that acts: placing it in every
 * cell of the deployment zone of its side during deployment; a move to every cell it reaches; an attack at every other
 * unit its side sees, from where it stands and from every cell it reaches; a shot at such a unit; every ability and
 * item with no targets or one target of its kind. Then come every ability of the side whose turn it is, in a turn of
 * the side or of one of its units, with no targets or one target; the end of the turn, the end of deployment or the
 * start of the battle; and the retreat and the surrender of the side. A unit as a target is one the side of the user
 * sees. Where the ruleset gives turns to units, a turn of a side without a unit is the turn of a unit the projection
 * does not show: no unit acts in it and its end is not listed, but the abilities of the side are. Commands with a
 * direction, with more than one target and commands of packages are not listed: the kernel cannot go through every
 * payload of a command of a package.
 *
 * On a full state a listed command passes every check of the command; only its steps can still forbid it, for example
 * when a roll differs from the lowest one. On a projection the simulation sees only what the sides see, so the arbiter
 * may still forbid a listed command.
 *
 * Every candidate runs in a simulation, so the cost grows with the cells a unit reaches times the units its side sees,
 * and with the abilities that target a cell or an area times the cells of the field.
 *
 * @throws {ContentError} If the content describes a definition, a node or a value wrongly.
 * @throws {TypeError} If the content is not the content of the battle, or an extension breaks the contract of the
 * kernel, as `execute` throws.
 */
export function availableActions(
  registries: ExecutionRegistries,
  caches: ExecutionCaches,
  state: BattleState,
  content: ContentRegistry,
): readonly GameCommand[] {
  checkContent(state, content);

  if (state.inputRequest !== undefined || state.phase.kind === 'ended') return [];

  const bare = unmarked(state);
  const simulation = { ...caches, content, registries, rolls: 'lowest' as const };

  return candidates(planContext(commandSetup(registries, caches, content), bare))
    .filter((command) => simulateUnmarked(simulation, bare, command).ok);
}

/**
 * Returns the values of every attribute of the content for a unit or a side, as the rules see them now, with the
 * modifiers of every effect that acts; an attribute whose formula rejects is left out. The user interface shows them,
 * for example in the card of a unit.
 *
 * @throws {TypeError} If the content is not the content of the battle, or the unit or the side is not in it.
 * @throws {ContentError} If a formula of a modifier rolls dice or is described wrongly.
 */
export function attributeValues(
  registries: ExecutionRegistries,
  caches: ExecutionCaches,
  state: BattleState,
  content: ContentRegistry,
  of: SideTarget | UnitTarget,
): Readonly<Record<ContentName, number>> {
  checkContent(state, content);

  const { expressions } = planContext(commandSetup(registries, caches, content), state);
  const values = Object.keys(content.attributes).sort(compareCodeUnits).flatMap((name) => {
    const value = expressions.attribute(of, name);

    return value.kind === 'value' ? [[name, value.value] as const] : [];
  });

  return Object.fromEntries(values);
}

function candidates(context: PlanContext): readonly GameCommand[] {
  const { state } = context;
  const { phase } = state;

  if (phase.kind === 'deployment') return deploymentCandidates(context, phase.pending[0]);

  if (phase.kind !== 'turn') return [];

  const { side, unit } = phase;
  const hiddenUnit = unit === undefined && state.ruleset.turnOwner === 'unit';
  const actors = hiddenUnit
    ? []
    : state.units.filter((one) => standsOnField(one) && (unit === undefined ? one.side === side : one.id === unit));
  const end: GameCommand = unit === undefined
    ? { kind: 'game', side, type: 'end-turn' }
    : { kind: 'game', type: 'end-turn', unit };

  return [
    ...actors.flatMap((one) => unitCandidates(context, one)),
    ...sideAbilityCandidates(context, side),
    ...(hiddenUnit ? [] : [end]),
    ...giveUpCandidates(side),
  ];
}

function deploymentCandidates(context: PlanContext, side: SideId | undefined): readonly GameCommand[] {
  const { content, field, state } = context;

  if (side === undefined) return [{ kind: 'game', type: 'start-battle' }];

  const scenario = scenarioDefinition(content, state.scenario);
  const fixed = fixedUnits(scenario);
  const zone = (scenarioSide(scenario, side)?.deploymentZone ?? []).filter((cell) => field.hasCell(cell));
  const placements = state.units
    .filter((unit) => unit.side === side && unit.count > 0 && !fixed.has(unit.id))
    .flatMap(({ id }) => zone.map((cell): GameCommand => ({ cell, kind: 'game', type: 'place-unit', unit: id })));

  return [...placements, { kind: 'game', side, type: 'finish-deployment' }];
}

function unitCandidates(context: PlanContext, unit: Unit): readonly GameCommand[] {
  const { content, expressions, field, state } = context;
  const { movement } = state.ruleset.turn;
  const points = movement === undefined ? undefined : actionsLeft(expressions, unit, movement.points);
  const budget = points?.kind === 'value' ? points.value : 0;
  const cells = field.reachable(unit.id, budget).map(({ cell }) => cell).filter((cell) => cell !== unit.cell);
  const others = state.units
    .filter((other) => other.id !== unit.id && standsOnField(other) && sideSees(unit.side, other.visibleTo));
  const own = { kind: 'game', unit: unit.id } as const;

  return [
    ...cells.map((to): GameCommand => ({ ...own, to, type: 'move' })),
    ...others.flatMap((target) => [
      { ...own, target: target.id, type: 'attack' } as const,
      ...cells.map((from): GameCommand => ({ ...own, from, target: target.id, type: 'attack' })),
      { ...own, target: target.id, type: 'shoot' } as const,
    ]),
    ...creatureDefinition(content, unit.creature).abilities
      .flatMap((ability) => targetChoices(context, unit.side, ability)
        .map((targets): GameCommand => ({ ...own, ability, targets, type: 'use-ability' }))),
    ...unit.inventory.flatMap(({ id, item }) => itemDefinition(content, item).abilities
      .flatMap((ability) => targetChoices(context, unit.side, ability)
        .map((targets): GameCommand => ({ ...own, ability, item: id, targets, type: 'use-item' })))),
    { ...own, type: 'wait' },
    { ...own, type: 'defend' },
  ];
}

function sideAbilityCandidates(context: PlanContext, side: SideId): readonly GameCommand[] {
  const abilities = findSide(context.state, side)?.abilities ?? [];

  return abilities.flatMap((ability) => targetChoices(context, side, ability)
    .map((targets): GameCommand => ({ ability, kind: 'game', side, targets, type: 'use-ability' })));
}

function giveUpCandidates(side: SideId): readonly GameCommand[] {
  return [{ kind: 'game', side, type: 'retreat' }, { kind: 'game', side, type: 'surrender' }];
}

function targetChoices(context: PlanContext, side: SideId, ability: ContentName): ReadonlyArray<readonly Target[]> {
  const rule: TargetRule = abilityDefinition(context.content, ability).target;
  const { field, state } = context;

  if (rule.kind === 'unit') {
    return state.units
      .filter((unit) => standsOnField(unit) || (rule.dead === true && unit.cell !== undefined))
      .filter((unit) => sideSees(side, unit.visibleTo))
      .map(({ id }) => [{ kind: 'unit', unit: id }]);
  }

  if (rule.kind === 'side') return state.sides.map(({ id }) => [{ kind: 'side', side: id }]);

  if (rule.kind === 'cell' || rule.kind === 'area') return field.cells.map((cell) => [{ cell, kind: 'cell' }]);

  return [[]];
}
