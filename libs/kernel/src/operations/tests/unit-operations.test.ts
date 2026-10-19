import { describe, expect, it } from 'vitest';
import { ContentError, type Op } from '../../content/index.ts';
import type { ExecuteAccepted } from '../../execution/index.ts';
import type { BattleState, InventoryItem, Unit } from '../../model/index.ts';
import { ABILITY_CONTENT, READY, withArchers } from '../../tests/abilities.ts';
import { ARCHERS, PIKEMEN, run, types } from '../../tests/battle.ts';
import { node, unitOf } from '../../tests/fixtures.ts';
import { damaged, healed, operationDrafts } from '../index.ts';

describe('kernel:damage and kernel:heal', () => {
  it('damage the creature that takes damage first and then the others', () => {
    const result = operate(READY, node('kernel:damage', { amount: 13, to: 'target' }));

    expect(result.events.map(({ payload, visibleTo }) => [payload, visibleTo])).toStrictEqual([
      [{ count: 19, health: 7, unit: 'pikemen-1' }, ['defender']],
    ]);
  });

  it('kill the whole unit, and do nothing for no damage or a unit with no creatures left', () => {
    const dead = operate(READY, node('kernel:damage', { amount: 1000, to: 'target' })).state;

    expect(unitOf(dead, 'pikemen-1')).toMatchObject({ count: 0, health: 0 });
    expect(operate(dead, node('kernel:damage', { amount: 5, to: 'target' })).events).toStrictEqual([]);
    expect(operate(dead, node('kernel:heal', { amount: 5, to: 'target' })).events).toStrictEqual([]);
    expect(operate(READY, node('kernel:damage', { amount: 0, to: 'target' })).events).toStrictEqual([]);
  });

  it('heal only the creature that takes damage first, up to the health of one creature', () => {
    const healed2 = operate(READY, node('kernel:heal', { amount: 2, to: 'self' })).state;
    const full = operate(READY, node('kernel:heal', { amount: 100, to: 'self' })).state;
    const above = withArchers(READY, { health: 12 });

    expect(unitOf(healed2, 'archers-1').health).toBe(9);
    expect(unitOf(full, 'archers-1')).toMatchObject({ count: 10, health: 10 });
    expect(operate(above, node('kernel:heal', { amount: 5, to: 'self' })).events).toStrictEqual([]);
  });

  it('roll nothing for a unit with no creatures left', () => {
    const dead = operate(READY, node('kernel:damage', { amount: 1000, to: 'target' })).state;
    const dice = node('kernel:dice', { count: 1, name: 'core:damage-roll', sides: 6 });

    expect(operate(dead, node('kernel:damage', { amount: dice, to: 'target' })).events).toStrictEqual([]);
  });

  it('treat a health attribute below 1 as an error of content', () => {
    const attributes = { ...ABILITY_CONTENT.attributes, 'core:health': { name: 'core:health' } };
    const fragile = { ...ABILITY_CONTENT, attributes };
    const pikeman = fragile.creatures['demo:pikeman'];

    if (pikeman === undefined) throw new Error('No pikeman');

    const broken = {
      ...fragile,
      creatures: {
        ...fragile.creatures,
        'demo:pikeman': { ...pikeman, attributes: { ...pikeman.attributes, 'core:health': 0 } },
      },
    };

    expect(() => run(READY, broken, ...operationDrafts([node('kernel:damage', { amount: 1, to: 'target' })], {
      subjects: { self: ARCHERS, target: PIKEMEN },
    }))).toThrow('to be at least 1');
  });

  it('need a unit as the participant', () => {
    const side = { kind: 'side', side: 'attacker' } as const;

    expect(() => run(READY, ABILITY_CONTENT, ...operationDrafts([node('kernel:damage', { amount: 1, to: 'self' })], {
      subjects: { self: side },
    }))).toThrow(ContentError);
  });
});

describe('damaged and healed', () => {
  it.each<{ readonly unit: Partial<Unit>; readonly amount: number; readonly after: readonly [number, number] }>([
    { after: [3, 2], amount: 3, unit: { count: 3, health: 5 } },
    { after: [2, 5], amount: 5, unit: { count: 3, health: 5 } },
    { after: [1, 7], amount: 1, unit: { count: 1, health: 8 } },
    { after: [2, 4], amount: 9, unit: { count: 3, health: 8 } },
    { after: [0, 0], amount: 30, unit: { count: 3, health: 5 } },
  ])('damage $amount to $unit leaves $after', ({ after, amount, unit }) => {
    const { count, health } = damaged({ ...unitOf(READY, 'archers-1'), ...unit }, 5, amount);

    expect([count, health]).toStrictEqual(after);
  });

  it('keeps big units exact', () => {
    const huge = { ...unitOf(READY, 'archers-1'), count: 2 ** 40, health: 2 ** 12 };

    expect(damaged(huge, 2 ** 12, 2 ** 12 + 1)).toStrictEqual({ count: 2 ** 40 - 1, health: 2 ** 12 - 1 });

    expect(healed({ ...huge, health: 1 }, 2 ** 12, Number.MAX_SAFE_INTEGER))
      .toStrictEqual({ count: 2 ** 40, health: 2 ** 12 });
  });
});

