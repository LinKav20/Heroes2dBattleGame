import { describe, expect, it } from 'vitest';
import type { CommandKind } from '../../extensions/index.ts';
import type { BattleState, GameCommand } from '../../model/index.ts';
import { asRecord, effect, node, unitOf } from '../../tests/fixtures.ts';
import {
  CONTENT,
  CREATED,
  KERNEL,
  kernelWith,
  mark,
  move,
  ORDER,
  place,
  play,
  PLACED,
  reason,
  RULESET,
  SCENARIO,
  withScenario,
} from './helpers.ts';

describe('deployment', () => {
  it('places a unit of the side that deploys in its zone, which only that side sees, and again if asked', () => {
    const placed = play(CREATED, place('archers-1', '0,1'));
    const again = play(placed.state, place('archers-1', '0,2'));

    expect(placed.events.map(({ payload, type, visibleTo }) => [type, payload, visibleTo])).toStrictEqual([
      ['kernel:unit-placed', { cell: '0,1', unit: 'archers-1' }, ['attacker']],
    ]);

    expect(unitOf(again.state, 'archers-1').cell).toBe('0,2');
    expect(again.state.phase).toStrictEqual({ kind: 'deployment', pending: ['attacker'] });
  });

  it('rejects a unit of another side or fixed by the scenario, a bad cell, and a dead or unknown unit', () => {
    const [attacker, defender] = SCENARIO.sides;

    if (attacker === undefined || defender === undefined) throw new Error('No sides');

    const archers = attacker.units[0];

    if (archers === undefined) throw new Error('No archers');

    const guarded = withScenario({
      sides: [{ ...attacker, units: [archers, { ...archers, cell: '0,0', id: 'archers-2', items: [] }] }, defender],
    });
    const rocky = withScenario({
      sides: SCENARIO.sides.map((side, index) => (index === 0 ? { ...side, deploymentZone: ['2,0', '0,0'] } : side)),
    });
    const blocked = KERNEL.createState({ scenario: 'demo:duel' }, rocky);
    const dead = { ...CREATED, units: CREATED.units.map((unit) => ({ ...unit, count: 0 })) };

    expect(reason(KERNEL.execute(CREATED, place('pikemen-1', '4,0'), CONTENT)))
      .toStrictEqual(['kernel:not-your-turn', {}]);

    expect(reason(KERNEL.execute(CREATED, place('archers-1', '1,1'), CONTENT)))
      .toStrictEqual(['kernel:cannot-stand', { cell: '1,1' }]);

    expect(reason(KERNEL.execute(blocked, place('archers-1', '2,0'), rocky)))
      .toStrictEqual(['kernel:cannot-stand', { cell: '2,0' }]);

    expect(reason(KERNEL.execute(CREATED, place('archers-1', '9,9'), CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'cell' }]);

    expect(reason(KERNEL.execute(CREATED, place('archers-1', '0,1', 'banana'), CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'facing' }]);

    const fixed = KERNEL.createState({ scenario: 'demo:duel' }, guarded);

    expect(reason(KERNEL.execute(fixed, place('archers-2', '0,2'), guarded)))
      .toStrictEqual(['kernel:unit-fixed', { unit: 'archers-2' }]);

    expect(reason(KERNEL.execute(dead, place('archers-1', '0,1'), CONTENT)))
      .toStrictEqual(['kernel:unit-dead', { unit: 'archers-1' }]);

    expect(reason(KERNEL.execute(CREATED, place('ghosts-1', '0,1'), CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'unit' }]);

    expect(reason(KERNEL.execute(PLACED, place('archers-1', '0,1'), CONTENT)))
      .toStrictEqual(['kernel:wrong-phase', {}]);
  });

  it('lets a side finish only with all its units placed, and the battle start only without deployment', () => {
    const finish = { kind: 'game', side: 'attacker', type: 'finish-deployment' } as const;
    const ready = withScenario({
      sides: SCENARIO.sides.map((side) => ({
        ...side,
        units: side.units.map((unit) => ({ ...unit, cell: unit.cell ?? '0,0' })),
      })),
    });
    const placedAll = KERNEL.createState({ scenario: 'demo:duel' }, ready);

    expect(reason(KERNEL.execute(CREATED, finish, CONTENT)))
      .toStrictEqual(['kernel:units-not-placed', { units: ['archers-1'] }]);

    expect(reason(KERNEL.execute(CREATED, { ...finish, side: 'defender' }, CONTENT)))
      .toStrictEqual(['kernel:not-your-turn', {}]);

    expect(reason(KERNEL.execute(CREATED, { ...finish, side: 'nobody' }, CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'side' }]);

    expect(reason(KERNEL.execute(CREATED, { kind: 'game', type: 'start-battle' }, CONTENT)))
      .toStrictEqual(['kernel:wrong-phase', {}]);

    expect(play(placedAll, { kind: 'game', type: 'start-battle' }, ready).state.round).toBe(1);
  });
});

