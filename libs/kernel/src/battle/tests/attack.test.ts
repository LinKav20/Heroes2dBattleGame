import { describe, expect, it } from 'vitest';
import type { ContentRegistry } from '../../content/index.ts';
import type { AttackRequest, AttackVariant, CommandPlan, MechanicContext } from '../../extensions/index.ts';
import type { AttackCommand, BattleState, Command, GameCommand, Unit } from '../../model/index.ts';
import { operationDrafts } from '../../operations/index.ts';
import { asRecord, effect, node, unitOf } from '../../tests/fixtures.ts';
import { spendActionsDraft } from '../index.ts';
import {
  BRACE,
  CONTENT as DUEL,
  endTurn,
  kernelWith,
  mark,
  ORDER,
  play,
  reason,
  RULESET,
  SCENARIO,
  SIDES,
  startWith,
  withScenario,
} from './helpers.ts';

describe('the commands attack and shoot', () => {
  it('are not available without an attack in the ruleset, or a shot in the attack', () => {
    const plain = withScenario({});
    const placed = startWith(KERNEL, plain);

    expect(reason(KERNEL.execute(placed, attack('pikemen-1'), plain))).toStrictEqual(['kernel:not-available', {}]);

    expect(reason(KERNEL.execute(startWith(KERNEL, MELEE_ONLY), shoot('pikemen-1'), MELEE_ONLY)))
      .toStrictEqual(['kernel:not-available', {}]);
  });

  it('check the unit, the target and the turn before the attack plans anything', () => {
    const dead = withUnit(STARTED, 'pikemen-1', { count: 0, health: 0 });
    const gone = offField(STARTED, 'pikemen-1');

    expect(reason(KERNEL.execute(STARTED, attack('nobody-1'), CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'target' }]);

    expect(reason(KERNEL.execute(STARTED, attack('archers-1'), CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'target' }]);

    expect(reason(KERNEL.execute(STARTED, { ...attack('archers-1'), unit: 'pikemen-1' }, CONTENT)))
      .toStrictEqual(['kernel:not-your-turn', {}]);

    expect(reason(KERNEL.execute(dead, attack('pikemen-1'), CONTENT)))
      .toStrictEqual(['kernel:invalid-targets', { problem: 'dead', target: 0 }]);

    expect(reason(KERNEL.execute(gone, attack('pikemen-1'), CONTENT)))
      .toStrictEqual(['kernel:invalid-targets', { problem: 'off-field', target: 0 }]);
  });

  it('reject an attack and a shot at a unit the side of the attacker does not see as at no unit', () => {
    const hidden = withUnit(STARTED, 'pikemen-1', { visibleTo: ['defender'] });

    expect(reason(KERNEL.execute(hidden, attack('pikemen-1'), CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'target' }]);

    expect(reason(KERNEL.execute(hidden, attack('pikemen-1', '1,1'), CONTENT)))
      .toStrictEqual(reason(KERNEL.execute(hidden, attack('nobody-1', '1,1'), CONTENT)));

    expect(reason(KERNEL.execute(hidden, shoot('pikemen-1'), CONTENT)))
      .toStrictEqual(reason(KERNEL.execute(hidden, shoot('nobody-1'), CONTENT)));

    expect(reason(KERNEL.execute(hidden, shoot('pikemen-1'), CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'target' }]);
  });

  it('check the attacker before the attack plans anything: in the battle, alive, on the field, and in a turn', () => {
    const created = KERNEL.createState({ scenario: 'demo:duel' }, CONTENT);
    const dead = withUnit(STARTED, 'archers-1', { count: 0, health: 0 });

    expect(reason(KERNEL.execute(STARTED, { ...attack('pikemen-1'), unit: 'nobody-1' }, CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'unit' }]);

    expect(reason(KERNEL.execute(created, attack('pikemen-1'), CONTENT))).toStrictEqual(['kernel:wrong-phase', {}]);

    expect(reason(KERNEL.execute(dead, attack('pikemen-1'), CONTENT)))
      .toStrictEqual(['kernel:unit-dead', { unit: 'archers-1' }]);

    expect(reason(KERNEL.execute(offField(STARTED, 'archers-1'), attack('pikemen-1'), CONTENT)))
      .toStrictEqual(['kernel:not-on-field', { unit: 'archers-1' }]);
  });

  it('let a unit of the side that has the turn attack, and end the turn of the side after it', () => {
    const content = withMechanics('acme:strike', { 'kernel:turn-order': { variant: 'acme:sides-in-turn' } }, 'side');
    const near = withUnit(startWith(KERNEL, content), 'archers-1', { cell: '3,1' });
    const struck = play(near, attack('pikemen-1'), content, KERNEL);

    expect(near.phase).toStrictEqual({ kind: 'turn', side: 'attacker' });
    expect(struck.state.phase).toMatchObject({ kind: 'turn', side: 'defender' });

    expect(reason(KERNEL.execute(near, { ...attack('archers-1'), unit: 'pikemen-1' }, content)))
      .toStrictEqual(['kernel:not-your-turn', {}]);
  });

  it('end the turn after the steps of the attack only when the attack says so', () => {
    const ended = play(startWith(KERNEL, ENDING), attack('pikemen-1'), ENDING, KERNEL).state;
    const going = play(WATCHED, attack('pikemen-1'), WATCHING, KERNEL).state;

    expect(ended.variables.struck).toBe('pikemen-1');
    expect(ended.phase).toStrictEqual({ kind: 'turn', side: 'defender', unit: 'pikemen-1' });
    expect(unitOf(ended, 'archers-1').spentActions).toStrictEqual({});
    expect(going.phase).toStrictEqual({ kind: 'turn', side: 'attacker', unit: 'archers-1' });
  });

  it('let the attack forbid a strike from where the unit stands, and ends the turn after it', () => {
    const near = withUnit(STARTED, 'archers-1', { cell: '3,1' });
    const struck = play(near, attack('pikemen-1'), CONTENT, KERNEL);

    expect(reason(KERNEL.execute(STARTED, attack('pikemen-1'), CONTENT))).toStrictEqual(['acme:too-far', {}]);
    expect(struck.state.variables.struck).toBe('pikemen-1');
    expect(struck.state.phase).toStrictEqual({ kind: 'turn', side: 'defender', unit: 'pikemen-1' });
  });

  it('move the unit to the cell to attack from first, and plan the strike as if it stood there', () => {
    const moved = play(STARTED, attack('pikemen-1', '3,1'), CONTENT, KERNEL);

    expect(moved.events.map(({ type }) => type).slice(0, 5)).toStrictEqual([
      'kernel:actions-changed',
      'kernel:unit-moved',
      'kernel:variable-set',
      'kernel:variable-set',
      'kernel:actions-changed',
    ]);

    expect(unitOf(moved.state, 'archers-1')).toMatchObject({ cell: '3,1' });
    expect(asRecord(moved.state.variables).seen).toBe('3,1');
  });

  it('show the attack the actions the move spent, the direction it gave and its path', () => {
    const watched = play(WATCHED, { ...attack('pikemen-1', '3,1'), facing: 'west' }, WATCHING, KERNEL).state;

    expect(watched.variables).toMatchObject({ facing: 'west', path: '1,1 2,1 3,1', spent: 3 });
    expect(unitOf(watched, 'archers-1')).toMatchObject({ cell: '3,1', facing: 'west' });
  });

  it('turn the unit where it stands to attack from its own cell facing another way, and not move it otherwise', () => {
    const turned = play(WATCHED, { ...attack('pikemen-1', '0,1'), facing: 'west' }, WATCHING, KERNEL);
    const still = play(WATCHED, attack('pikemen-1', '0,1'), WATCHING, KERNEL);
    const west = withUnit(WATCHED, 'archers-1', { facing: 'west' });
    const facing = play(west, { ...attack('pikemen-1', '0,1'), facing: 'west' }, WATCHING, KERNEL);

    expect(turned.events.map(({ type }) => type)).toContain('kernel:unit-turned');
    expect(unitOf(turned.state, 'archers-1')).toMatchObject({ cell: '0,1', facing: 'west' });
    expect(turned.state.variables).toMatchObject({ facing: 'west', path: '' });

    for (const kept of [still, facing]) {
      expect(kept.events.map(({ type }) => type).filter((type) => type.startsWith('kernel:unit-'))).toStrictEqual([]);
      expect(kept.state.variables).toMatchObject({ path: 'none', spent: 0 });
    }
  });

  it('spend only the points of movement on the way to strike, even where every move spends an action', () => {
    const approached = play(startWith(KERNEL, APPROACH), attack('pikemen-1', '3,1'), APPROACH, KERNEL).state;
    const walked = play(startWith(KERNEL, APPROACH), move('2,1'), APPROACH, KERNEL).state;

    expect(unitOf(approached, 'archers-1')).toMatchObject({
      cell: '3,1',
      spentActions: { 'core:action': 1, 'core:speed': 3 },
    });

    expect(approached.variables.struck).toBe('pikemen-1');

    expect(unitOf(walked, 'archers-1').spentActions).toStrictEqual({ 'core:action': 1, 'core:speed': 2 });
  });

  it('throw when the attack returns a plan of an unknown shape', () => {
    const state = startWith(KERNEL, BOGUS);

    expect(() => KERNEL.execute(state, attack('pikemen-1'), BOGUS)).toThrow('returned an unknown plan');
    expect(() => KERNEL.execute(state, shoot('pikemen-1'), BOGUS)).toThrow('returned an unknown plan');
  });

  it('reject the whole command, the move with it, when the attack forbids the strike after the move', () => {
    expect(reason(KERNEL.execute(STARTED, attack('pikemen-1', '1,1'), CONTENT))).toStrictEqual(['acme:too-far', {}]);
  });

  it('let the steps of the attack ask for a roll after the move and go on with the answer', () => {
    const asked = play(startWith(KERNEL, ASKING), attack('pikemen-1', '3,1'), ASKING, KERNEL).state;
    const request = asked.inputRequest?.id ?? 0;
    const answer: Command = { kind: 'answer', request, value: { dice: [3], kind: 'roll' } };
    const answered = play(asked, answer, ASKING, KERNEL).state;

    expect(asked.inputRequest).toMatchObject({ kind: 'roll', name: 'core:morale' });
    expect(unitOf(asked, 'archers-1')).toMatchObject({ cell: '3,1' });
    expect(answered.variables).toMatchObject({ asked: true, struck: 'pikemen-1' });
    expect(answered.phase).toStrictEqual({ kind: 'turn', side: 'defender', unit: 'pikemen-1' });
  });

  it('spend nothing of an attacker that died in its own attack or on the way to it', () => {
    const doomed = withUnit(startWith(KERNEL, DOOMED), 'archers-1', { cell: '3,1' });
    const fallen = play(doomed, attack('pikemen-1'), DOOMED, KERNEL);
    const trapped = play(startWith(KERNEL, TRAPPED), attack('pikemen-1', '3,1'), TRAPPED, KERNEL);

    expect(unitOf(fallen.state, 'archers-1')).toMatchObject({ count: 0, spentActions: {} });
    expect(fallen.events.filter(({ type }) => type === 'kernel:actions-changed')).toStrictEqual([]);
    expect(fallen.state.phase).toStrictEqual({ kind: 'turn', side: 'defender', unit: 'pikemen-1' });
    expect(unitOf(trapped.state, 'archers-1')).toMatchObject({ count: 0, spentActions: { 'core:speed': 3 } });
    expect(trapped.state.variables.struck).toBe('pikemen-1');
  });

  it('throw when the attack or the shot plans a step that only the kernel adds', () => {
    const state = startWith(KERNEL, ROGUE);
    const near = withUnit(state, 'archers-1', { cell: '3,1' });

    expect(() => KERNEL.execute(near, attack('pikemen-1'), ROGUE)).toThrow(TypeError);
    expect(() => KERNEL.execute(state, attack('pikemen-1', '3,1'), ROGUE)).toThrow(TypeError);
    expect(() => KERNEL.execute(state, shoot('pikemen-1'), ROGUE)).toThrow(TypeError);
  });

  it('check the move to the cell to attack from as the command move does', () => {
    expect(reason(KERNEL.execute(STARTED, attack('pikemen-1', '4,0'), CONTENT)))
      .toStrictEqual(['kernel:unreachable', { cell: '4,0' }]);

    expect(reason(KERNEL.execute(STARTED, attack('pikemen-1', '9,9'), CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'from' }]);

    expect(reason(KERNEL.execute(STARTED, { ...attack('pikemen-1'), facing: 'east' }, CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'facing' }]);

    const near = withUnit(STARTED, 'archers-1', { cell: '3,1' });

    expect(reason(KERNEL.execute(near, attack('pikemen-1', '3,1'), CONTENT))).toBeUndefined();
  });

  it('shoot with the shot of the attack and end the turn', () => {
    const shot = play(STARTED, shoot('pikemen-1'), CONTENT, KERNEL);

    expect(shot.state.variables.shot).toBe('pikemen-1');
    expect(play(shot.state, endTurn('pikemen-1'), CONTENT, KERNEL).state.round).toBe(2);
  });
});

