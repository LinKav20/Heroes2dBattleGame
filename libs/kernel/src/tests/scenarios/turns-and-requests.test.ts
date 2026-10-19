import { describe, expect, it } from 'vitest';
import type { BattleState } from '../../index.ts';
import {
  act,
  acted,
  answerRoll,
  at,
  begin,
  cell,
  endTurn,
  eventsOf,
  finish,
  holderOfTurn,
  move,
  outcomeOf,
  place,
  refusal,
  types,
  unitOf,
  use,
  wait,
} from './driver.ts';
import { arena, created, PASS, WORLD_KERNEL, worldWith } from './world.ts';

describe('turns in a battle', () => {
  it('bring back the units that waited, slowest first, with what they spent before waiting', () => {
    const cells = { 'archers-1': '0,1', 'ghosts-1': '6,0', 'golem-1': '6,2', 'knight-1': '1,2' };
    const { drive, state } = begin(arena(cells));
    const back = acted(state, [
      move('archers-1', '1,1'),
      wait('archers-1'),
      wait('ghosts-1'),
      endTurn('knight-1'),
      endTurn('golem-1'),
    ], drive);
    const far = act(back, move('archers-1', '4,1'), drive).state;
    const second = acted(far, [endTurn('archers-1'), endTurn('ghosts-1')], drive);

    expect(holderOfTurn(back)).toBe('archers-1');
    expect(unitOf(back, 'archers-1').spentActions).toStrictEqual({ 'core:move': 1 });
    expect(refusal(back, wait('archers-1'), drive)).toStrictEqual(['acme:waited-twice', {}]);
    expect(refusal(back, move('archers-1', '5,1'), drive)).toStrictEqual(['kernel:unreachable', { cell: '5,1' }]);
    expect(holderOfTurn(acted(far, [endTurn('archers-1')], drive))).toBe('ghosts-1');
    expect(second.round).toBe(2);
    expect(unitOf(second, 'archers-1').spentActions).toStrictEqual({});
    expect(second.variables.turns).toBe(6);
  });

  it('refuse commands of units that do not have the turn, of the dead and of nobody', () => {
    const { drive, state } = begin(
      arena({ 'archers-1': '0,1', 'ghosts-1': '4,0', 'golem-1': '6,2' }),
      { units: { 'ghosts-1': { count: 1, health: 1 } } },
    );
    const shot = act(state, use('archers-1', 'demo:shoot', at('ghosts-1')), drive).state;

    expect(unitOf(shot, 'ghosts-1').count).toBe(0);
    expect(holderOfTurn(shot)).toBe('golem-1');
    expect(refusal(shot, endTurn('archers-1'), drive)).toStrictEqual(['kernel:not-your-turn', {}]);
    expect(refusal(shot, move('ghosts-1', '6,1'), drive)).toStrictEqual(['kernel:unit-dead', { unit: 'ghosts-1' }]);

    expect(refusal(shot, use('golem-1', 'demo:strike', at('ghosts-1')), drive)).toStrictEqual([
      'kernel:invalid-targets',
      { ability: 'demo:strike', problem: 'dead', target: 0 },
    ]);

    expect(refusal(shot, use('golem-1', 'demo:shoot', at('archers-1')), drive)).toStrictEqual([
      'kernel:no-ability',
      { ability: 'demo:shoot' },
    ]);

    expect(refusal(shot, endTurn('nobody-1'), drive)).toStrictEqual(['kernel:invalid-command', { field: 'unit' }]);
  });

  it('pass the turn at once when a unit dies in its own turn by stepping into the fire', () => {
    const { drive, state } = begin(
      arena({ 'ghosts-1': '6,1', 'golem-1': '6,2', 'knight-1': '0,2' }),
      { units: { 'ghosts-1': { count: 1, health: 3 } } },
    );
    const burned = act(state, move('ghosts-1', '4,1'), drive);

    expect(unitOf(burned.state, 'ghosts-1').count).toBe(0);
    expect(holderOfTurn(burned.state)).toBe('knight-1');
    expect(burned.state.turns).toStrictEqual([{ holder: GHOSTS, skipped: false, waited: false }]);

    expect(eventsOf(burned.events, 'kernel:turn-ended')).toStrictEqual([
      { holder: GHOSTS, skipped: false, waited: false },
    ]);
  });

  it('let a side retreat or surrender in the turn of the other side, and refuse everything after that', () => {
    const { drive, state } = begin(arena({ 'archers-1': '0,1', 'golem-1': '6,2' }));
    const fled = act(state, { kind: 'game', side: 'defender', type: 'retreat' }, drive).state;
    const gave = act(state, { kind: 'game', side: 'attacker', type: 'surrender' }, drive).state;

    expect(holderOfTurn(state)).toBe('archers-1');
    expect(outcomeOf(fled)).toStrictEqual({ kind: 'retreat', side: 'defender', winners: ['attacker'] });
    expect(outcomeOf(gave)).toStrictEqual({ kind: 'surrender', side: 'attacker', winners: ['defender'] });

    expect(refusal(fled, { kind: 'game', side: 'attacker', type: 'retreat' }, drive)).toStrictEqual([
      'kernel:battle-over',
      {},
    ]);

    expect(refusal(fled, use('archers-1', 'demo:shoot', at('golem-1')), drive))
      .toStrictEqual(['kernel:battle-over', {}]);
  });
});