describe('the quiet of deployment', () => {
  it('lets no effect react, no trigger fire and no outcome end the battle until it starts', () => {
    const watch = effect('demo:watch', {
      duration: { kind: 'battle' },
      triggers: [
        { on: 'kernel:phase-changed', ops: [setting('seen')], priority: 0 },
        { on: 'kernel:unit-placed', ops: [setting('placed')], priority: 0 },
      ],
    });
    const pikemen = SCENARIO.sides.map((side) => (side.id === 'defender'
      ? { ...side, units: side.units.map((unit) => ({ ...unit, effects: ['demo:watch'] })) }
      : side));
    const content = {
      ...withScenario({
        outcomes: [{ condition: ACTED, id: 'acted', outcome: 'draw' }],
        sides: pikemen,
        triggers: [{ id: 'phase', on: 'kernel:phase-changed', ops: [setting('phase')], priority: 0 }],
      }),
      effects: { ...CONTENT.effects, 'demo:watch': watch },
    };
    const kernel = kernelWith(ORDER, NOTE);
    const created = kernel.createState({ scenario: 'demo:duel' }, content);
    const noted = play(created, { kind: 'game', name: 'acme:note', payload: {}, type: 'extension' }, content, kernel);
    const placed = play(noted.state, place('archers-1', '0,1'), content, kernel);
    const started = play(placed.state, FINISH, content, kernel);
    const quiet = { ...SCENARIO, ...content.scenarios['demo:duel'], outcomes: [] };
    const open = { ...content, scenarios: { 'demo:duel': quiet } };

    expect(noted.events.map(({ type }) => type)).toStrictEqual(['kernel:variable-set']);
    expect(noted.state.phase.kind).toBe('deployment');
    expect(placed.state.variables).toStrictEqual({ acted: true, moved: false });
    expect(placed.state.triggers).toStrictEqual({});
    expect(asRecord(started.state.phase).outcome).toStrictEqual({ condition: 'acted', kind: 'draw', winners: [] });
    expect(started.events.map(({ type }) => type)).not.toContain('kernel:trigger-fired');
    expect(play(placed.state, FINISH, open, kernel).state.variables).toMatchObject({ phase: true, seen: true });
  });
});

describe('moving a unit', () => {
  it('spends the actions of the move and the cost of its path', () => {
    const moved = play(PLACED, move('archers-1', '1,2'));

    expect(moved.events[0]?.payload).toStrictEqual({ spent: { 'core:action': 1, 'core:speed': 2 }, unit: 'archers-1' });
    expect(moved.events[1]?.payload).toStrictEqual({ path: ['1,1', '1,2'], unit: 'archers-1' });
    expect(unitOf(moved.state, 'archers-1').cell).toBe('1,2');
  });

  it('turns a unit where it stands and rejects a command that does nothing', () => {
    const turned = play(free(PLACED), move('archers-1', '0,1', 'west'));

    expect(turned.events.map(({ type }) => type).slice(0, 2))
      .toStrictEqual(['kernel:actions-changed', 'kernel:unit-turned']);

    expect(unitOf(turned.state, 'archers-1').facing).toBe('west');

    expect(reason(KERNEL.execute(PLACED, move('archers-1', '0,1'), CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'to' }]);

    expect(reason(KERNEL.execute(PLACED, move('archers-1', 'zz'), CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'to' }]);

    expect(reason(KERNEL.execute(PLACED, move('archers-1', '0,1', 'banana'), CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'facing' }]);
  });

  it('rejects a cell beyond the movement left, a unit without actions, off the field or without the turn', () => {
    const tired = withSpent(PLACED, { 'core:action': 1 });
    const slow = withSpent(free(PLACED), { 'core:speed': 3 });
    const { cell, ...unplaced } = unitOf(PLACED, 'archers-1');
    const away = { ...PLACED, units: PLACED.units.map((unit) => (unit.id === 'archers-1' ? unplaced : unit)) };

    expect(cell).toBe('0,1');

    expect(reason(KERNEL.execute(PLACED, move('archers-1', '4,0'), CONTENT)))
      .toStrictEqual(['kernel:unreachable', { cell: '4,0' }]);

    expect(reason(KERNEL.execute(slow, move('archers-1', '1,2'), CONTENT)))
      .toStrictEqual(['kernel:unreachable', { cell: '1,2' }]);

    expect(reason(KERNEL.execute(tired, move('archers-1', '1,1'), CONTENT)))
      .toStrictEqual(['kernel:not-enough-actions', { action: 'core:action' }]);

    expect(reason(KERNEL.execute(away, move('archers-1', '1,1'), CONTENT)))
      .toStrictEqual(['kernel:not-on-field', { unit: 'archers-1' }]);

    expect(reason(KERNEL.execute(PLACED, move('pikemen-1', '3,1'), CONTENT)))
      .toStrictEqual(['kernel:not-your-turn', {}]);

    expect(reason(KERNEL.execute(PLACED, move('ghosts-1', '3,1'), CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'unit' }]);
  });

  it('is not available without a rule of movement', () => {
    const still = { ...PLACED, ruleset: { ...RULESET, turn: { actions: ['core:action'], endTurn: true } } };

    expect(reason(KERNEL.execute(still, move('archers-1', '1,1'), CONTENT)))
      .toStrictEqual(['kernel:not-available', {}]);
  });
});

const ACTED = node('kernel:variable-is', { value: true, variable: 'acted' });

const NOTE: CommandKind = {
  kind: 'command',
  name: 'acme:note',
  plan: () => ({ kind: 'steps', steps: [mark('acted')] }),
  schema: { type: 'object' },
};

const FINISH: GameCommand = { kind: 'game', side: 'attacker', type: 'finish-deployment' };

function free(state: BattleState): BattleState {
  return { ...state, ruleset: { ...state.ruleset, turn: { ...state.ruleset.turn, actions: [] } } };
}

function withSpent(state: BattleState, spent: Readonly<Record<string, number>>): BattleState {
  const units = state.units.map((unit) => (unit.id === 'archers-1' ? { ...unit, spentActions: spent } : unit));

  return { ...state, units };
}

function setting(variable: string): ReturnType<typeof node> {
  return node('kernel:set-variable', { value: true, variable });
}