const STRIKE: AttackVariant = {
  attack: (context, request) => strike(context, request, 'struck'),
  kind: 'mechanic',
  mechanic: 'kernel:attack',
  name: 'acme:strike',
  schema: { type: 'object' },
  shoot: (context, { target, unit }) => ({
    kind: 'steps',
    steps: [mark('shot', target), spendActionsDraft({ spent: { 'core:action': 1 }, unit })],
  }),
};

const MELEE: AttackVariant = {
  attack: (context, request) => strike(context, request, 'struck'),
  kind: 'mechanic',
  mechanic: 'kernel:attack',
  name: 'acme:melee',
  schema: { type: 'object' },
};

const WATCH: AttackVariant = {
  attack: ({ state }, { path, unit }) => {
    const { facing, spentActions } = unitOf(state, unit);

    return {
      kind: 'steps',
      steps: [
        mark('spent', spentActions['core:speed'] ?? 0),
        mark('facing', facing ?? 'none'),
        mark('path', path?.join(' ') ?? 'none'),
      ],
    };
  },
  kind: 'mechanic',
  mechanic: 'kernel:attack',
  name: 'acme:watch',
  schema: { type: 'object' },
};

const END: AttackVariant = {
  attack: (context, { target }) => ({ endsTurn: true, kind: 'steps', steps: [mark('struck', target)] }),
  kind: 'mechanic',
  mechanic: 'kernel:attack',
  name: 'acme:end',
  schema: { type: 'object' },
};