describe('rolls from outside', () => {
  it('ask for a roll for every target of a fireball in turn, and keep the triggers for the end of the action', () => {
    const external = { ruleset: { randomSources: { 'demo:damage': 'external' as const } } };
    const content = arena({ 'ghosts-1': '3,2', 'golem-1': '6,2', 'griffins-1': '3,3', 'mage-1': '1,2' });
    const { drive, state } = begin(content, external);
    const ready = act(state, endTurn('griffins-1'), drive).state;
    const asked = act(ready, use('mage-1', 'demo:fireball', cell('3,2')), drive);
    const saved = JSON.parse(JSON.stringify(asked.state)) as BattleState;
    const first = act(saved, answerRoll(1, 4), drive);
    const second = act(first.state, answerRoll(2, 1), drive);

    expect(types(asked.events)).toStrictEqual([
      'kernel:ability-used',
      'kernel:actions-changed',
      'kernel:resource-changed',
      'kernel:input-requested',
      'kernel:steps-saved',
    ]);

    expect(asked.state.inputRequest).toStrictEqual({
      count: 1,
      id: 1,
      kind: 'roll',
      name: 'demo:damage',
      side: 'attacker',
      sides: 6,
      unit: 'mage-1',
    });

    expect(asked.events.find(({ type }) => type === 'kernel:steps-saved')?.visibleTo).toStrictEqual([]);
    expect(refusal(asked.state, endTurn('mage-1'), drive)).toStrictEqual(['kernel:input-pending', {}]);
    expect(refusal(asked.state, answerRoll(1, 7), drive)).toStrictEqual(['kernel:invalid-answer', { request: 1 }]);
    expect(refusal(asked.state, answerRoll(1, 2, 3), drive)).toStrictEqual(['kernel:invalid-answer', { request: 1 }]);
    expect(refusal(asked.state, answerRoll(5, 2), drive)).toStrictEqual(['kernel:no-open-request', { request: 5 }]);
    expect(unitOf(first.state, 'ghosts-1')).toMatchObject({ count: 2, health: 6 });
    expect(first.state.inputRequest?.id).toBe(2);
    expect(first.state.variables['first-blood']).toBe(false);
    expect(unitOf(second.state, 'griffins-1')).toMatchObject({ count: 2, health: 17 });
    expect(second.state.inputRequest).toBeUndefined();
    expect(second.state.variables['first-blood']).toBe(true);
    expect(holderOfTurn(second.state)).toBe('ghosts-1');
  });
});

describe('deployment', () => {
  it('places big units only where all their cells fit the zone, and refuses the units of the other side', () => {
    const state = created();
    const placed = acted(state, [
      place('knight-1', '1,2'),
      place('archers-1', '0,1'),
      place('mage-1', '0,3'),
      finish('attacker'),
    ]);

    expect(refusal(state, place('ghosts-1', '7,0'))).toStrictEqual(['kernel:not-your-turn', {}]);

    expect(refusal(state, finish('attacker'))).toStrictEqual([
      'kernel:units-not-placed',
      { units: ['knight-1', 'archers-1', 'mage-1'] },
    ]);

    expect(refusal(placed, place('griffins-1', '6,3', 'west'))).toStrictEqual(['kernel:cannot-stand', { cell: '6,3' }]);
    expect(refusal(placed, place('griffins-1', '7,2', 'west'))).toStrictEqual(['kernel:cannot-stand', { cell: '7,2' }]);
    expect(refusal(placed, place('griffins-1', '7,0'))).toStrictEqual(['kernel:cannot-stand', { cell: '7,0' }]);
    expect(refusal(placed, place('golem-1', '7,3'))).toStrictEqual(['kernel:unit-fixed', { unit: 'golem-1' }]);

    expect(act(placed, place('griffins-1', '7,1', 'west')).state.units.find(({ id }) => id === 'griffins-1')?.cell)
      .toBe('7,1');
  });

  it('reveal at the start of the battle the units the sides placed, and only then let the fire burn them', () => {
    const zone = [...PASS.sides[0]?.deploymentZone ?? [], '4,1'];
    const sides = PASS.sides.map((side) => (side.id === 'attacker' ? { ...side, deploymentZone: zone } : side));
    const content = worldWith({ sides });
    const drive = { content, kernel: WORLD_KERNEL };
    const hidden = act(created(content), place('knight-1', '4,1'), drive);
    const deployed = acted(hidden.state, [
      place('archers-1', '0,1'),
      place('mage-1', '0,3'),
      finish('attacker'),
      place('ghosts-1', '7,0'),
    ], drive);
    const started = act(deployed, place('griffins-1', '6,4'), drive).state;
    const begun = act(started, finish('defender'), drive);

    expect(hidden.events.map(({ type, visibleTo }) => [type, visibleTo])).toStrictEqual([
      ['kernel:unit-placed', ['attacker']],
    ]);

    expect(unitOf(started, 'knight-1')).toMatchObject({ health: 30, zones: [] });

    expect(begun.events.filter(({ type }) => type === 'kernel:unit-placed').map(({ payload, visibleTo }) => [
      payload,
      visibleTo,
    ])).toStrictEqual([
      [{ cell: '4,1', unit: 'knight-1' }, 'all'],
      [{ cell: '0,1', unit: 'archers-1' }, 'all'],
      [{ cell: '0,3', unit: 'mage-1' }, 'all'],
      [{ cell: '7,0', unit: 'ghosts-1' }, 'all'],
      [{ cell: '6,4', unit: 'griffins-1' }, 'all'],
    ]);

    expect(unitOf(begun.state, 'knight-1').zones).toStrictEqual(['fire']);
    expect(holderOfTurn(begun.state)).toBe('griffins-1');
  });
});

const GHOSTS = { kind: 'unit', unit: 'ghosts-1' } as const;
