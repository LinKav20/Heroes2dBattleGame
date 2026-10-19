import { describe, expect, it } from 'vitest';
import { ContentError, type Ability, type ContentRegistry } from '../../content/index.ts';
import type { AbilityUse, BattleState, Target, UseAbilityCommand, UseItemCommand } from '../../model/index.ts';
import {
  ABILITY_CONTENT,
  execute,
  FIRE_ARROW,
  RALLY,
  READY,
  reason,
  useAbility,
  used,
  useItem,
  withArchers,
} from '../../tests/abilities.ts';
import { AFTER_ROUND_5, ARCHERS, PIKEMEN, types } from '../../tests/battle.ts';
import { applied, effect, node, unitOf } from '../../tests/fixtures.ts';

describe('using an ability', () => {
  it('counts the use, pays the cost and runs the operations on the target', () => {
    const result = used(READY, useAbility('demo:fire-arrow', [PIKEMEN]));
    const archers = unitOf(result.state, 'archers-1');
    const use = { ability: 'demo:fire-arrow', battle: 1, cooldown: 2, round: 1, turn: 1 };

    expect(types(result)).toStrictEqual([
      'kernel:ability-used',
      'kernel:actions-changed',
      'kernel:resource-changed',
      'kernel:health-changed',
    ]);

    expect(result.events[0]?.payload).toStrictEqual({ holder: ARCHERS, targets: [PIKEMEN], use });
    expect(result.events[3]?.visibleTo).toStrictEqual(['defender']);
    expect(archers.abilityUses).toStrictEqual([use]);
    expect(archers.spentActions).toStrictEqual({ 'core:action': 1 });
    expect(archers.resources).toStrictEqual({ 'demo:mana': 0 });
    expect(unitOf(result.state, 'pikemen-1')).toMatchObject({ count: 19, health: 7 });
  });

  it('runs the operations once for every target, and with the user as the target of an ability for itself', () => {
    const volley = used(READY, useAbility('demo:volley', [PIKEMEN, ARCHERS]));
    const drunk = used(withArchers(READY, { health: 2 }), useItem(4));

    expect(unitOf(volley.state, 'pikemen-1').health).toBe(9);
    expect(unitOf(volley.state, 'archers-1').health).toBe(6);
    expect(unitOf(drunk.state, 'archers-1').health).toBe(7);
  });

  it('lets a side use its own ability in its turn or the turn of any of its units', () => {
    const defender = { kind: 'side', side: 'defender' } as const;
    const result = used(READY, useAbility('demo:rally', [defender], { side: 'attacker' }));
    const pikemenTurn = { ...READY, phase: { kind: 'turn', side: 'defender', unit: 'pikemen-1' } } as const;

    expect(result.state.variables.rallied).toBe(true);

    expect(result.state.sides[0]?.abilityUses).toStrictEqual([
      { ability: 'demo:rally', battle: 1, cooldown: 0, round: 1, turn: 1 },
    ]);

    expect(reason(execute(pikemenTurn, useAbility('demo:rally', [defender], { side: 'attacker' }))))
      .toStrictEqual(['kernel:not-your-turn', {}]);
  });

  it.each<{
    readonly name: string;
    readonly state?: BattleState;
    readonly command?: UseAbilityCommand | UseItemCommand;
    readonly content?: ContentRegistry;
    readonly rejection: readonly [string, object];
  }>([
    {
      name: 'a unit without the turn',
      rejection: ['kernel:not-your-turn', {}],
      state: { ...READY, phase: { kind: 'turn', side: 'defender', unit: 'pikemen-1' } },
    },
    {
      name: 'a unit between turns',
      rejection: ['kernel:wrong-phase', {}],
      state: { ...READY, phase: { kind: 'round-start' } },
    },
    {
      name: 'a dead unit',
      rejection: ['kernel:unit-dead', { unit: 'archers-1' }],
      state: withArchers(READY, { count: 0, health: 0 }),
    },
    {
      command: useAbility('demo:drink'),
      name: 'an ability the unit does not have',
      rejection: ['kernel:no-ability', { ability: 'demo:drink' }],
    },
    {
      command: useAbility('demo:fire-arrow', [PIKEMEN], { unit: 'ghosts-1' }),
      name: 'an unknown unit',
      rejection: ['kernel:invalid-command', { field: 'unit' }],
    },
    {
      command: useAbility('demo:fire-arrow', [PIKEMEN], { side: 'attacker', unit: 'archers-1' }),
      name: 'both a unit and a side',
      rejection: ['kernel:invalid-command', { field: 'side' }],
    },
    {
      command: useAbility('demo:rally', [], {}),
      name: 'neither a unit nor a side',
      rejection: ['kernel:invalid-command', { field: 'side' }],
    },
    {
      command: useAbility('demo:rally', [], { side: 'neutral' }),
      name: 'an unknown side',
      rejection: ['kernel:invalid-command', { field: 'side' }],
    },
    {
      name: 'an ability cooling down',
      rejection: ['kernel:ability-cooldown', { ability: 'demo:fire-arrow', turns: 1 }],
      state: withArchers(READY, { abilityUses: [use({ cooldown: 1 })] }),
    },
    {
      name: 'an ability used up for the battle',
      rejection: ['kernel:use-limit', { ability: 'demo:fire-arrow', per: 'battle' }],
      state: withArchers(READY, { abilityUses: [use({ battle: 2 })] }),
    },
    {
      content: withAbility({ ...FIRE_ARROW, limits: { perRound: 3, perTurn: 1 } }),
      name: 'an ability used up for the turn',
      rejection: ['kernel:use-limit', { ability: 'demo:fire-arrow', per: 'turn' }],
      state: withArchers(READY, { abilityUses: [use({ battle: 1, round: 1, turn: 1 })] }),
    },
    {
      content: silencing(),
      name: 'a unit with a tag that forbids the ability',
      rejection: ['kernel:ability-forbidden', { ability: 'demo:fire-arrow', tag: 'Debuff.Silence' }],
      state: withArchers(READY, { effects: [applied(9, 'demo:silence')] }),
    },
    {
      content: withAbility({ ...FIRE_ARROW, requires: AFTER_ROUND_5 }),
      name: 'a requirement that does not hold',
      rejection: ['kernel:requirement-not-met', { ability: 'demo:fire-arrow' }],
    },
    {
      name: 'actions of the turn already spent',
      rejection: ['kernel:not-enough-actions', { action: 'core:action' }],
      state: withArchers(READY, { spentActions: { 'core:action': 1 } }),
    },
    {
      name: 'too little of a resource',
      rejection: ['kernel:not-enough-resource', { resource: 'demo:mana' }],
      state: withArchers(READY, { resources: { 'demo:mana': 2 } }),
    },
    {
      content: withAbility({ ...FIRE_ARROW, limits: { perRound: 1 } }),
      name: 'an ability used up for the round',
      rejection: ['kernel:use-limit', { ability: 'demo:fire-arrow', per: 'round' }],
      state: withArchers(READY, { abilityUses: [use({ battle: 1, round: 1 })] }),
    },
    {
      name: 'a cooldown before a limit',
      rejection: ['kernel:ability-cooldown', { ability: 'demo:fire-arrow', turns: 1 }],
      state: withArchers(READY, { abilityUses: [use({ battle: 2, cooldown: 1 })] }),
    },
    {
      command: { ...useItem(4), unit: 'ghosts-1' },
      name: 'an item of an unknown unit',
      rejection: ['kernel:invalid-command', { field: 'unit' }],
    },
    {
      command: useItem(10),
      name: 'an item without abilities of a dead unit',
      rejection: ['kernel:unit-dead', { unit: 'archers-1' }],
      state: withArchers(READY, { count: 0, inventory: [{ count: 1, id: 10, item: 'demo:stone' }] }),
    },
  ])('is forbidden for $name', ({ command, content, rejection, state }) => {
    const result = execute(state ?? READY, command ?? useAbility('demo:fire-arrow', [PIKEMEN]), content);

    expect(reason(result)).toStrictEqual(rejection);
  });

  it.each<{
    readonly name: string;
    readonly ability: string;
    readonly targets: readonly Target[];
    readonly problem: object;
  }>([
    { ability: 'demo:fire-arrow', name: 'no target', problem: { problem: 'count' }, targets: [] },
    {
      ability: 'demo:fire-arrow',
      name: 'more targets than the ability takes',
      problem: { problem: 'count' },
      targets: [PIKEMEN, ARCHERS],
    },
    {
      ability: 'demo:volley',
      name: 'the same target twice',
      problem: { problem: 'duplicate', target: 1 },
      targets: [PIKEMEN, PIKEMEN],
    },
    {
      ability: 'demo:fire-arrow',
      name: 'a side instead of a unit',
      problem: { problem: 'kind', target: 0 },
      targets: [{ kind: 'side', side: 'defender' }],
    },
    {
      ability: 'demo:fire-arrow',
      name: 'a unit not in the battle',
      problem: { problem: 'kind', target: 0 },
      targets: [{ kind: 'unit', unit: 'ghosts-1' }],
    },
    {
      ability: 'demo:fire-arrow',
      name: 'a cell instead of a unit',
      problem: { problem: 'kind', target: 0 },
      targets: [{ cell: '2,2', kind: 'cell' }],
    },
    {
      ability: 'demo:hex',
      name: 'a target the filter does not pass',
      problem: { problem: 'filter', target: 0 },
      targets: [ARCHERS],
    },
  ])('rejects $name as targets', ({ ability: name, problem, targets }) => {
    expect(reason(execute(READY, useAbility(name, targets))))
      .toStrictEqual(['kernel:invalid-targets', { ability: name, ...problem }]);
  });

  it('accepts a target the filter passes', () => {
    expect(used(READY, useAbility('demo:hex', [PIKEMEN])).events).toHaveLength(1);
  });

  it('rejects a dead unit as a target and any target of an ability without targets', () => {
    const units = READY.units.map((unit) => (unit.id === 'pikemen-1' ? { ...unit, count: 0 } : unit));
    const dead = { ...READY, units };
    const rally = withAbility({ ...RALLY, target: { kind: 'none' } });

    expect(reason(execute(dead, useAbility('demo:fire-arrow', [PIKEMEN]))))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:fire-arrow', problem: 'dead', target: 0 }]);

    expect(reason(execute(READY, useAbility('demo:rally', [PIKEMEN], { side: 'attacker' }), rally)))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:rally', problem: 'count' }]);
  });

  it.each<{ readonly name: string; readonly change: Partial<Ability>; readonly problem: string }>([
    { change: { cost: { actions: { 'core:action': -1 }, resources: {} } }, name: 'a negative cost', problem: 'cost' },
    { change: { cooldown: 0.5 }, name: 'a fractional cooldown', problem: 'cooldown' },
    { change: { limits: { perTurn: 0 } }, name: 'a limit of 0', problem: 'limits' },
    { change: { target: { kind: 'unit', count: 0 } }, name: 'no targets to choose', problem: 'count' },
    { change: { target: { kind: 'none', range: 3 } }, name: 'a range without targets', problem: 'range' },
    {
      change: { target: { area: { shape: 'radius', size: 1 }, kind: 'unit' } },
      name: 'an area of a unit target',
      problem: 'area',
    },
  ])('treats $name as an error of content', ({ change, problem }) => {
    const content = withAbility({ ...FIRE_ARROW, ...change });

    expect(() => execute(READY, useAbility('demo:fire-arrow', [PIKEMEN]), content)).toThrow(ContentError);
    expect(() => execute(READY, useAbility('demo:fire-arrow', [PIKEMEN]), content)).toThrow(problem);
  });

  it('treats a cost of a side, dice in a requirement and an unknown ability of a creature as errors of content', () => {
    const paid = withAbility({ ...RALLY, cost: { actions: {}, resources: { 'demo:mana': 1 } } });
    const rolled = withAbility({
      ...FIRE_ARROW,
      requires: node('kernel:compare', { left: DICE, operator: '>', right: 1 }),
    });
    const { 'demo:hex': hex, ...withoutHex } = ABILITY_CONTENT.abilities;
    const missing = { ...ABILITY_CONTENT, abilities: withoutHex };

    expect(hex).toBeDefined();

    expect(() => execute(READY, useAbility('demo:rally', [DEFENDER], { side: 'attacker' }), paid))
      .toThrow('belongs to a side');

    expect(() => execute(READY, useAbility('demo:fire-arrow', [PIKEMEN]), rolled)).toThrow('dice cannot be rolled');
    expect(() => execute(READY, useAbility('demo:hex', [PIKEMEN]), missing)).toThrow(ContentError);
  });

  it('treats an area of several cells, a line of a side and a resource the creature lacks as errors of content', () => {
    const area = { shape: 'radius', size: 1 } as const;
    const twice = withAbility({ ...FIRE_ARROW, target: { area, count: 2, kind: 'area' } });
    const line = withAbility({ ...RALLY, target: { area: { shape: 'line', size: 3 }, kind: 'area' } });
    const gold = withAbility({ ...FIRE_ARROW, cost: { actions: {}, resources: { 'demo:gold': 1 } } });

    expect(() => execute(READY, useAbility('demo:fire-arrow', [{ cell: '1,5', kind: 'cell' }]), twice))
      .toThrow('takes one cell');

    expect(() => execute(READY, useAbility('demo:rally', [{ cell: '1,5', kind: 'cell' }], { side: 'attacker' }), line))
      .toThrow('start a line or a cone');

    expect(() => execute(READY, useAbility('demo:fire-arrow', [PIKEMEN]), gold)).toThrow('which the creature');
  });

  it('lets a side have a cost of zero, and a unit act in the turn of its side', () => {
    const free = withAbility({ ...RALLY, cost: { actions: { 'core:action': 0 }, resources: {} } });
    const sideTurn = { ...READY, phase: { kind: 'turn', side: 'attacker' } } as const;

    const rallied = used(READY, useAbility('demo:rally', [DEFENDER], { side: 'attacker' }), free);

    expect(rallied.state.variables.rallied).toBe(true);
    expect(used(sideTurn, useAbility('demo:fire-arrow', [PIKEMEN])).events).toHaveLength(4);
  });

  it('checks the cost of an ability of an item like the cost of any other ability', () => {
    const bonusSpent = withArchers(READY, { spentActions: { 'core:bonus-action': 1 } });

    expect(reason(execute(bonusSpent, useItem(4))))
      .toStrictEqual(['kernel:not-enough-actions', { action: 'core:bonus-action' }]);
  });
});

const DICE = node('kernel:dice', { count: 1, name: 'core:damage-roll', sides: 6 });

const DEFENDER = { kind: 'side', side: 'defender' } as const;

function use(extra: Partial<AbilityUse>): AbilityUse {
  return { ability: 'demo:fire-arrow', battle: 0, cooldown: 0, round: 0, turn: 0, ...extra };
}

function silencing(): ContentRegistry {
  const silence = effect('demo:silence', { grantsTags: ['Debuff.Silence'] });

  return { ...ABILITY_CONTENT, effects: { [silence.name]: silence } };
}

function withAbility(changed: Ability): ContentRegistry {
  return { ...ABILITY_CONTENT, abilities: { ...ABILITY_CONTENT.abilities, [changed.name]: changed } };
}
