import type { Ability, ContentRegistry, Item } from '../content/index.ts';
import type { ExecuteAccepted, ExecuteResult } from '../execution/index.ts';
import type { BattleState, Target, Unit, UseAbilityCommand, UseItemCommand } from '../model/index.ts';
import { BARE_STATE, KERNEL, markOp } from './battle.ts';
import { accepted, CONTENT, node } from './fixtures.ts';

export const FIRE_ARROW: Ability = ability('demo:fire-arrow', {
  cooldown: 2,
  cost: { actions: { 'core:action': 1 }, resources: { 'demo:mana': 3 } },
  forbiddenBy: ['Debuff.Silence'],
  limits: { perBattle: 2 },
  ops: [node('kernel:damage', { amount: 13, to: 'target' })],
  target: { kind: 'unit' },
});

export const DRINK: Ability = ability('demo:drink', {
  cost: { actions: { 'core:bonus-action': 1 }, resources: {} },
  ops: [node('kernel:heal', { amount: 5, to: 'target' })],
  target: { kind: 'self' },
});

export const RALLY: Ability = ability('demo:rally', {
  ops: [node('kernel:set-variable', {
    condition: node('kernel:subject-is', { kind: 'side', of: 'target' }),
    variable: 'rallied',
  })],
  target: { kind: 'side' },
});

export const VOLLEY: Ability = ability('demo:volley', {
  ops: [node('kernel:damage', { amount: 1, to: 'target' })],
  target: { count: 2, kind: 'unit' },
});

export const HEX_SPELL: Ability = ability('demo:hex', {
  target: {
    filter: node('kernel:not', { condition: node('kernel:same', { left: 'self', right: 'target' }) }),
    kind: 'unit',
  },
});

export const SHOUT: Ability = ability('demo:shout', { ops: [markOp('shouted')] });

export const ITEMS: Readonly<Record<string, Item>> = {
  'demo:bow': item('demo:bow', { abilities: ['demo:volley'], slot: 'hands' }),
  'demo:healing-potion': CONTENT.items['demo:healing-potion'] ?? item('demo:healing-potion'),
  'demo:scroll': item('demo:scroll', { abilities: ['demo:shout', 'demo:volley'], consumedOnUse: true, stack: 3 }),
  'demo:stone': item('demo:stone'),
  'demo:wand': item('demo:wand', { abilities: ['demo:shout'], charges: 2 }),
};

export const ABILITY_CONTENT: ContentRegistry = (() => {
  const archer = CONTENT.creatures['demo:archer'];

  if (archer === undefined) throw new Error('No archer');

  const abilities = [FIRE_ARROW, DRINK, RALLY, VOLLEY, HEX_SPELL, SHOUT];

  return {
    ...CONTENT,
    abilities: Object.fromEntries(abilities.map((one) => [one.name, one])),
    attributes: {
      ...CONTENT.attributes,
      'core:action': { name: 'core:action' },
      'core:bonus-action': { name: 'core:bonus-action' },
    },
    creatures: {
      ...CONTENT.creatures,
      'demo:archer': {
        ...archer,
        abilities: ['demo:fire-arrow', 'demo:volley', 'demo:hex'],
        attributes: { ...archer.attributes, 'core:action': 1, 'core:bonus-action': 1 },
      },
    },
    items: ITEMS,
  };
})();

export const READY: BattleState = {
  ...BARE_STATE,
  sides: BARE_STATE.sides.map((side) => (side.id === 'attacker' ? { ...side, abilities: ['demo:rally'] } : side)),
  units: BARE_STATE.units.map((unit) => ({
    ...unit,
    abilityUses: [],
    ...(unit.id === 'pikemen-1' ? { visibleTo: ['attacker', 'defender'] } : {}),
  })),
};

export function ability(name: string, extra: Partial<Ability> = {}): Ability {
  return {
    cooldown: 0,
    cost: { actions: {}, resources: {} },
    forbiddenBy: [],
    limits: {},
    name,
    ops: [],
    tags: [],
    target: { kind: 'none' },
    ...extra,
  };
}

export function item(name: string, extra: Partial<Item> = {}): Item {
  return { abilities: [], consumedOnUse: false, effects: [], name, stack: 1, tags: [], ...extra };
}

export function useAbility(
  ability: string,
  targets: readonly Target[] = [],
  user: { readonly side?: string; readonly unit?: string } = { unit: 'archers-1' },
): UseAbilityCommand {
  return { ability, kind: 'game', targets, type: 'use-ability', ...user };
}

export function useItem(id: number, targets: readonly Target[] = [], ability?: string): UseItemCommand {
  return {
    item: id,
    kind: 'game',
    targets,
    type: 'use-item',
    unit: 'archers-1',
    ...(ability === undefined ? {} : { ability }),
  };
}

export function execute(
  state: BattleState,
  command: UseAbilityCommand | UseItemCommand,
  content: ContentRegistry = ABILITY_CONTENT,
): ExecuteResult {
  return KERNEL.execute(state, command, content);
}

export function used(
  state: BattleState,
  command: UseAbilityCommand | UseItemCommand,
  content: ContentRegistry = ABILITY_CONTENT,
): ExecuteAccepted {
  return accepted(execute(state, command, content));
}

export function reason(result: ExecuteResult): unknown {
  return result.ok ? undefined : [result.rejection.reason, result.rejection.params];
}

export function withArchers(state: BattleState, change: Partial<Unit>): BattleState {
  return { ...state, units: state.units.map((unit) => (unit.id === 'archers-1' ? { ...unit, ...change } : unit)) };
}
