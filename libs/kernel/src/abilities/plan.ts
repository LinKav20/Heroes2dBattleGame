import { itemDefinition, type ContentRegistry } from '../content/index.ts';
import { createExpressions, type ExpressionSetup } from '../expressions/index.ts';
import type { CommandSteps, StepRejects } from '../extensions/index.ts';
import { createFieldGeometry } from '../geometry/index.ts';
import {
  copyTarget,
  findUnit,
  REJECTION_REASONS,
  turnRejection,
  unitItem,
  type BattleState,
  type UseAbilityCommand,
  type UseItemCommand,
  forbidden,
  type Forbidden,
} from '../model/index.ts';
import { abilityCheck } from './availability.ts';
import { abilityUseDraft } from './drafts.ts';
import type { AbilityRequest } from './params.ts';

/**
 * What the kernel does with a command to use an ability or an item: forbids it with a reason of the kernel, rejects it
 * with the reason a node of a formula or a condition gave, or runs the step that uses the ability.
 */
export type AbilityPlan = Forbidden | CommandSteps | StepRejects;

/**
 * What checking an ability needs besides the state: the content, the registries of nodes and topologies, and what the
 * kernel keeps.
 */
export type AbilitySetup = Omit<ExpressionSetup, 'field' | 'inputs' | 'state'>;

interface Requested {
  readonly kind: 'request';
  readonly request: AbilityRequest;
}

/**
 * Checks a command to use an ability of a unit or a side, or an ability of an item of a unit, and returns the step
 * that uses it. A command of a unit names no side; a command without a unit names the side whose ability it is. A
 * command to use an item names the ability if the item gives more than one. The command is checked as
 * {@link abilityCheck} describes.
 *
 * @throws {ContentError} If a definition is wrong, or the requirement or the filter of targets rolls dice.
 */
export function planAbility(
  setup: AbilitySetup,
  state: BattleState,
  command: UseAbilityCommand | UseItemCommand,
): AbilityPlan {
  const request = requestOf(setup.content, state, command);

  if (request.kind === 'forbidden') return request;

  return checkRequest(setup, state, request.request) ?? { kind: 'steps', steps: [abilityUseDraft(request.request)] };
}

/**
 * Checks whether a unit or a side can use an ability now, as {@link abilityCheck} describes, with expressions and the
 * field of the state.
 *
 * @throws {ContentError} If a definition is wrong, or the requirement or the filter of targets rolls dice.
 * @throws {TypeError} If the unit, the side or the item of the request is not in the battle.
 */
export function checkRequest(
  setup: AbilitySetup,
  state: BattleState,
  request: AbilityRequest,
): Forbidden | StepRejects | undefined {
  const field = createFieldGeometry(state, setup.content, setup.registries.topologies, setup.fields);
  const expressions = createExpressions({ ...setup, field, inputs: [], state });

  return abilityCheck(state, setup.content, expressions, field, request);
}

function requestOf(
  content: ContentRegistry,
  state: BattleState,
  command: UseAbilityCommand | UseItemCommand,
): Forbidden | Requested {
  const targets = command.targets.map(copyTarget);

  if (command.type === 'use-ability') {
    const { ability, side, unit } = command;

    if (unit !== undefined) {
      if (side !== undefined) return invalid('side');

      return hasUnit(state, unit) ? requested({ ability, targets, user: { kind: 'unit', unit } }) : invalid('unit');
    }

    if (side === undefined || !state.sides.some(({ id }) => id === side)) return invalid('side');

    return requested({ ability, targets, user: { kind: 'side', side } });
  }

  const { unit } = command;
  const found = findUnit(state, unit);
  const item = found === undefined ? undefined : unitItem(found, command.item);

  if (!hasUnit(state, unit)) return invalid('unit');

  if (item === undefined) return invalid('item');

  const definition = itemDefinition(content, item.item);
  const turn = command.ability === undefined && definition.abilities.length !== 1
    ? turnRejection(state, { kind: 'unit', unit })
    : undefined;

  if (turn !== undefined) return turn;

  const ability = command.ability ?? (definition.abilities.length === 1 ? definition.abilities[0] : undefined);

  if (ability === undefined) {
    return definition.abilities.length === 0
      ? forbidden(REJECTION_REASONS.noAbility, { item: item.id })
      : invalid('ability');
  }

  return requested({ ability, item: item.id, targets, user: { kind: 'unit', unit } });
}

function hasUnit(state: BattleState, unit: string): boolean {
  return state.units.some(({ id }) => id === unit);
}

function requested(request: AbilityRequest): Requested {
  return { kind: 'request', request };
}

function invalid(field: string): Forbidden {
  return forbidden(REJECTION_REASONS.invalidCommand, { field });
}
