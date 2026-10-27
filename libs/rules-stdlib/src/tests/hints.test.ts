import type { ContentRegistry, ExecuteResult, TurnHolder } from '@heroes2dgame/kernel';
import { describe, expect, it } from 'vitest';
import {
  answered,
  attack,
  CONTENT,
  contentWith,
  dice,
  endSide,
  endTurn,
  EXTERNAL,
  holderOf,
  KERNEL,
  order,
  play,
  played,
  RULESET,
  started,
  unitOf,
  wait,
  withUnits,
} from './world.ts';

describe('the forecast of a strike of stacks', () => {
  it('gives the strike and the strike back with the lowest and with the highest rolls', () => {
    const state = played(started(NEAR), NEAR, endTurn('griffins-1'));
    const { highest, lowest } = KERNEL.forecast(state, attack('pikemen-1', 'skeletons-1'), NEAR);

    expect([health(lowest), health(highest)]).toStrictEqual([
      { 'pikemen-1': [9, 9], 'skeletons-1': [11, 2] },
      { 'pikemen-1': [8, 9], 'skeletons-1': [7, 6] },
    ]);
  });

  it('gives the same strike on a projection that does not show a unit far away', () => {
    const state = played(started(HIDDEN_NEAR), HIDDEN_NEAR, endTurn('griffins-1'));
    const projection = KERNEL.project(state, HIDDEN_NEAR, ATTACKER);
    const full = KERNEL.forecast(state, attack('pikemen-1', 'skeletons-1'), HIDDEN_NEAR);
    const seen = KERNEL.forecast(projection, attack('pikemen-1', 'skeletons-1'), HIDDEN_NEAR);

    expect(projection.units.map(({ id }) => id)).not.toContain('griffins-1');
    expect([health(seen.lowest), health(seen.highest)]).toStrictEqual([health(full.lowest), health(full.highest)]);
  });

  it('gives two scenarios, not bounds: a weak strike and a strong strike back lose more than both', () => {
    const state = played(started(NEAR, { ruleset: EXTERNAL }), NEAR, endTurn('griffins-1'));
    const { highest, lowest } = KERNEL.forecast(state, attack('pikemen-1', 'skeletons-1'), NEAR);
    const mixed = answered(state, NEAR, attack('pikemen-1', 'skeletons-1'), dice(1, 10), dice(3, 10));

    expect([health(lowest), health(highest)]).toStrictEqual([
      { 'pikemen-1': [9, 9], 'skeletons-1': [11, 2] },
      { 'pikemen-1': [8, 9], 'skeletons-1': [7, 6] },
    ]);

    expect(unitOf(mixed.state, 'pikemen-1')).toMatchObject({ count: 7, health: 7 });
  });
});

describe('the queue of turns of the standard orders', () => {
  it.each([
    { content: CONTENT, name: 'speed' },
    { content: INITIATIVE, name: 'initiative' },
    { content: SIDES, name: 'sides' },
  ])('by $name names the holders in the order ending turns gives them', ({ content }) => {
    const state = started(content);

    expect(KERNEL.turnQueue(state, content, 9).map(holderName)).toStrictEqual(order(state, content, 9));
  });

  it('by speed goes on through a roll of morale between turns, and morale gives no more turn in it', () => {
    const state = played(started(BLESSED, { ruleset: EXTERNAL }), BLESSED, endTurn('griffins-1'));
    const asked = play(state, BLESSED, endTurn('pikemen-1')).state;
    const quiet = played(started(CALM, { ruleset: EXTERNAL }), CALM, endTurn('griffins-1'));
    const queue = KERNEL.turnQueue(state, BLESSED, 6).map(holderName);

    expect(asked.inputRequest).toMatchObject({ name: 'core:morale-roll', unit: 'pikemen-1' });
    expect(queue).toStrictEqual(order(quiet, CALM, 6));
    expect(KERNEL.turnQueue(asked, BLESSED, 5).map(holderName)).toStrictEqual(queue.slice(1));
  });

  it('by initiative goes on through the rolls of initiative at the start of the battle', () => {
    const asked = started(INITIATIVE, { ruleset: EXTERNAL });
    const queue = KERNEL.turnQueue(asked, INITIATIVE, 8).map(holderName);

    expect(asked.inputRequest).toMatchObject({ name: 'core:initiative' });
    expect(queue.length).toBe(8);
    expect(new Set(queue)).toStrictEqual(new Set(['archers-1', 'griffins-1', 'pikemen-1', 'skeletons-1']));
  });

  it('by speed names the side in the turn of a unit the projection hides, and the next units as in the battle', () => {
    const round = ['griffins-1', 'pikemen-1', 'skeletons-1', 'archers-1'].map(endTurn);
    const state = played(started(HIDDEN), HIDDEN, ...round);
    const projection = KERNEL.project(state, HIDDEN, ATTACKER);

    expect([state.round, holderOf(state)]).toStrictEqual([2, 'griffins-1']);

    expect(KERNEL.turnQueue(projection, HIDDEN, 4).map(holderName))
      .toStrictEqual(['defender', ...order(state, HIDDEN, 4).slice(1)]);
  });
});

