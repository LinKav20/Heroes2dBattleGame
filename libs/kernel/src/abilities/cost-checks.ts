import { ContentError, creatureDefinition, type Ability, type ContentRegistry } from '../content/index.ts';
import type { Expressions } from '../extensions/index.ts';
import { REJECTION_REASONS, type AbilityUse, type Unit, forbidden } from '../model/index.ts';
import { sortedEntries } from '../shared/index.ts';
import { whenValue, type AbilityCheck } from './check-results.ts';

/**
 * Checks that an ability is not cooling down and is not used up for the turn, the round or the battle.
 */
export function usesCheck(ability: Ability, uses: readonly AbilityUse[]): AbilityCheck | undefined {
  const use = uses.find((current) => current.ability === ability.name);

  if (use === undefined) return undefined;

  if (use.cooldown > 0) {
    return forbidden(REJECTION_REASONS.abilityCooldown, { ability: ability.name, turns: use.cooldown });
  }

  const per = PERIODS.find((period) => {
    const limit = ability.limits[LIMITS[period]];

    return limit !== undefined && use[period] >= limit;
  });

  return per === undefined ? undefined : forbidden(REJECTION_REASONS.useLimit, { ability: ability.name, per });
}

/**
 * Checks that a unit has enough actions of the turn and resources for the cost of an ability. A side pays nothing.
 *
 * @throws {ContentError} If the ability costs a resource that the creature of the unit does not have.
 */
export function costCheck(
  content: ContentRegistry,
  ability: Ability,
  unit: Unit | undefined,
  expressions: Expressions,
): AbilityCheck | undefined {
  if (unit === undefined) return undefined;

  const target = { kind: 'unit', unit: unit.id } as const;

  for (const [action, cost] of sortedEntries(ability.cost.actions)) {
    if (cost === 0) continue;

    const spent = unit.spentActions[action] ?? 0;
    const result = whenValue(expressions.attribute(target, action), (available) =>
      (spent + cost > available ? forbidden(REJECTION_REASONS.notEnoughActions, { action }) : undefined));

    if (result !== undefined) return result;
  }

  const { resources } = creatureDefinition(content, unit.creature);

  for (const [resource, cost] of sortedEntries(ability.cost.resources)) {
    if (cost === 0) continue;

    if (resources[resource] === undefined) {
      throw new ContentError(
        `The ability ${JSON.stringify(ability.name)} costs ${JSON.stringify(resource)}, which the creature `
        + `${JSON.stringify(unit.creature)} does not have.`,
        { definition: ability.name },
      );
    }

    if ((unit.resources[resource] ?? 0) < cost) return forbidden(REJECTION_REASONS.notEnoughResource, { resource });
  }

  return undefined;
}

const PERIODS = ['turn', 'round', 'battle'] as const;

const LIMITS = { battle: 'perBattle', round: 'perRound', turn: 'perTurn' } as const;
