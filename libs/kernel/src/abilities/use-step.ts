import { abilityDefinition, itemDefinition, type Ability, type ContentRegistry } from '../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../events/index.ts';
import type { EventDraft, StepContext, StepKind, StepResult } from '../extensions/index.ts';
import { VISIBLE_TO_ALL, type VisibleTo } from '../ids/index.ts';
import { battleSide, battleUnit, unitItem, type AbilityUse, type Unit } from '../model/index.ts';
import { KERNEL_STEPS } from '../names/index.ts';
import { itemChange } from '../operations/index.ts';
import { sortedEntries } from '../shared/index.ts';
import { abilityTargetsDraft } from './drafts.ts';
import { afterUse } from './items.ts';
import type { AbilityRequest } from './params.ts';

/**
 * A unit or a side uses an ability: `kernel:ability-used` counts the use and starts the cooldown, the unit spends the
 * actions of the turn and the resources of the cost, the item spends a charge or leaves its stack if using uses it
 * up, and `kernel:ability-targets` runs the operations of the ability for its targets. Only the kernel puts the step
 * on the stack, after the command has checked the ability, so the step checks nothing.
 *
 * @throws {ContentError} If the content has no such ability or item.
 * @throws {TypeError} If the unit, the side or the item is not in the battle.
 */
export const ABILITY_USE_STEP: StepKind<AbilityRequest> = Object.freeze({
  kind: 'step',
  migrations: [],
  name: KERNEL_STEPS.abilityUse,
  run: useAbility,
  version: 1,
});

function useAbility({ content, params, state }: StepContext<AbilityRequest>): StepResult {
  const ability = abilityDefinition(content, params.ability);
  const { item, targets, user } = params;
  const unit = user.kind === 'unit' ? battleUnit(state, user.unit) : undefined;
  const holder = user.kind === 'side' ? battleSide(state, user.side) : battleUnit(state, user.unit);
  const uses = holder.abilityUses;
  const visibleTo = unit?.visibleTo ?? VISIBLE_TO_ALL;
  const use = nextUse(ability, uses);
  const used = kernelEventDraft(KERNEL_EVENTS.abilityUsed, {
    holder: user,
    ...(item === undefined ? {} : { item }),
    targets,
    use,
  }, visibleTo);
  const events: readonly EventDraft[] = [
    used,
    ...(unit === undefined ? [] : costEvents(ability, unit, visibleTo)),
    ...(unit === undefined || item === undefined ? [] : itemEvents(content, unit, item)),
  ];

  return { events, kind: 'done', steps: [abilityTargetsDraft({ ability: ability.name, next: 0, targets, user })] };
}

function nextUse(ability: Ability, uses: readonly AbilityUse[]): AbilityUse {
  const use = uses.find((current) => current.ability === ability.name);

  return {
    ability: ability.name,
    battle: (use?.battle ?? 0) + 1,
    cooldown: ability.cooldown,
    round: (use?.round ?? 0) + 1,
    turn: (use?.turn ?? 0) + 1,
  };
}

function costEvents(ability: Ability, unit: Unit, visibleTo: VisibleTo): readonly EventDraft[] {
  const events: EventDraft[] = [];
  const actions = sortedEntries(ability.cost.actions).filter(([, cost]) => cost > 0);

  if (actions.length > 0) {
    const spent = { ...unit.spentActions };

    for (const [action, cost] of actions) {
      spent[action] = (spent[action] ?? 0) + cost;
    }

    events.push(kernelEventDraft(KERNEL_EVENTS.actionsChanged, { spent, unit: unit.id }, visibleTo));
  }

  for (const [resource, cost] of sortedEntries(ability.cost.resources)) {
    const current = unit.resources[resource] ?? 0;
    const value = Math.max(0, current - cost);

    if (value !== current) {
      events.push(kernelEventDraft(KERNEL_EVENTS.resourceChanged, { resource, unit: unit.id, value }, visibleTo));
    }
  }

  return events;
}

function itemEvents(content: ContentRegistry, unit: Unit, id: number): readonly EventDraft[] {
  const item = unitItem(unit, id);

  if (item === undefined) throw new TypeError(`The unit ${JSON.stringify(unit.id)} has no item ${String(id)}.`);

  return itemChange(unit, item, afterUse(itemDefinition(content, item.item), item));
}
