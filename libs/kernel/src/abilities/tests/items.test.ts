import { describe, expect, it } from 'vitest';
import { ContentError, type ContentRegistry } from '../../content/index.ts';
import type { ExecuteResult } from '../../execution/index.ts';
import type { BattleState, InventoryItem, Target } from '../../model/index.ts';
import {
  ABILITY_CONTENT,
  execute,
  item,
  ITEMS,
  READY,
  reason,
  used,
  useItem,
  withArchers,
} from '../../tests/abilities.ts';
import { PIKEMEN, types } from '../../tests/battle.ts';
import { unitOf } from '../../tests/fixtures.ts';
import { afterUse } from '../index.ts';

describe('using an item', () => {
  it('spends a charge, and an item that using uses up leaves its stack with the last charge', () => {
    const first = used(withArchers(READY, { health: 2 }), useItem(4));
    const rested = withArchers(first.state, { spentActions: {} });
    const second = used(rested, useItem(4));

    expect(types(first)).toStrictEqual([
      'kernel:ability-used',
      'kernel:actions-changed',
      'kernel:item-changed',
      'kernel:health-changed',
    ]);

    expect(first.events[0]?.payload).toMatchObject({ item: 4, targets: [] });
    expect(unitOf(first.state, 'archers-1').inventory).toStrictEqual([potion({ count: 1 })]);
    expect(unitOf(second.state, 'archers-1').inventory).toStrictEqual([]);
  });

  it('keeps an item that using does not use up with no charges, and then forbids it', () => {
    const wand = withArchers(READY, { inventory: [{ charges: 1, count: 1, id: 9, item: 'demo:wand' }] });
    const spent = used(wand, useItem(9));

    expect(unitOf(spent.state, 'archers-1').inventory).toStrictEqual([chargedWand(0)]);
    expect(spent.state.variables.shouted).toBe(true);
    expect(reason(tryItem(spent.state, 9))).toStrictEqual(['kernel:no-charges', { item: 9 }]);
  });

  it('gives the abilities of an item with a slot only while it is equipped', () => {
    const carried = withArchers(READY, { inventory: [{ count: 1, id: 9, item: 'demo:bow' }] });
    const equipped = withArchers(READY, { inventory: [{ count: 1, id: 9, item: 'demo:bow', slot: 'hands' }] });

    expect(reason(tryItem(carried, 9, [PIKEMEN])))
      .toStrictEqual(['kernel:no-ability', { ability: 'demo:volley', item: 9 }]);

    expect(unitOf(used(equipped, useItem(9, [PIKEMEN])).state, 'pikemen-1').health).toBe(9);
  });

  it('asks which ability to use only for an item with several', () => {
    const scrolls = withArchers(READY, { inventory: [{ count: 3, id: 9, item: 'demo:scroll' }, stone()] });
    const shouted = used(scrolls, useItem(9, [], 'demo:shout'));

    expect(reason(tryItem(scrolls, 9))).toStrictEqual(['kernel:invalid-command', { field: 'ability' }]);

    expect(reason(tryItem(scrolls, 9, [], 'demo:drink')))
      .toStrictEqual(['kernel:no-ability', { ability: 'demo:drink', item: 9 }]);

    expect(reason(tryItem(scrolls, 10))).toStrictEqual(['kernel:no-ability', { item: 10 }]);
    expect(reason(tryItem(scrolls, 11))).toStrictEqual(['kernel:invalid-command', { field: 'item' }]);
    expect(unitOf(shouted.state, 'archers-1').inventory[0]).toStrictEqual({ count: 2, id: 9, item: 'demo:scroll' });
  });

  it('rejects targets for an item whose ability has none', () => {
    const wand = withArchers(READY, { inventory: [{ charges: 2, count: 1, id: 9, item: 'demo:wand' }] });

    expect(reason(tryItem(wand, 9, [PIKEMEN])))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:shout', problem: 'count' }]);
  });

  it.each([
    { change: { stack: 0 }, problem: 'stack' },
    { change: { charges: 0 }, problem: 'charges' },
    { change: { charges: 2, stack: 2 }, problem: 'cannot stack' },
  ])('treats an item with $problem as an error of content', ({ change, problem }) => {
    const changed = { ...item('demo:wand', { abilities: ['demo:shout'] }), ...change };
    const content = { ...ABILITY_CONTENT, items: { ...ITEMS, 'demo:wand': changed } };
    const wand = withArchers(READY, { inventory: [{ count: 1, id: 9, item: 'demo:wand' }] });

    expect(() => tryItem(wand, 9, [], undefined, content)).toThrow(ContentError);
    expect(() => tryItem(wand, 9, [], undefined, content)).toThrow(problem);
  });
});

describe('afterUse', () => {
  const potionItem = ITEMS['demo:healing-potion'];
  const wandItem = ITEMS['demo:wand'];
  const stoneItem = ITEMS['demo:stone'];

  it.each<{ readonly name: string; readonly before: InventoryItem; readonly after: InventoryItem | undefined }>([
    { after: potion({ charges: 2, count: 1 }), before: potion(), name: 'starts the next item with all charges' },
    { after: undefined, before: potion({ count: 1 }), name: 'takes the last item' },
    { after: { ...potion(), charges: 1 }, before: potion({ charges: 2 }), name: 'spends a charge first' },
  ])('$name', ({ after, before }) => {
    if (potionItem === undefined) throw new Error('No potion');

    expect(afterUse({ ...potionItem, charges: 2 }, before)).toStrictEqual(after);
  });

  it('leaves an item without charges that using does not use up as it is', () => {
    if (wandItem === undefined || stoneItem === undefined) throw new Error('No items');

    const kept = stone();

    expect(afterUse(stoneItem, kept)).toBe(kept);
    expect(afterUse(wandItem, { count: 1, id: 9, item: 'demo:wand' })).toStrictEqual(chargedWand(1));
  });
});

function potion(extra: Partial<InventoryItem> = {}): InventoryItem {
  return { charges: 1, count: 2, id: 4, item: 'demo:healing-potion', ...extra };
}

function chargedWand(charges: number): InventoryItem {
  return { charges, count: 1, id: 9, item: 'demo:wand' };
}

function stone(): InventoryItem {
  return { count: 1, id: 10, item: 'demo:stone' };
}

function tryItem(
  state: BattleState,
  id: number,
  targets: readonly Target[] = [],
  ability?: string,
  content: ContentRegistry = ABILITY_CONTENT,
): ExecuteResult {
  return execute(state, useItem(id, targets, ability), content);
}