const ASK: AttackVariant = {
  attack: (context, { target }) => ({
    endsTurn: true,
    kind: 'steps',
    steps: [{ params: {}, type: 'acme:ask' }, mark('struck', target)],
  }),
  kind: 'mechanic',
  mechanic: 'kernel:attack',
  name: 'acme:asking',
  schema: { type: 'object' },
};

const DOOM: AttackVariant = {
  attack: (context, { unit }) => ({
    kind: 'steps',
    steps: [
      ...operationDrafts([node('kernel:damage', { amount: 1000, to: 'target' })], {
        subjects: { target: { kind: 'unit', unit } },
      }),
      spendActionsDraft({ spent: { 'core:action': 1 }, unit }),
    ],
  }),
  kind: 'mechanic',
  mechanic: 'kernel:attack',
  name: 'acme:doom',
  schema: { type: 'object' },
};

const ROGUE_VARIANT: AttackVariant = {
  attack: () => ({ kind: 'steps', steps: [{ params: {}, type: 'kernel:turn-end' }] }),
  kind: 'mechanic',
  mechanic: 'kernel:attack',
  name: 'acme:rogue',
  schema: { type: 'object' },
  shoot: () => ({ kind: 'steps', steps: [{ params: {}, type: 'kernel:turn-end' }] }),
};

