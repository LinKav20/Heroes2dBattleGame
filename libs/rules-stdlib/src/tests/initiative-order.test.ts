import { ContentError, type BattleState, type ContentRegistry } from '@heroes2dgame/kernel';
import { describe, expect, it } from 'vitest';
import type { InitiativeData } from '../index.ts';
import {
  answer,
  CONTENT,
  contentWith,
  endSide,
  endTurn,
  EXTERNAL,
  order,
  play,
  played,
  RULESET,
  SCENARIO,
  started,
  withUnits,
} from './world.ts';

describe('the order of turns by a roll of initiative', () => {
  it('rolls the initiative of every unit at the start and keeps the order', () => {
    const state = rolled(initiative({ tie: 'core:attack' }), [10, 3, 7, 5]);

    expect(state.extensions['rules-stdlib:initiative']).toStrictEqual({
      rolls: { 'archers-1': 7, 'griffins-1': 11, 'pikemen-1': 14, 'skeletons-1': 11 },
    });

    expect(order(state, initiative({ tie: 'core:attack' }), 5))
      .toStrictEqual(['pikemen-1', 'griffins-1', 'skeletons-1', 'archers-1', 'pikemen-1']);
  });

  it('lets the order of the scenario decide equal initiatives without the attribute of ties', () => {
    const content = initiative({});
    const state = rolled(content, [7, 3, 3, 5]);

    expect(order(state, content, 4)).toStrictEqual(['pikemen-1', 'griffins-1', 'archers-1', 'skeletons-1']);
  });

  it('lets a unit without a roll go after all the others and roll at the start of the next round', () => {
    const content = initiative({});
    const newcomer = withoutRoll(rolled(content, [7, 3, 3, 5]), 'griffins-1');
    const round = played(newcomer, content, ...['pikemen-1', 'archers-1', 'skeletons-1', 'griffins-1'].map(endTurn));

    expect(order(newcomer, content, 4)).toStrictEqual(['pikemen-1', 'archers-1', 'skeletons-1', 'griffins-1']);
    expect(round.inputRequest).toMatchObject({ name: 'core:initiative', unit: 'griffins-1' });
  });

  it('lets a unit without a roll go after units of a negative initiative', () => {
    const unlucky = { effects: ['demo:misfortune'] };
    const content = initiative({ bonus: 'core:luck' }, withUnits({
      'archers-1': unlucky,
      'griffins-1': unlucky,
      'pikemen-1': unlucky,
      'skeletons-1': unlucky,
    }));
    const newcomer = withoutRoll(rolled(content, [1, 2, 1, 1]), 'griffins-1');

    expect(newcomer.extensions['rules-stdlib:initiative']).toStrictEqual({
      rolls: { 'archers-1': -1, 'pikemen-1': -2, 'skeletons-1': -2 },
    });

    expect(order(newcomer, content, 4)).toStrictEqual(['archers-1', 'pikemen-1', 'skeletons-1', 'griffins-1']);
  });

  it('rolls for units named like the properties of objects', () => {
    const renamed: Readonly<Record<string, string>> = { 'archers-1': 'constructor', 'pikemen-1': 'toString' };
    const content = initiative({}, {
      sides: SCENARIO.sides.map((side) => ({
        ...side,
        units: side.units.map((unit) => ({ ...unit, id: renamed[unit.id] ?? unit.id })),
      })),
    });
    const state = rolled(content, [7, 3, 3, 5]);
    const newcomer = withoutRoll(state, 'constructor');

    expect(state.extensions['rules-stdlib:initiative'])
      .toStrictEqual({ rolls: { constructor: 7, 'griffins-1': 11, 'skeletons-1': 7, toString: 11 } });

    expect(order(newcomer, content, 4)).toStrictEqual(['toString', 'griffins-1', 'skeletons-1', 'constructor']);
  });

  it('shows the data to nobody but an actor with full visibility, and a roll to the sides that see the unit', () => {
    const content = initiative({}, withUnits({ 'archers-1': { visibleTo: ['attacker'] } }));
    let state = started(content, { ruleset: EXTERNAL });
    const data: unknown[] = [];
    const rolls: unknown[] = [];

    for (const value of [7, 3, 3, 5]) {
      const { events, state: next } = answer(state, content, value);
      const kept = events.filter(({ type }) => type === 'rules-stdlib:initiative-rolled');

      data.push(...kept.map(({ visibleTo }) => visibleTo));
      rolls.push(...events.filter(({ type }) => type === 'kernel:roll-made').map(({ visibleTo }) => visibleTo));
      state = next;
    }

    expect(data).toStrictEqual([[]]);
    expect(rolls).toStrictEqual(['all', ['attacker'], 'all', 'all']);
  });

  it('treats an initiative beyond the safe integers as an error of the content', () => {
    const archer = CONTENT.creatures['demo:archer'];

    if (archer === undefined) throw new Error('No archer');

    const huge = {
      ...initiative({}),
      creatures: {
        ...CONTENT.creatures,
        'demo:archer': { ...archer, attributes: { ...archer.attributes, 'core:speed': Number.MAX_SAFE_INTEGER } },
      },
    };

    expect(() => started(huge)).toThrow(ContentError);
  });
});

