import { describe, expect, it } from 'vitest';
import { createRng, rngRange, type BattleState } from '../../index.ts';
import {
  act,
  acted,
  at,
  begin,
  cell,
  defend,
  effectsOf,
  endTurn,
  eventsOf,
  holderOfTurn,
  move,
  outcomeOf,
  refusal,
  types,
  unitOf,
  use,
  useItem,
  useOfSide,
  wait,
} from './driver.ts';
import { arena, SEED } from './world.ts';

describe('effects that meet in a battle', () => {
  it('enrage the golem on every hit up to three stacks, so it overtakes slower units in the order of turns', () => {
    const { drive, state } = begin(arena({ 'archers-1': '1,1', 'golem-1': '5,2', 'knight-1': '1,3' }));
    const holders: Array<string | undefined> = [];
    let current = state;

    for (let round = 1; round <= 4; round += 1) {
      holders.push(holderOfTurn(current));
      current = act(current, use('archers-1', 'demo:shoot', at('golem-1')), drive).state;
      holders.push(holderOfTurn(current));
      current = act(current, endTurn(holderOfTurn(current) ?? ''), drive).state;
      holders.push(holderOfTurn(current));
      current = act(current, endTurn(holderOfTurn(current) ?? ''), drive).state;
    }

    expect(holders).toStrictEqual([
      'archers-1', 'knight-1', 'golem-1',
      'archers-1', 'knight-1', 'golem-1',
      'archers-1', 'golem-1', 'knight-1',
      'archers-1', 'golem-1', 'knight-1',
    ]);

    expect(unitOf(current, 'golem-1')).toMatchObject({ count: 1, health: 24 });

    expect(unitOf(current, 'golem-1').effects.map(({ effect, stacks }) => [effect, stacks])).toStrictEqual([
      ['demo:rage', 3],
    ]);
  });

  it('keep the poison of a hex off an immune golem and still silence it', () => {
    const { drive, state } = begin(arena({ 'golem-1': '5,2', 'mage-1': '2,2' }));
    const hexed = act(state, use('mage-1', 'demo:hex', at('golem-1')), drive);

    expect(eventsOf(hexed.events, 'kernel:effect-not-applied')).toStrictEqual([
      { effect: 'demo:poison', holder: { kind: 'unit', unit: 'golem-1' }, reason: 'immune' },
    ]);

    expect(effectsOf(hexed.state, 'golem-1')).toStrictEqual(['demo:silence']);
    expect(holderOfTurn(hexed.state)).toBe('golem-1');
  });

  it('let a mage silence itself with a scroll, which forbids spells but not potions until the end of its turn', () => {
    const { drive, state } = begin(arena({ 'golem-1': '6,2', 'mage-1': '1,2' }));
    const silenced = act(state, useItem('mage-1', 2, at('mage-1')), drive);
    const quaffed = act(silenced.state, useItem('mage-1', 1), drive);
    const ended = act(quaffed.state, endTurn('mage-1'), drive);
    const again = act(ended.state, endTurn('golem-1'), drive).state;

    expect(types(silenced.events)).toContain('kernel:item-removed');
    expect(unitOf(silenced.state, 'mage-1').inventory.map(({ item }) => item)).toStrictEqual(['demo:potion']);

    expect(refusal(silenced.state, use('mage-1', 'demo:fireball', cell('6,2')), drive)).toStrictEqual([
      'kernel:ability-forbidden',
      { ability: 'demo:fireball', tag: 'Debuff.Silence' },
    ]);

    expect(unitOf(quaffed.state, 'mage-1').inventory)
      .toStrictEqual([{ charges: 1, count: 1, id: 1, item: 'demo:potion' }]);

    expect(eventsOf(ended.events, 'kernel:effect-removed'))
      .toMatchObject([{ holder: { kind: 'unit', unit: 'mage-1' } }]);

    expect(effectsOf(again, 'mage-1')).toStrictEqual([]);
    expect(act(again, use('mage-1', 'demo:fireball', cell('6,2')), drive).state.round).toBe(2);
  });

  it('heal two allies with one mend and wash every debuff off them, but never raise the dead or overheal', () => {
    const content = arena(
      { 'archers-1': '1,1', 'golem-1': '6,2', 'knight-1': '2,2', 'mage-1': '1,2' },
      { 'archers-1': { effects: ['demo:poison'] }, 'knight-1': { effects: ['demo:poison', 'demo:silence'] } },
    );
    const wounded = { units: { 'archers-1': { count: 3, health: 3 }, 'knight-1': { health: 20 } } };
    const { drive, state } = begin(content, wounded);
    const mended = act(state, use('mage-1', 'demo:mend', at('knight-1'), at('archers-1')), drive).state;
    const second = acted(mended, [endTurn('archers-1'), endTurn('knight-1'), endTurn('golem-1')], drive);
    const again = act(second, use('mage-1', 'demo:mend', at('knight-1'), at('archers-1')), drive).state;

    expect(effectsOf(state, 'knight-1')).toStrictEqual(['demo:poison', 'demo:silence']);
    expect(unitOf(mended, 'knight-1')).toMatchObject({ effects: [], health: 26 });
    expect(unitOf(mended, 'archers-1')).toMatchObject({ count: 3, effects: [], health: 9 });
    expect(unitOf(second, 'archers-1').health).toBe(9);
    expect(unitOf(again, 'knight-1').health).toBe(30);
    expect(unitOf(again, 'archers-1')).toMatchObject({ count: 3, health: 10 });
    expect(unitOf(again, 'mage-1').resources['demo:mana']).toBe(6);
  });

  it('cover the allies around a knight with the aura of its banner only while they stand next to it', () => {
    const { drive, state } = begin(arena({ 'archers-1': '3,2', 'ghosts-1': '4,2', 'knight-1': '1,2' }));
    const waited = acted(state, [endTurn('archers-1'), wait('ghosts-1')], drive);
    const covered = act(waited, move('knight-1', '2,2'), drive);
    const struck = acted(covered.state, [endTurn('knight-1'), use('ghosts-1', 'demo:strike', at('archers-1'))], drive);
    const away = act(acted(struck, [endTurn('archers-1'), endTurn('ghosts-1')], drive), move('knight-1', '0,2'), drive);

    expect(unitOf(waited, 'archers-1').auras).toStrictEqual([]);

    expect(eventsOf(covered.events, 'kernel:auras-changed')).toStrictEqual([
      { added: ['demo:inspired'], removed: [], unit: 'archers-1' },
    ]);

    expect(unitOf(struck, 'archers-1')).toMatchObject({ count: 5, health: 5 });

    expect(eventsOf(away.events, 'kernel:auras-changed')).toStrictEqual([
      { added: [], removed: ['demo:inspired'], unit: 'archers-1' },
    ]);
  });

  it('slow a griffin in the hidden mist, which only the defender sees, so the mage goes first next round', () => {
    const { drive, state } = begin(arena({ 'griffins-1': '6,0', 'knight-1': '0,1', 'mage-1': '0,3' }));
    const misted = act(state, move('griffins-1', '5,3'), drive);
    const next = acted(misted.state, [endTurn('griffins-1'), endTurn('mage-1'), endTurn('knight-1')], drive);

    expect(holderOfTurn(state)).toBe('griffins-1');

    expect(misted.events.filter(({ type }) => type === 'kernel:zones-changed').map(({ payload, visibleTo }) => [
      payload,
      visibleTo,
    ])).toStrictEqual([[{ added: ['mist'], removed: [], unit: 'griffins-1' }, ['defender']]]);

    expect(next.round).toBe(2);
    expect(holderOfTurn(next)).toBe('mage-1');
  });

  it('burn a unit that comes into the fire and stands in it at its turn, but not a flier over it', () => {
    const { drive, state } = begin(arena({ 'ghosts-1': '7,1', 'griffins-1': '6,0', 'knight-1': '0,2' }));
    const flown = act(state, move('griffins-1', '2,1'), drive);
    const burned = acted(flown.state, [endTurn('griffins-1'), move('ghosts-1', '4,1'), endTurn('ghosts-1')], drive);
    const next = acted(burned, [endTurn('knight-1'), endTurn('griffins-1')], drive);

    expect(unitOf(flown.state, 'griffins-1')).toMatchObject({ count: 2, health: 20 });
    expect(unitOf(burned, 'ghosts-1')).toMatchObject({ count: 3, health: 3, zones: ['fire'] });
    expect(holderOfTurn(next)).toBe('ghosts-1');
    expect(unitOf(next, 'ghosts-1')).toMatchObject({ count: 2, health: 6 });
  });

  it('burn a walker on its way through the fire, when the way through it is the cheapest', () => {
    const { drive, state } = begin(arena({ 'golem-1': '7,4', 'knight-1': '3,2' }));
    const walked = act(state, move('knight-1', '5,1'), drive);

    expect(eventsOf(walked.events, 'kernel:unit-moved')).toStrictEqual([
      { path: ['3,1', '4,1', '5,1'], unit: 'knight-1' },
    ]);

    expect(unitOf(walked.state, 'knight-1')).toMatchObject({ cell: '5,1', health: 27, zones: [] });
  });

  it('kill a poisoned unit at the start of its turn, skip the turn, and end the battle if it was the last', () => {
    const poisoned = { 'archers-1': { effects: ['demo:poison'] } };
    const weak = { units: { 'archers-1': { count: 1, health: 2 } } };
    const skipped = begin(arena({ 'archers-1': '1,1', 'golem-1': '6,2', 'knight-1': '1,3' }, poisoned), weak).state;
    const alone = begin(arena({ 'archers-1': '1,1', 'golem-1': '6,2' }, poisoned), weak).state;

    expect(holderOfTurn(skipped)).toBe('knight-1');
    expect(skipped.turns).toStrictEqual([{ holder: ARCHERS, skipped: true, waited: false }]);

    expect(unitOf(skipped, 'archers-1'))
      .toMatchObject({ count: 0, effects: [{ effect: 'demo:poison', remaining: 2 }] });

    expect(outcomeOf(alone)).toStrictEqual({
      condition: 'wiped-out',
      kind: 'victory',
      side: 'defender',
      winners: ['defender'],
    });
  });

  it('end the battle in the middle of a fireball that kills the last defenders, after it burned an ally too', () => {
    const content = arena({ 'ghosts-1': '3,2', 'griffins-1': '3,3', 'knight-1': '2,2', 'mage-1': '1,2' });
    const weak = { units: { 'ghosts-1': { count: 1, health: 3 }, 'griffins-1': { count: 1, health: 3 } } };
    const { drive, state } = begin(content, weak);
    const ready = act(state, endTurn('griffins-1'), drive).state;
    const burned = act(ready, use('mage-1', 'demo:fireball', cell('3,2')), drive);
    const [first = 0] = rolls(ready, 3);

    expect(outcomeOf(burned.state)).toStrictEqual({
      condition: 'rout',
      kind: 'victory',
      side: 'attacker',
      winners: ['attacker'],
    });

    expect(unitOf(burned.state, 'knight-1').health).toBe(30 - 2 - first);
    expect(eventsOf(burned.events, 'kernel:roll-made')).toHaveLength(3);
    expect(types(burned.events)).not.toContain('kernel:turn-ended');
    expect(refusal(burned.state, endTurn('knight-1'), drive)).toStrictEqual(['kernel:battle-over', {}]);
  });

  it('let a guarding knight take only the least damage until the start of its next turn', () => {
    const { drive, state } = begin(arena({ 'ghosts-1': '3,2', 'knight-1': '2,2' }));
    const guarded = acted(state, [endTurn('ghosts-1'), defend('knight-1')], drive);
    const struck = act(guarded, use('ghosts-1', 'demo:strike', at('knight-1')), drive).state;

    expect(effectsOf(guarded, 'knight-1')).toStrictEqual(['demo:guarding']);
    expect(holderOfTurn(guarded)).toBe('ghosts-1');
    expect(unitOf(struck, 'knight-1')).toMatchObject({ effects: [], health: 29 });
    expect(holderOfTurn(struck)).toBe('knight-1');
  });

  it('refresh the haste of a rallied unit when the side rallies it again in the next round', () => {
    const { drive, state } = begin(arena({ 'golem-1': '6,2', 'knight-1': '1,2' }));
    const rallied = acted(state, [useOfSide('attacker', 'demo:rally', at('knight-1')), endTurn('knight-1')], drive);
    const second = act(rallied, endTurn('golem-1'), drive).state;
    const again = act(second, useOfSide('attacker', 'demo:rally', at('knight-1')), drive);
    const third = acted(again.state, [endTurn('knight-1'), endTurn('golem-1')], drive);
    const fourth = acted(third, [endTurn('knight-1'), endTurn('golem-1')], drive);

    expect(remaining(second, 'knight-1')).toBe(1);
    expect(types(again.events)).toContain('kernel:effect-changed');
    expect(remaining(again.state, 'knight-1')).toBe(2);
    expect(remaining(third, 'knight-1')).toBe(1);
    expect(effectsOf(fourth, 'knight-1')).toStrictEqual([]);
  });
});

const ARCHERS = { kind: 'unit', unit: 'archers-1' } as const;

function remaining(state: BattleState, unit: string): number | undefined {
  return unitOf(state, unit).effects[0]?.remaining;
}

function rolls(state: BattleState, count: number): readonly number[] {
  let current = state.rng ?? createRng(SEED);

  return Array.from({ length: count }, () => {
    const drawn = rngRange(current, 1, 6);

    if (!drawn.ok) throw new Error('No roll');

    current = drawn.rng;

    return drawn.value;
  });
}
