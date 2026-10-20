import { describe, expect, it } from 'vitest';
import { ContentError, type ContentRegistry } from '../../content/index.ts';
import { MAX_STACK_DEPTH, type ExecuteResult } from '../../execution/index.ts';
import type { CommandKind, TurnOrderVariant } from '../../extensions/index.ts';
import type { BattleState, GameCommand, UnitHolder } from '../../model/index.ts';
import { accepted, asRecord, effect, node, unitOf } from '../../tests/fixtures.ts';
import { spendActionsDraft, turnCheckDraft } from '../index.ts';
import {
  ASK_STEP,
  battleWith,
  BRACE,
  CONTENT,
  CREATED,
  endTurn,
  finish,
  KERNEL,
  kernelWith,
  mark,
  move,
  ORDER,
  place,
  PLACED,
  play,
  played,
  reason,
  RULESET,
  runOn,
  SCENARIO,
  SIDES,
  startWith,
  value,
  variant,
  withScenario,
} from './helpers.ts';

describe('the course of a battle', () => {
  it('starts after deployment: shows the placed units to all and gives the first turn', () => {
    const placed = play(CREATED, place('archers-1', '0,1')).state;
    const started = play(placed, finish());

    expect(started.events.map(({ type }) => type)).toStrictEqual([
      'kernel:phase-changed',
      'kernel:unit-placed',
      'kernel:phase-changed',
      'kernel:variable-set',
      'kernel:phase-changed',
      'kernel:variable-set',
      'kernel:phase-changed',
      'kernel:trigger-fired',
      'kernel:variable-set',
      'kernel:trigger-fired',
      'kernel:variable-set',
    ]);

    expect(started.events[1]?.visibleTo).toBe('all');
    expect(started.state.phase).toStrictEqual({ kind: 'turn', side: 'attacker', unit: 'archers-1' });
    expect(started.state.round).toBe(1);
    expect(started.state.variables).toMatchObject({ order: 'first', round: 1, started: true });

    expect(reason(KERNEL.execute(started.state, { kind: 'game', type: 'start-battle' }, CONTENT)))
      .toStrictEqual(['kernel:wrong-phase', {}]);
  });

  it('ends a turn when the unit has spent its actions, after the triggers of the action', () => {
    const moved = play(PLACED, move('archers-1', '1,1'));

    expect(moved.events.map(({ type }) => type).slice(0, 5)).toStrictEqual([
      'kernel:actions-changed',
      'kernel:unit-moved',
      'kernel:trigger-fired',
      'kernel:variable-set',
      'kernel:turn-ended',
    ]);

    expect(moved.state.turns).toStrictEqual([{ holder: ARCHERS, skipped: false, waited: false }]);
    expect(moved.state.phase).toStrictEqual({ kind: 'turn', side: 'defender', unit: 'pikemen-1' });
    expect(unitOf(moved.state, 'pikemen-1').health).toBe(9);
    expect(moved.state.variables).toMatchObject({ last: 'archers-1', moved: true });
  });

  it('starts the next round when every unit has had its turn, and asks the hooks after its own steps', () => {
    const second = played(PLACED, endTurn('archers-1'), endTurn('pikemen-1'));
    const third = played(second, endTurn('archers-1'), endTurn('pikemen-1'));

    expect(second.round).toBe(2);
    expect(second.turns).toStrictEqual([]);
    expect(second.phase).toStrictEqual({ kind: 'turn', side: 'attacker', unit: 'archers-1' });
    expect(second.variables).toMatchObject({ round: 2, 'second-round': true });
    expect(second.triggers['second-round']).toStrictEqual({ fired: 1 });
    expect(third.triggers['second-round']).toStrictEqual({ fired: 1 });
    expect(unitOf(third, 'pikemen-1').effects).toStrictEqual([]);
    expect(unitOf(third, 'pikemen-1').health).toBe(8);
  });

  it('goes on with a turn put off by waiting without counting the start of the turn again', () => {
    const pikemenTurn = play(PLACED, endTurn('archers-1')).state;
    const waited = play(pikemenTurn, { kind: 'game', type: 'wait', unit: 'pikemen-1' });

    expect(unitOf(pikemenTurn, 'pikemen-1').health).toBe(9);
    expect(waited.state.turns.at(-1)).toStrictEqual({ holder: PIKEMEN, skipped: false, waited: true });
    expect(waited.state.phase).toStrictEqual({ kind: 'turn', side: 'defender', unit: 'pikemen-1' });
    expect(unitOf(waited.state, 'pikemen-1').health).toBe(9);
    expect(unitOf(waited.state, 'pikemen-1').effects).toStrictEqual(unitOf(pikemenTurn, 'pikemen-1').effects);
    expect(play(waited.state, endTurn('pikemen-1')).state.round).toBe(2);
  });

  it('gives a unit only its actions back in another turn of the same round', () => {
    const twice = variant('acme:twice', { next: ({ state }) => value(state.turns.length < 2 ? ARCHERS : undefined) });
    const { content, kernel, state } = battleWith(twice);
    const again = play(state, move('archers-1', '1,1'), content, kernel);

    expect(again.state.phase).toStrictEqual({ kind: 'turn', side: 'attacker', unit: 'archers-1' });
    expect(unitOf(again.state, 'archers-1').spentActions).toStrictEqual({});
    expect(again.state.turns).toStrictEqual([{ holder: ARCHERS, skipped: false, waited: false }]);
  });

  it('counts the effects of a side at every turn of its units', () => {
    const sides = SCENARIO.sides.map((side, index) => (index === 0 ? { ...side, effects: ['demo:ward'] } : side));
    const started = startWith(KERNEL, withScenario({ sides }));

    expect(started.variables.warded).toBe(true);
    expect(started.sides[0]?.effects).toStrictEqual([]);
  });

  it('gives the turns to sides: a side acts with its units, which get their actions back at its next turn', () => {
    const mechanics = { 'kernel:turn-order': { variant: 'acme:sides-in-turn' } };
    const content = withScenario({}, { mechanics, turnOwner: 'side' });
    const started = startWith(KERNEL, content);
    const moved = play(started, move('archers-1', '1,1'), content);
    const ended = play(moved.state, { kind: 'game', side: 'defender', type: 'end-turn' }, content);

    expect(started.phase).toStrictEqual({ kind: 'turn', side: 'attacker' });
    expect(moved.state.phase).toStrictEqual({ kind: 'turn', side: 'defender' });
    expect(unitOf(moved.state, 'pikemen-1').health).toBe(9);
    expect(ended.state.round).toBe(2);
    expect(unitOf(ended.state, 'archers-1').spentActions).toStrictEqual({});

    expect(reason(KERNEL.execute(ended.state, endTurn('archers-1'), content)))
      .toStrictEqual(['kernel:invalid-command', { field: 'unit' }]);
  });

  it('lets a hook end the turn at its start after the checks of the start, and not again at its end', () => {
    const morale = variant('acme:morale', {
      turnEnd: () => [turnCheckDraft({ end: true })],
      turnStart: (context, holder) => (holder.kind === 'unit' && holder.unit === 'archers-1'
        ? [turnCheckDraft({ end: true })]
        : []),
    });
    const { content, kernel, state } = battleWith(morale);

    expect(state.turns.map(({ holder }) => holder)).toStrictEqual([ARCHERS]);
    expect(state.phase).toStrictEqual({ kind: 'turn', side: 'defender', unit: 'pikemen-1' });
    expect(state.triggers.turn).toStrictEqual({ fired: 2 });
    expect(play(state, endTurn('pikemen-1'), content, kernel).state.round).toBe(2);
  });

  it('lets a unit defend with the defense of the ruleset', () => {
    const mechanics = { ...RULESET.mechanics, 'kernel:defense': { variant: 'acme:brace' } };
    const defending = withScenario({}, { mechanics });
    const started = startWith(KERNEL, defending);
    const braced = play(started, { kind: 'game', type: 'defend', unit: 'archers-1' }, defending);
    const proud = KERNEL.execute(braced.state, { kind: 'game', type: 'defend', unit: 'pikemen-1' }, defending);

    expect(braced.state.variables.braced).toBe('archers-1');
    expect(braced.state.phase).toStrictEqual({ kind: 'turn', side: 'defender', unit: 'pikemen-1' });
    expect(reason(proud)).toStrictEqual(['acme:too-proud', {}]);

    expect(reason(KERNEL.execute(PLACED, { kind: 'game', type: 'defend', unit: 'archers-1' }, CONTENT)))
      .toStrictEqual(['kernel:not-available', {}]);
  });

  it('checks who may end the turn, wait and move', () => {
    const closed = { ...PLACED, ruleset: { ...PLACED.ruleset, turn: { ...RULESET.turn, endTurn: false } } };
    const { kind, mechanic, schema } = ORDER;
    const unwaiting: TurnOrderVariant = {
      kind,
      mechanic,
      name: 'acme:in-order',
      next: (context) => ORDER.next(context),
      schema,
    };
    const patient = kernelWith(unwaiting);
    const both: GameCommand = { kind: 'game', side: 'attacker', type: 'end-turn', unit: 'archers-1' };

    expect(reason(KERNEL.execute(PLACED, endTurn('pikemen-1'), CONTENT))).toStrictEqual(['kernel:not-your-turn', {}]);

    expect(reason(KERNEL.execute(PLACED, endTurn('ghosts-1'), CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'unit' }]);

    expect(reason(KERNEL.execute(PLACED, both, CONTENT))).toStrictEqual(['kernel:invalid-command', { field: 'unit' }]);
    expect(reason(KERNEL.execute(closed, endTurn('archers-1'), CONTENT))).toStrictEqual(['kernel:not-available', {}]);
    expect(reason(KERNEL.execute(CREATED, endTurn('archers-1'), CONTENT))).toStrictEqual(['kernel:wrong-phase', {}]);

    expect(reason(KERNEL.execute(CREATED, move('archers-1', '1,1'), CONTENT)))
      .toStrictEqual(['kernel:wrong-phase', {}]);

    expect(reason(KERNEL.execute(PLACED, { kind: 'game', type: 'wait', unit: 'pikemen-1' }, CONTENT)))
      .toStrictEqual(['kernel:not-your-turn', {}]);

    expect(reason(patient.execute(PLACED, { kind: 'game', type: 'wait', unit: 'archers-1' }, CONTENT)))
      .toStrictEqual(['kernel:not-available', {}]);
  });

  it('ends the battle by an outcome of the scenario, a retreat or a surrender', () => {
    const units = PLACED.units.map((unit) => (unit.id === 'pikemen-1' ? { ...unit, count: 0 } : unit));
    const won = play({ ...PLACED, units }, endTurn('archers-1'));
    const fled = play(PLACED, { kind: 'game', side: 'defender', type: 'retreat' });
    const gave = play(PLACED, { kind: 'game', side: 'attacker', type: 'surrender' });

    expect(won.events.at(-1)?.type).toBe('kernel:battle-ended');

    expect(asRecord(won.state.phase).outcome)
      .toStrictEqual({ condition: 'rout', kind: 'victory', side: 'attacker', winners: ['attacker'] });

    expect(asRecord(fled.state.phase).outcome)
      .toStrictEqual({ kind: 'retreat', side: 'defender', winners: ['attacker'] });

    expect(asRecord(gave.state.phase).outcome)
      .toStrictEqual({ kind: 'surrender', side: 'attacker', winners: ['defender'] });

    expect(reason(KERNEL.execute(PLACED, { kind: 'game', side: 'nobody', type: 'retreat' }, CONTENT)))
      .toStrictEqual(['kernel:invalid-command', { field: 'side' }]);

    expect(reason(KERNEL.execute(CREATED, { kind: 'game', side: 'attacker', type: 'retreat' }, CONTENT)))
      .toStrictEqual(['kernel:wrong-phase', {}]);
  });

  it('checks an outcome with its own side as the participant self', () => {
    const [attacker, defender] = SCENARIO.sides;
    const archers = attacker?.units[0];

    if (attacker === undefined || defender === undefined || archers === undefined) throw new Error('No sides');

    const two = node('kernel:compare', { left: node('kernel:units-alive', { of: 'self' }), operator: '=', right: 2 });
    const content = withScenario({
      outcomes: [
        { condition: two, id: 'crowd', outcome: 'victory', side: 'defender' },
        { condition: two, id: 'army', outcome: 'victory', side: 'attacker' },
      ],
      sides: [{ ...attacker, units: [archers, { ...archers, cell: '0,0', id: 'archers-2', items: [] }] }, defender],
    });

    expect(asRecord(startWith(KERNEL, content).phase).outcome)
      .toStrictEqual({ condition: 'army', kind: 'victory', side: 'attacker', winners: ['attacker'] });
  });

  it('spends actions of a unit only in whole numbers from 0, and gives no event for nothing', () => {
    expect(spend({ 'core:action': 1, 'core:speed': 0 }))
      .toStrictEqual([{ spent: { 'core:action': 1 }, unit: 'archers-1' }]);

    expect(spend({ 'core:action': 0 })).toStrictEqual([]);
    expect(() => spend({ 'core:action': -1 })).toThrow('A unit spends -1 of "core:action", not a whole number from 0.');
    expect(() => spend({ 'core:action': 0.5 })).toThrow(TypeError);
  });

  it('ends the battle in a draw when the rounds run out', () => {
    let state: BattleState = PLACED;

    for (let round = 1; round < 10; round += 1) {
      state = played(state, endTurn('archers-1'), endTurn('pikemen-1'));
    }

    expect(asRecord(state.phase).outcome).toStrictEqual({ condition: 'stalemate', kind: 'draw', winners: [] });
    expect(state.round).toBe(10);
  });

  it('ends the battle in a draw when a whole round gives nobody a turn to act', () => {
    const archer = CONTENT.creatures['demo:archer'];
    const pikeman = CONTENT.creatures['demo:pikeman'];

    if (archer === undefined || pikeman === undefined) throw new Error('No creatures');

    const tired = {
      ...withScenario({ outcomes: [] }),
      creatures: {
        'demo:archer': { ...archer, attributes: { ...archer.attributes, 'core:action': 0 } },
        'demo:pikeman': { ...pikeman, attributes: { ...pikeman.attributes, 'core:action': 0 } },
      },
    };
    const stuck = startWith(KERNEL, tired);

    expect(asRecord(stuck.phase).outcome).toStrictEqual({ kind: 'draw', winners: [] });
    expect(stuck.turns.every(({ skipped }) => skipped)).toBe(true);
  });

  it('ends the battle in a draw though a side without units on the field keeps an effect that counts turns', () => {
    const content = tired([[], ['demo:steady']]);
    const created = KERNEL.createState({ scenario: 'demo:duel' }, content);
    const units = created.units.map((unit) => (unit.id === 'pikemen-1' ? { ...unit, count: 0 } : unit));
    const placed = play({ ...created, units }, place('archers-1', '0,1'), content).state;
    const stuck = play(placed, finish(), content).state;

    expect(asRecord(stuck.phase).outcome).toStrictEqual({ kind: 'draw', winners: [] });
    expect(stuck.sides[1]?.effects.map(({ remaining }) => remaining)).toStrictEqual([3]);
  });

  it('puts off the draw while an effect of a unit or of its side still counts down', () => {
    const ofUnit = startWith(KERNEL, tired([[], []], [['demo:steady'], []]));
    const ofSide = startWith(KERNEL, tired([['demo:steady'], []]));

    expect([ofUnit.round, asRecord(ofUnit.phase).outcome]).toStrictEqual([3, { kind: 'draw', winners: [] }]);
    expect([ofSide.round, asRecord(ofSide.phase).outcome]).toStrictEqual([3, { kind: 'draw', winners: [] }]);
  });

  it('declares the draw only after the end of the round, whose triggers and outcomes come first', () => {
    const thaw = {
      id: 'thaw',
      on: 'kernel:round-end',
      ops: [node('kernel:set-variable', { value: false, variable: 'cold' })],
      priority: 0,
    };
    const frost = effect('demo:frost', {
      activeWhile: node('kernel:variable-is', { value: true, variable: 'cold' }),
      duration: { kind: 'battle' },
      modifiers: [{ attribute: 'core:action', operation: 'add', value: -1 }],
    });
    const base = tired([[], []], [['demo:frost'], []]);
    const scenario = base.scenarios['demo:duel'];

    if (scenario === undefined) throw new Error('No scenario');

    const archer = CONTENT.creatures['demo:archer'];
    const frozen = {
      ...base,
      creatures: { ...base.creatures, ...(archer === undefined ? {} : { 'demo:archer': archer }) },
      effects: { ...base.effects, 'demo:frost': frost },
      scenarios: { 'demo:duel': { ...scenario, triggers: [thaw], variables: { cold: true } } },
    };
    const won = {
      ...frozen,
      scenarios: {
        'demo:duel': {
          ...scenario,
          outcomes: [{
            condition: node('kernel:variable-is', { value: false, variable: 'cold' }),
            id: 'thawed',
            outcome: 'victory' as const,
            side: 'attacker',
          }],
          triggers: [thaw],
          variables: { cold: true },
        },
      },
    };
    const thawed = startWith(KERNEL, frozen);

    expect(thawed.round).toBe(2);
    expect(thawed.phase).toStrictEqual({ kind: 'turn', side: 'attacker', unit: 'archers-1' });
    expect(asRecord(startWith(KERNEL, won).phase).outcome).toMatchObject({ condition: 'thawed', kind: 'victory' });
  });

  it('checks outcomes and the turn again when the last reactions of a command change the battle', () => {
    const sides = SCENARIO.sides.map((side, index) => (index === 1
      ? { ...side, units: side.units.map((unit) => ({ ...unit, effects: ['demo:fragile', 'demo:trap'] })) }
      : side));
    const content = withScenario({ sides });
    const moved = play(startWith(KERNEL, content), move('archers-1', '1,1'), content);

    expect(asRecord(moved.state.phase).outcome).toMatchObject({ condition: 'rout', kind: 'victory' });
  });

  it('treats a rejection in the course of the battle as an error of the content or of the package', () => {
    const poison = CONTENT.effects['demo:poison'];

    if (poison === undefined) throw new Error('No poison');

    const huge = node('kernel:add', { values: [Number.MAX_SAFE_INTEGER, 1] });
    const onTurn = [node('kernel:damage', { amount: huge, to: 'self' })];
    const broken = { ...CONTENT, effects: { ...CONTENT.effects, 'demo:poison': { ...poison, onTurn } } };
    const rejecting = variant('acme:rejecting', { next: () => ({ kind: 'reject', reason: 'acme:no' }) });

    expect(() => KERNEL.execute(PLACED, endTurn('archers-1'), broken)).toThrow(ContentError);
    expect(() => battleWith(rejecting)).toThrow('"acme:rejecting" cannot go on: "acme:no".');
  });

  it('treats an order of turns that breaks the contract as an error of the point of assembly', () => {
    const sided = variant('acme:sided', { next: () => value({ kind: 'side', side: 'attacker' }) });
    const sneaky = variant('acme:sneaky', { roundStart: () => [{ params: {}, type: 'kernel:next-turn' }] });
    const ghostly = variant('acme:ghostly', { next: () => value({ kind: 'unit', unit: 'ghosts-1' }) });
    const roll: unknown = { kind: 'need', need: { count: 1, kind: 'roll', name: 'core:initiative', sides: 20 } };
    const rolling = variant('acme:rolling', { next: () => roll as ReturnType<TurnOrderVariant['next']> });

    expect(() => battleWith(sided)).toThrow('gives a turn to a side, not to a unit');
    expect(() => battleWith(sneaky)).toThrow('"acme:sneaky" adds the step "kernel:next-turn"');
    expect(() => battleWith(ghostly)).toThrow('The battle has no unit "ghosts-1".');
    expect(() => battleWith(rolling)).toThrow('gives an unknown answer to who goes next');
  });

  it('goes on with the course of the battle after the rest of a command is aborted', () => {
    const randomSources = { 'core:morale': 'external' } as const;
    const external = { ...PLACED, ruleset: { ...PLACED.ruleset, randomSources } };
    const paused = play(external, { kind: 'game', name: 'acme:gamble', payload: {}, type: 'extension' });
    const answered = play(paused.state, { kind: 'answer', request: 1, value: { dice: [2], kind: 'roll' } });

    expect(answered.events.map(({ type }) => type).slice(0, 4))
      .toStrictEqual(['kernel:input-closed', 'kernel:roll-made', 'kernel:command-aborted', 'kernel:turn-ended']);

    expect(answered.state.phase).toStrictEqual({ kind: 'turn', side: 'defender', unit: 'pikemen-1' });
  });

  it('saves at most the full stack of steps when it waits for a value, and goes on from it', () => {
    const full = accepted(piled(MAX_STACK_DEPTH - 4));
    const saved = JSON.parse(JSON.stringify(full.state)) as BattleState;
    const answer = { kind: 'answer', request: 1, value: { dice: [3], kind: 'roll' } } as const;
    const answered = accepted(PILING.execute(saved, answer, WATCHED));

    expect(accepted(piled(MAX_STACK_DEPTH - 5)).state.steps).toHaveLength(MAX_STACK_DEPTH - 1);
    expect(full.state.steps).toHaveLength(MAX_STACK_DEPTH);
    expect(reason(piled(MAX_STACK_DEPTH - 3))).toStrictEqual(['kernel:step-limit', {}]);
    expect(answered.state.steps).toStrictEqual([]);
    expect(answered.state.variables).toMatchObject({ asked: true, piled: true });
    expect(answered.state.phase).toStrictEqual({ kind: 'turn', side: 'attacker', unit: 'archers-1' });
  });
});