const BOGUS_VARIANT: AttackVariant = {
  attack: () => JSON.parse('{ "kind": "forbidden" }') as CommandPlan,
  kind: 'mechanic',
  mechanic: 'kernel:attack',
  name: 'acme:bogus',
  schema: { type: 'object' },
  shoot: () => JSON.parse('{ "kind": "steps" }') as CommandPlan,
};

const KERNEL = kernelWith(ORDER, SIDES, BRACE, STRIKE, MELEE, WATCH, END, ASK, DOOM, ROGUE_VARIANT, BOGUS_VARIANT);

const TURN = { ...RULESET.turn, movement: { actions: {}, points: 'core:speed' } };

const CONTENT = withScenario({ variables: { moved: false } }, {
  mechanics: { ...RULESET.mechanics, 'kernel:attack': { variant: 'acme:strike' } },
  turn: TURN,
});

const MELEE_ONLY = withScenario({}, {
  mechanics: { ...RULESET.mechanics, 'kernel:attack': { variant: 'acme:melee' } },
  turn: TURN,
});

const WATCHING = withMechanics('acme:watch');

const ENDING = withMechanics('acme:end');

const ASKING: ContentRegistry = withScenario({ variables: { moved: false } }, {
  mechanics: { ...RULESET.mechanics, 'kernel:attack': { variant: 'acme:asking' } },
  randomSources: { 'core:morale': 'external' },
  turn: TURN,
});