describe('the order of turns by sides', () => {
  it('gives the turns to the sides in the order of the scenario, round after round', () => {
    const content = sidesContent();
    const state = started(content);
    const next = played(state, content, endSide('attacker'));
    const round = played(next, content, endSide('defender'));

    expect([state.phase, next.phase, round.phase, round.round]).toStrictEqual([
      { kind: 'turn', side: 'attacker' },
      { kind: 'turn', side: 'defender' },
      { kind: 'turn', side: 'attacker' },
      2,
    ]);
  });

  it('gives no turn to a side without units on the field', () => {
    const raider = { cell: '4,2', count: 1, creature: 'demo:pikeman', effects: [], id: 'raiders-1', items: [] };
    const raiders = { abilities: [], deploymentZone: [], effects: [], id: 'raiders' };
    const content = sidesContent([{ ...raiders, units: [{ ...raider, visibleTo: 'all' }] }]);
    const state = started(content);
    const fallen: BattleState = {
      ...state,
      units: state.units.map((unit) => (unit.id === 'raiders-1' ? { ...unit, count: 0, health: 0 } : unit)),
    };
    const attacked = play(fallen, content, endSide('attacker'));
    const next = play(attacked.state, content, endSide('defender'));
    const events = [...attacked.events, ...next.events];

    expect(next.state.phase).toStrictEqual({ kind: 'turn', side: 'attacker' });
    expect(next.state.round).toBe(2);
    expect(events.filter(({ payload }) => JSON.stringify(payload).includes('"raiders"'))).toStrictEqual([]);
  });
});

function initiative(params: object, change: Partial<typeof SCENARIO> = {}): ContentRegistry {
  return contentWith(change, {
    mechanics: {
      ...RULESET.mechanics,
      'kernel:turn-order': {
        params: { bonus: 'core:speed', roll: 'core:initiative', sides: 20, ...params },
        variant: 'rules-stdlib:initiative',
      },
    },
  });
}

function rolled(content: ContentRegistry, values: readonly number[]): BattleState {
  return values.reduce(
    (state, value) => answer(state, content, value).state,
    started(content, { ruleset: EXTERNAL }),
  );
}

function sidesContent(extra: typeof SCENARIO.sides = []): ContentRegistry {
  return contentWith({ sides: [...SCENARIO.sides, ...extra] }, {
    mechanics: { ...RULESET.mechanics, 'kernel:turn-order': { variant: 'rules-stdlib:sides' } },
    turnOwner: 'side',
  });
}

function withoutRoll(state: BattleState, unit: string): BattleState {
  const { rolls } = state.extensions['rules-stdlib:initiative'] as InitiativeData;
  const kept = Object.fromEntries(Object.entries(rolls).filter(([id]) => id !== unit));

  return { ...state, extensions: { ...state.extensions, 'rules-stdlib:initiative': { rolls: kept } } };
}
