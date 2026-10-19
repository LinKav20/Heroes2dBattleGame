import {
  abilityDefinition,
  creatureDefinition,
  itemDefinition,
  type Ability,
  type ContentRegistry,
} from '../content/index.ts';
import { hasTag } from '../expressions/index.ts';
import type { Expressions, FieldGeometry } from '../extensions/index.ts';
import type { ContentName, SideId } from '../ids/index.ts';
import {
  battleSide,
  battleUnit,
  isWorn,
  REJECTION_REASONS,
  unitItem,
  type AbilityUse,
  type BattleState,
  type SideHolder,
  type SideTarget,
  type Unit,
  type UnitHolder,
  type UnitTarget,
} from '../model/index.ts';
import { checkItem } from '../operations/index.ts';
import { forbidden, whenValue, type AbilityCheck, type AbilityForbidden } from './check-results.ts';
import { costCheck, usesCheck } from './cost-checks.ts';
import { checkAbility } from './definitions.ts';
import type { AbilityRequest } from './params.ts';
import { targetsCheck } from './target-checks.ts';

interface AbilityUser {
  readonly target: SideTarget | UnitTarget;
  readonly side: SideId;
  readonly unit?: Unit;
  readonly abilities: readonly ContentName[];
  readonly uses: readonly AbilityUse[];
}

/**
 * Checks whether a unit or a side can use an ability now, with the item and the targets of the request. The check has
 * no side effects and rolls no dice, so the command that uses an ability and the hints of the user interface give the
 * same answer.
 *
 * In order, the user must be alive and have the turn: a unit has it when the turn belongs to it or to its side as a
 * whole, a side when the turn belongs to the side or any of its units. The ability must be its own: of the creature of
 * the unit, of the side, or of the item, which must be worn and have charges left. The ability must not be cooling
 * down or used up for the turn, the round or the battle, the unit must have none of the tags that forbid it, and the
 * requirement must hold with the user as `self`. The unit must have enough actions of the turn and resources for the
 * cost. Last, the targets must fit the rule of the ability by their kind and number and pass its filter with the
 * user as `self` and the target as `target`: an ability without targets gets none, and one with targets gets from 1
 * to their number of different targets; a unit as a target must be alive, and a cell must be on the field. A unit and
 * a cell must be within the range of the ability from a cell of the user, if it has a range. The filter of an ability
 * that targets an area applies to the units in the area when the ability is used. Returns nothing if the ability can be
 * used.
 *
 * @throws {ContentError} If a definition is wrong, or the requirement or the filter rolls dice.
 * @throws {TypeError} If the unit, the side or the item of the request is not in the battle.
 */
export function abilityCheck(
  state: BattleState,
  content: ContentRegistry,
  expressions: Expressions,
  field: FieldGeometry,
  request: AbilityRequest,
): AbilityCheck | undefined {
  const user = userOf(state, content, request.user);
  const owned = turnCheck(state, user) ?? ownCheck(content, user, request);

  if (owned !== undefined) return owned;

  const ability = abilityDefinition(content, request.ability);
  const scoped = expressions.within({ rolls: false, subjects: { self: user.target } });

  checkAbility(ability, request.user);

  return usesCheck(ability, user.uses)
    ?? tagsCheck(ability, user, scoped)
    ?? requirementCheck(ability, scoped)
    ?? costCheck(content, ability, user.unit, scoped)
    ?? targetsCheck(state, field, ability, user, request.targets, scoped);
}

/**
 * Checks the first rule of an ability: the unit is alive and the unit or the side has the turn, as
 * {@link abilityCheck} describes.
 *
 * @throws {TypeError} If the unit or the side is not in the battle.
 */
export function turnRejection(
  state: BattleState,
  content: ContentRegistry,
  user: SideHolder | UnitHolder,
): AbilityForbidden | undefined {
  return turnCheck(state, userOf(state, content, user));
}

function userOf(state: BattleState, content: ContentRegistry, user: SideHolder | UnitHolder): AbilityUser {
  if (user.kind === 'unit') {
    const unit = battleUnit(state, user.unit);
    const { abilities } = creatureDefinition(content, unit.creature);

    return { abilities, side: unit.side, target: { kind: 'unit', unit: unit.id }, unit, uses: unit.abilityUses };
  }

  const side = battleSide(state, user.side);

  return { abilities: side.abilities, side: side.id, target: { kind: 'side', side: side.id }, uses: side.abilityUses };
}

function turnCheck(state: BattleState, user: AbilityUser): AbilityForbidden | undefined {
  const { unit } = user;

  if (unit?.count === 0) return forbidden(REJECTION_REASONS.unitDead, { unit: unit.id });

  const { phase } = state;

  if (phase.kind !== 'turn' || phase.side !== user.side) return forbidden(REJECTION_REASONS.notYourTurn);

  const own = unit === undefined || phase.unit === undefined || phase.unit === unit.id;

  return own ? undefined : forbidden(REJECTION_REASONS.notYourTurn);
}

function ownCheck(content: ContentRegistry, user: AbilityUser, request: AbilityRequest): AbilityCheck | undefined {
  const { ability } = request;

  if (request.item === undefined) {
    return user.abilities.includes(ability) ? undefined : forbidden(REJECTION_REASONS.noAbility, { ability });
  }

  const item = user.unit === undefined ? undefined : unitItem(user.unit, request.item);

  if (item === undefined) throw new TypeError(`The unit has no item ${String(request.item)}.`);

  const definition = itemDefinition(content, item.item);

  checkItem(definition);

  if (!isWorn(definition, item) || !definition.abilities.includes(ability)) {
    return forbidden(REJECTION_REASONS.noAbility, { ability, item: item.id });
  }

  return item.charges === 0 ? forbidden(REJECTION_REASONS.noCharges, { item: item.id }) : undefined;
}

function tagsCheck(ability: Ability, user: AbilityUser, expressions: Expressions): AbilityCheck | undefined {
  if (user.unit === undefined || ability.forbiddenBy.length === 0) return undefined;

  return whenValue(expressions.tags(user.unit.id), (tags) => {
    const tag = ability.forbiddenBy.find((pattern) => hasTag(tags, pattern));

    if (tag === undefined) return undefined;

    return forbidden(REJECTION_REASONS.abilityForbidden, { ability: ability.name, tag });
  });
}

function requirementCheck(ability: Ability, expressions: Expressions): AbilityCheck | undefined {
  if (ability.requires === undefined) return undefined;

  return whenValue(expressions.test(ability.requires), (holds) =>
    (holds ? undefined : forbidden(REJECTION_REASONS.requirementNotMet, { ability: ability.name })));
}