const PILE: CommandKind<{ readonly depth: number }> = {
  kind: 'command',
  name: 'acme:pile',
  plan: ({ payload }) => ({
    kind: 'steps',
    steps: [
      mark('piling'),
      { params: {}, type: ASK_STEP.name },
      ...Array.from({ length: payload.depth }, () => mark('piled')),
    ],
  }),
  schema: { type: 'object' },
};

const PILING = kernelWith(ORDER, SIDES, BRACE, PILE);

const WATCHED = withScenario({
  triggers: [...SCENARIO.triggers, { id: 'watch', on: 'kernel:variable-set', ops: [], priority: 0 }],
});

const ARCHERS: UnitHolder = { kind: 'unit', unit: 'archers-1' };

const PIKEMEN: UnitHolder = { kind: 'unit', unit: 'pikemen-1' };

function piled(depth: number): ExecuteResult {
  const randomSources = { 'core:morale': 'external' } as const;
  const external = { ...PLACED, ruleset: { ...PLACED.ruleset, randomSources } };

  return PILING.execute(external, { kind: 'game', name: 'acme:pile', payload: { depth }, type: 'extension' }, WATCHED);
}

function spend(spent: Readonly<Record<string, number>>): unknown {
  return runOn(PLACED, CONTENT, spendActionsDraft({ spent, unit: 'archers-1' })).events.map(({ payload }) => payload);
}

function tired(
  sideEffects: ReadonlyArray<readonly string[]>,
  unitEffects: ReadonlyArray<readonly string[]> = [[], []],
): ContentRegistry {
  const archer = CONTENT.creatures['demo:archer'];
  const pikeman = CONTENT.creatures['demo:pikeman'];

  if (archer === undefined || pikeman === undefined) throw new Error('No creatures');

  const sides = SCENARIO.sides.map((side, index) => ({
    ...side,
    effects: sideEffects[index] ?? [],
    units: side.units.map((unit) => ({ ...unit, effects: unitEffects[index] ?? [] })),
  }));

  return {
    ...withScenario({ outcomes: [], sides }),
    creatures: {
      'demo:archer': { ...archer, attributes: { ...archer.attributes, 'core:action': 0 } },
      'demo:pikeman': { ...pikeman, attributes: { ...pikeman.attributes, 'core:action': 0 } },
    },
  };
}