describe('the available actions of stacks', () => {
  it('hold a strike at an enemy next to the unit and no shot for a unit without shots', () => {
    const state = played(started(NEAR), NEAR, endTurn('griffins-1'));
    const actions = KERNEL.availableActions(state, NEAR);

    expect(actions).toContainEqual(attack('pikemen-1', 'skeletons-1'));
    expect(actions.some(({ type }) => type === 'shoot')).toBe(false);
    expect(actions.every((command) => KERNEL.execute(state, command, NEAR).ok)).toBe(true);
  });

  it('hold every strike the kernel accepts after a move to any cell of the field', () => {
    const state = started();
    const actions = KERNEL.availableActions(state, CONTENT);
    const cells = KERNEL.field(state, CONTENT).cells;
    const strikes = ['archers-1', 'pikemen-1']
      .flatMap((target) => cells.map((from) => attack('griffins-1', target, from)))
      .filter((command) => KERNEL.execute(state, command, CONTENT).ok);

    expect(strikes.length).toBeGreaterThan(0);
    expect(actions).toStrictEqual(expect.arrayContaining(strikes));
  });

  it('hold shots for archers', () => {
    const state = played(started(), CONTENT, ...['griffins-1', 'pikemen-1', 'skeletons-1'].map(endTurn));
    const shots = KERNEL.availableActions(state, CONTENT).filter(({ type }) => type === 'shoot');

    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((command) => 'unit' in command && command.unit === 'archers-1')).toBe(true);
  });

  it('hold the commands of every unit of the side in a turn of the side, and the end of its turn', () => {
    const state = started(SIDES);
    const actions = KERNEL.availableActions(state, SIDES);
    const units = new Set(actions.flatMap((command) => ('unit' in command ? [command.unit] : [])));

    expect(units).toStrictEqual(new Set(['archers-1', 'pikemen-1']));
    expect(actions).toContainEqual(endSide('attacker'));
    expect(actions.every((command) => KERNEL.execute(state, command, SIDES).ok)).toBe(true);
  });

  it('hold waiting only before the unit acts', () => {
    const state = played(started(), CONTENT, endTurn('griffins-1'));
    const before = KERNEL.availableActions(state, CONTENT);
    const move = before.find(({ type }) => type === 'move');

    if (move === undefined) throw new Error('No move');

    const after = KERNEL.availableActions(played(state, CONTENT, move), CONTENT);

    expect(before).toContainEqual(wait('pikemen-1'));
    expect(after).not.toContainEqual(wait('pikemen-1'));
  });
});

const NEAR: ContentRegistry = contentWith(withUnits({ 'pikemen-1': { cell: '3,1' }, 'skeletons-1': { cell: '4,1' } }));

const HIDDEN: ContentRegistry = contentWith(withUnits({ 'griffins-1': { visibleTo: ['defender'] } }));

const HIDDEN_NEAR: ContentRegistry = contentWith(withUnits({
  'griffins-1': { visibleTo: ['defender'] },
  'pikemen-1': { cell: '3,1' },
  'skeletons-1': { cell: '4,1' },
}));

const BLESSED: ContentRegistry = contentWith(withUnits({ 'pikemen-1': { effects: ['demo:bless'] } }));

const CALM: ContentRegistry = contentWith(withUnits({ 'pikemen-1': { effects: ['demo:bless'] } }), {
  mechanics: Object.fromEntries(Object.entries(RULESET.mechanics).filter(([name]) => name !== 'rules-stdlib:morale')),
});

const ATTACKER = { kind: 'sides', sides: ['attacker'] } as const;

const INITIATIVE: ContentRegistry = contentWith({}, {
  mechanics: {
    ...RULESET.mechanics,
    'kernel:turn-order': {
      params: { bonus: 'core:speed', roll: 'core:initiative', sides: 20, tie: 'core:attack' },
      variant: 'rules-stdlib:initiative',
    },
  },
});

const SIDES: ContentRegistry = contentWith({}, {
  mechanics: { ...RULESET.mechanics, 'kernel:turn-order': { variant: 'rules-stdlib:sides' } },
  turnOwner: 'side',
});

function holderName(holder: TurnHolder): string {
  return holder.kind === 'unit' ? holder.unit : holder.side;
}

function health(result: ExecuteResult): unknown {
  if (!result.ok) return result.rejection;

  const units = result.state.units.filter(({ id }) => id === 'pikemen-1' || id === 'skeletons-1');

  return Object.fromEntries(units.map(({ count, health: topHealth, id }) => [id, [count, topHealth]]));
}
