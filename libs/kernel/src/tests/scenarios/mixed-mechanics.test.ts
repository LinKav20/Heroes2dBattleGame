import { describe, expect, it } from 'vitest';
import type { ContentRegistry, ExpressionNode, GameCommand, ScenarioSide, ScenarioUnit } from '../../index.ts';
import { act, acted, begin, cell, endTurn, outcomeOf, refusal, unitOf, use, wait } from './driver.ts';
import { node, PASS, SKIRMISH, WORLD, worldWith } from './world.ts';

describe('three sides in one battle', () => {
  it('give the victory to the third side when a fireball kills the last units of the other two', () => {
    const { drive, state } = begin(THREE, { units: { 'ghosts-1': { health: 3 }, 'mage-1': { health: 2 } } });
    const burned = act(state, use('mage-1', 'demo:fireball', cell('3,2')), drive).state;

    expect([unitOf(burned, 'mage-1').count, unitOf(burned, 'ghosts-1').count]).toStrictEqual([0, 0]);

    expect(outcomeOf(burned))
      .toStrictEqual({ condition: 'last-raiders', kind: 'victory', side: 'raiders', winners: ['raiders'] });
  });

  it('count the turns of all three and let one side give up to both others', () => {
    const { drive, state } = begin(THREE);
    const second = acted(state, [endTurn('mage-1'), endTurn('ghosts-1'), endTurn('raiders-1')], drive);
    const gave = act(second, { kind: 'game', side: 'defender', type: 'surrender' }, drive).state;

    expect(second.round).toBe(2);
    expect(second.variables.turns).toBe(3);
    expect(outcomeOf(gave)).toStrictEqual({ kind: 'surrender', side: 'defender', winners: ['attacker', 'raiders'] });
  });
});

describe('a unit that dies in the middle of an ability', () => {
  it('is skipped by the ability when a reaction to an earlier target killed it', () => {
    const { drive, state } = begin(BRITTLE);
    const ready = act(state, endTurn('griffins-1'), drive).state;
    const burned = act(ready, use('mage-1', 'demo:fireball', cell('3,2')), drive);

    expect(unitOf(burned.state, 'griffins-1').count).toBe(0);

    expect(burned.events.filter(({ type }) => type === 'kernel:health-changed').map(({ payload }) => payload))
      .toStrictEqual([
        { count: 1, health: 2, unit: 'mage-1' },
        { count: 0, health: 0, unit: 'griffins-1' },
        { count: 2, health: 4, unit: 'ghosts-1' },
      ]);
  });
});

describe('a side that gets another turn in the round', () => {
  it('gets its actions back but not its cooldowns, and may not wait in a turn of a side', () => {
    const { drive, state } = begin(TWICE);
    const cast = act(state, use('mage-1', 'demo:fireball', cell('5,2')), drive).state;
    const again = acted(cast, [endSide('attacker'), endSide('defender')], drive);
    const next = acted(again, [endSide('attacker')], drive);

    expect(refusal(state, wait('mage-1'), drive)).toStrictEqual(['kernel:not-available', {}]);
    expect(again.phase).toStrictEqual({ kind: 'turn', side: 'attacker' });
    expect(again.round).toBe(1);
    expect(unitOf(again, 'mage-1').spentActions).toStrictEqual({});

    expect(refusal(again, use('mage-1', 'demo:fireball', cell('5,2')), drive))
      .toStrictEqual(['kernel:ability-cooldown', { ability: 'demo:fireball', turns: 1 }]);

    expect(next.round).toBe(2);
    expect(act(next, use('mage-1', 'demo:fireball', cell('5,2')), drive).state.round).toBe(2);
  });
});

const RAIDERS: ScenarioSide = {
  abilities: [],
  deploymentZone: [],
  effects: [],
  id: 'raiders',
  units: [{
    cell: '7,4',
    count: 1,
    creature: 'demo:archer',
    effects: [],
    id: 'raiders-1',
    items: [],
    visibleTo: 'all',
  }],
};

const THREE: ContentRegistry = worldWith({
  outcomes: [
    lastOf('attacker', ['defender', 'raiders']),
    lastOf('defender', ['attacker', 'raiders']),
    lastOf('raiders', ['attacker', 'defender']),
  ],
  sides: [
    sideWith('attacker', { 'mage-1': { cell: '2,2' } }),
    sideWith('defender', { 'ghosts-1': { cell: '3,2', count: 1 } }),
    RAIDERS,
  ],
});

const BRITTLE: ContentRegistry = {
  ...worldWith({
    sides: [
      sideWith('attacker', { 'mage-1': { cell: '2,2' } }),
      sideWith('defender', {
        'ghosts-1': { cell: '3,2' },
        'golem-1': {},
        'griffins-1': { cell: '3,3', effects: ['demo:brittle'] },
      }),
    ],
  }),
  effects: {
    ...WORLD.effects,
    'demo:brittle': {
      ...(WORLD.effects['demo:fortified'] ?? fail()),
      modifiers: [],
      name: 'demo:brittle',
      triggers: [{
        condition: node('kernel:not', { condition: node('kernel:same', { left: 'self', right: 'target' }) }),
        on: 'kernel:health-changed',
        ops: [node('kernel:damage', { amount: 1000, to: 'self' })],
        priority: 0,
      }],
    },
  },
};

const TWICE: ContentRegistry = worldWith({
  sides: [
    sideWith('attacker', { 'archers-1': { cell: '0,1' }, 'knight-1': { cell: '0,0' }, 'mage-1': { cell: '0,2' } }),
    sideWith('defender', { 'golem-1': {} }),
  ],
}, { mechanics: { ...SKIRMISH.mechanics, 'kernel:turn-order': { variant: 'acme:sides-twice' } }, turnOwner: 'side' });

function endSide(side: string): GameCommand {
  return { kind: 'game', side, type: 'end-turn' };
}

function sideWith(id: string, units: Readonly<Record<string, Partial<ScenarioUnit>>>): ScenarioSide {
  const found = PASS.sides.find((one) => one.id === id) ?? fail();

  return {
    ...found,
    units: found.units.flatMap((one) => {
      const change = units[one.id];

      return change === undefined ? [] : [{ ...one, ...change }];
    }),
  };
}

function lastOf(winner: string, beaten: readonly string[]): {
  readonly condition: ExpressionNode;
  readonly id: string;
  readonly outcome: 'victory';
  readonly side: string;
} {
  const alive = beaten.map((one) => node('kernel:units-alive', { side: one }));

  return {
    condition: node('kernel:compare', { left: node('kernel:add', { values: alive }), operator: '=', right: 0 }),
    id: `last-${winner}`,
    outcome: 'victory',
    side: winner,
  };
}

function fail(): never {
  throw new Error('No such part of the world');
}