describe('kernel:change-resource', () => {
  it('keeps a resource between 0 and its limit', () => {
    const gained = operate(READY, node('kernel:change-resource', { amount: 10, resource: 'demo:mana', to: 'self' }));
    const lost = operate(READY, node('kernel:change-resource', { amount: -10, resource: 'demo:mana', to: 'self' }));
    const same = operate(READY, node('kernel:change-resource', { amount: 0, resource: 'demo:mana', to: 'self' }));

    expect(unitOf(gained.state, 'archers-1').resources).toStrictEqual({ 'demo:mana': 5 });
    expect(unitOf(lost.state, 'archers-1').resources).toStrictEqual({ 'demo:mana': 0 });
    expect(same.events).toStrictEqual([]);
  });

  it('keeps a resource above a bound that went down until it is spent', () => {
    const rich = withArchers(READY, { resources: { 'demo:mana': 8 } });
    const gained = operate(rich, node('kernel:change-resource', { amount: 1, resource: 'demo:mana', to: 'self' }));
    const spent = operate(rich, node('kernel:change-resource', { amount: -1, resource: 'demo:mana', to: 'self' }));

    expect(gained.events).toStrictEqual([]);
    expect(unitOf(spent.state, 'archers-1').resources).toStrictEqual({ 'demo:mana': 7 });
  });

  it('treats a resource that the creature does not have as an error of content', () => {
    expect(() => operate(READY, node('kernel:change-resource', { amount: 1, resource: 'demo:mana', to: 'target' })))
      .toThrow('which the creature demo:pikeman does not have');
  });
});

describe('kernel:add-item and kernel:remove-item', () => {
  it('fill the stacks that are not equipped, then add new stacks with all charges', () => {
    const belt = { charges: 1, count: 1, id: 5, item: 'demo:healing-potion', slot: 'belt' };
    const state = withArchers(READY, { inventory: [potion(4, 2), belt] });
    const result = operate(state, node('kernel:add-item', { count: 9, item: 'demo:healing-potion', to: 'self' }));

    expect(types(result)).toStrictEqual(['kernel:item-changed', 'kernel:item-added', 'kernel:item-added']);

    expect(unitOf(result.state, 'archers-1').inventory)
      .toStrictEqual([potion(4, 5), belt, potion(8, 5), potion(9, 1)]);

    expect(result.state.nextId).toBe(10);
  });

  it('take items from the last stacks first, as many as there are', () => {
    const state = withArchers(READY, { inventory: [potion(4, 2), potion(9, 3)] });
    const four = operate(state, node('kernel:remove-item', { count: 4, from: 'self', item: 'demo:healing-potion' }));
    const all = operate(state, node('kernel:remove-item', { count: 50, from: 'self', item: 'demo:healing-potion' }));
    const one = operate(state, node('kernel:remove-item', { from: 'self', item: 'demo:healing-potion' }));

    expect(unitOf(four.state, 'archers-1').inventory).toStrictEqual([potion(4, 1)]);
    expect(unitOf(all.state, 'archers-1').inventory).toStrictEqual([]);
    expect(unitOf(one.state, 'archers-1').inventory).toStrictEqual([potion(4, 2), potion(9, 2)]);
  });

  it('treat a count out of bounds and an unknown item as errors of content', () => {
    expect(() => operate(READY, node('kernel:add-item', { count: 0, item: 'demo:healing-potion', to: 'self' })))
      .toThrow('needs a whole number from 1 to 1000 in "count"');

    expect(() => operate(READY, node('kernel:add-item', { count: 1001, item: 'demo:healing-potion', to: 'self' })))
      .toThrow('needs a whole number from 1 to 1000 in "count"');

    const most = operate(READY, node('kernel:add-item', { count: 1000, item: 'demo:healing-potion', to: 'self' }));

    expect(unitOf(most.state, 'archers-1').inventory.reduce((sum, { count }) => sum + count, 0)).toBe(1002);

    expect(() => operate(READY, node('kernel:remove-item', { from: 'self', item: 'demo:nothing' })))
      .toThrow(ContentError);
  });
});

function operate(state: BattleState, op: Op): ExecuteAccepted {
  return run(state, ABILITY_CONTENT, ...operationDrafts([op], { subjects: { self: ARCHERS, target: PIKEMEN } }));
}

function potion(id: number, count: number): InventoryItem {
  return { charges: 1, count, id, item: 'demo:healing-potion' };
}