const DOOMED = withMechanics('acme:doom');

const ROGUE = withMechanics('acme:rogue');

const BOGUS = withMechanics('acme:bogus');

const APPROACH = withScenario({ variables: { moved: false } }, {
  mechanics: { ...RULESET.mechanics, 'kernel:attack': { variant: 'acme:strike' } },
});

const TRAPPED: ContentRegistry = {
  ...withScenario({
    sides: SCENARIO.sides.map((side) => ({
      ...side,
      units: side.units.map((unit) => (unit.id === 'archers-1' ? { ...unit, effects: ['demo:snare'] } : unit)),
    })),
    variables: { moved: false },
  }, { mechanics: { ...RULESET.mechanics, 'kernel:attack': { variant: 'acme:strike' } }, turn: TURN }),
  effects: {
    ...DUEL.effects,
    'demo:snare': effect('demo:snare', {
      duration: { kind: 'battle' },
      triggers: [{ on: 'kernel:unit-moved', ops: [node('kernel:damage', { amount: 1000, to: 'self' })], priority: 0 }],
    }),
  },
};

const STARTED: BattleState = startWith(KERNEL, CONTENT);

const WATCHED: BattleState = startWith(KERNEL, WATCHING);

function strike(context: MechanicContext, { target, unit }: AttackRequest, variable: string): CommandPlan {
  const { field } = context;
  const distance = field.distanceBetween(field.cellsOf(unit), field.cellsOf(target)) ?? 99;

  if (distance > 1) return { kind: 'reject', reason: 'acme:too-far' };

  const cell = unitOf(context.state, unit).cell ?? '';

  return {
    endsTurn: true,
    kind: 'steps',
    steps: [mark('seen', cell), mark(variable, target), spendActionsDraft({ spent: { 'core:action': 1 }, unit })],
  };
}

function withMechanics(
  name: string,
  mechanics: Readonly<Record<string, { readonly variant: string }>> = {},
  turnOwner: 'side' | 'unit' = 'unit',
): ContentRegistry {
  return withScenario({ variables: { moved: false } }, {
    mechanics: { ...RULESET.mechanics, ...mechanics, 'kernel:attack': { variant: name } },
    turn: TURN,
    turnOwner,
  });
}

function attack(target: string, from?: string): AttackCommand {
  return { kind: 'game', target, type: 'attack', unit: 'archers-1', ...(from === undefined ? {} : { from }) };
}

function move(to: string): GameCommand {
  return { kind: 'game', to, type: 'move', unit: 'archers-1' };
}

function shoot(target: string): GameCommand {
  return { kind: 'game', target, type: 'shoot', unit: 'archers-1' };
}

function withUnit(state: BattleState, id: string, change: Partial<Unit>): BattleState {
  return { ...state, units: state.units.map((unit) => (unit.id === id ? { ...unit, ...change } : unit)) };
}

function offField(state: BattleState, id: string): BattleState {
  return {
    ...state,
    units: state.units.map((unit) => {
      if (unit.id !== id) return unit;

      const { cell, ...rest } = unit;

      return cell === undefined ? unit : rest;
    }),
  };
}
