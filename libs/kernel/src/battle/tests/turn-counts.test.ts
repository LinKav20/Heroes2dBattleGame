import { describe, expect, it } from 'vitest';
import { applicationDraft, ReactionIndex } from '../../effects/index.ts';
import { AttributeCache } from '../../expressions/index.ts';
import type { DefenseVariant, MechanicContext } from '../../extensions/index.ts';
import { FieldCache } from '../../geometry/index.ts';
import type { BattleState, GameCommand, UnitHolder } from '../../model/index.ts';
import { operationDrafts } from '../../operations/index.ts';
import { asRecord, node, unitOf } from '../../tests/fixtures.ts';
import { runDrafts } from '../../tests/run-drafts.ts';
import { spendActionsDraft, turnCheckDraft } from '../index.ts';
import {
  battleWith,
  BRACE,
  CONTENT,
  endTurn,
  KERNEL,
  kernelWith,
  mark,
  move,
  ORDER,
  play,
  reason,
  RULESET,
  SCENARIO,
  SIDES,
  startWith,
  value,
  variant,
  withArchers,
  withScenario,
} from './helpers.ts';

describe('the counts of turns', () => {
  it('count nothing again in another turn of the same holder in the round, which only gives the actions back', () => {
    const twice = variant('acme:twice', { next: ({ state }) => value(state.turns.length < 2 ? ARCHERS : undefined) });
    const { content, kernel, state } = battleWith(twice, withArchers(['demo:poison', 'demo:steady']));
    const used = withUses(state, { ability: 'demo:shot', battle: 1, cooldown: 2, round: 1, turn: 1 });
    const extra = play(used, move('archers-1', '1,1'), content, kernel).state;
    const next = play(extra, endTurn('archers-1'), content, kernel).state;

    expect(remainingOf(used, 'demo:poison')).toBe(1);
    expect(unitOf(extra, 'archers-1')).toMatchObject({ health: 9, spentActions: {} });
    expect(unitOf(extra, 'archers-1').abilityUses).toStrictEqual(unitOf(used, 'archers-1').abilityUses);
    expect(remainingOf(extra, 'demo:poison')).toBe(1);
    expect(remainingOf(extra, 'demo:steady')).toBe(2);
    expect(next.round).toBe(2);
    expect(remainingOf(next, 'demo:steady')).toBe(2);
    expect(remainingOf(next, 'demo:poison')).toBeUndefined();

    expect(unitOf(next, 'archers-1').abilityUses).toStrictEqual([
      { ability: 'demo:shot', battle: 1, cooldown: 1, round: 0, turn: 0 },
    ]);
  });

  it('count the end of a turn put off by waiting only when the turn goes on and ends', () => {
    const { content, kernel, state } = battleWith(ORDER, withArchers(['demo:poison', 'demo:steady']));
    const waited = play(state, { kind: 'game', type: 'wait', unit: 'archers-1' }, content, kernel).state;
    const back = play(waited, endTurn('pikemen-1'), content, kernel).state;
    const ended = play(back, endTurn('archers-1'), content, kernel).state;

    expect(remainingOf(state, 'demo:steady')).toBe(3);
    expect(remainingOf(waited, 'demo:steady')).toBe(3);
    expect(back.phase).toStrictEqual({ kind: 'turn', side: 'attacker', unit: 'archers-1' });
    expect(remainingOf(back, 'demo:poison')).toBe(1);
    expect(unitOf(back, 'archers-1').health).toBe(9);
    expect(remainingOf(ended, 'demo:steady')).toBe(2);
    expect(ended.round).toBe(2);
  });

  it('let the hooks of the order of turns see the state after the steps of the kernel of the same moment', () => {
    const observer = variant('acme:observer', {
      roundEnd: ({ state }) => [mark('dazed-at-round-end', countOf(state, 'pikemen-1', 'demo:dazed'))],
      roundStart: ({ state }) => [mark('round-uses', unitOf(state, 'archers-1').abilityUses[0]?.round ?? -1)],
      turnEnd: ({ state }) => [mark('records-at-end', state.turns.length)],
      turnStart: (context, holder) => [mark('poison-at-start', poisonOf(context, holder))],
    });
    const dazed = {
      ...withArchers(['demo:poison']),
      sides: (withArchers(['demo:poison']).sides ?? []).map((side) => (side.id === 'defender'
        ? { ...side, units: side.units.map((unit) => ({ ...unit, effects: ['demo:dazed'] })) }
        : side)),
    };
    const { content, kernel, state } = battleWith(observer, dazed);
    const used = withUses(state, { ability: 'demo:shot', battle: 1, cooldown: 0, round: 1, turn: 1 });
    const ended = play(used, endTurn('archers-1'), content, kernel).state;

    expect(state.variables['poison-at-start']).toBe(1);
    expect(ended.variables['records-at-end']).toBe(2);
    expect(ended.variables['dazed-at-round-end']).toBe(0);
    expect(ended.variables['round-uses']).toBe(0);
    expect(ended.round).toBe(2);
  });

  it('check the outcomes after the steps of a hook, before anybody gets the next turn', () => {
    const fatal = variant('acme:fatal', {
      turnEnd: (context, holder) => (holder.kind === 'unit' && holder.unit === 'archers-1'
        ? operationDrafts([node('kernel:damage', { amount: 1000, to: 'target' })], { subjects: { target: PIKEMEN } })
        : []),
    });
    const { content, kernel, state } = battleWith(fatal);
    const ended = play(state, endTurn('archers-1'), content, kernel);

    expect(asRecord(ended.state.phase).outcome).toMatchObject({ condition: 'rout', kind: 'victory' });
    expect(ended.events.filter(({ type }) => type === 'kernel:phase-changed')).toStrictEqual([]);
  });
});

describe('ending a turn by a command', () => {
  it('lets a defense end the turn after its steps, even with actions left', () => {
    const holding: DefenseVariant = {
      ...BRACE,
      defend: () => ({ endsTurn: true, kind: 'steps', steps: [mark('held')] }),
    };
    const { content, kernel, state } = guarded(holding);
    const held = play(state, DEFEND, content, kernel);

    expect(held.events.map(({ type }) => type).slice(0, 2)).toStrictEqual(['kernel:variable-set', 'kernel:turn-ended']);
    expect(unitOf(held.state, 'archers-1').spentActions).toStrictEqual({});
    expect(held.state.phase).toStrictEqual({ kind: 'turn', side: 'defender', unit: 'pikemen-1' });
  });

  it('ends the turn after the rest of the command when a step of the command asks to end it', () => {
    const early: DefenseVariant = {
      ...BRACE,
      defend: (context, unit) => ({
        kind: 'steps',
        steps: [
          turnCheckDraft({ end: true }),
          applicationDraft({ effect: 'demo:steady', holder: { kind: 'unit', unit } }),
        ],
      }),
    };
    const { content, kernel, state } = guarded(early);
    const types = play(state, DEFEND, content, kernel).events.map(({ type }) => type);

    expect(types.indexOf('kernel:effect-applied')).toBeLessThan(types.indexOf('kernel:turn-ended'));
    expect(types.filter((type) => type === 'kernel:turn-ended')).toHaveLength(1);
  });

  it('does not let a unit spend more actions than it has left, nor defend without any', () => {
    const over = runDrafts(KERNEL.registries, caches(), placedState(), [
      spendActionsDraft({ spent: { 'core:action': 2 }, unit: 'archers-1' }),
    ], CONTENT);
    const two = SCENARIO.sides.map((side) => (side.id === 'attacker'
      ? { ...side, units: [...side.units, { ...side.units[0], cell: '0,0', id: 'archers-2', items: [] }] }
      : side));
    const sides = withScenario({ sides: two as typeof SCENARIO.sides }, {
      mechanics: {
        ...RULESET.mechanics,
        'kernel:defense': { variant: 'acme:brace' },
        'kernel:turn-order': { variant: 'acme:sides-in-turn' },
      },
      turnOwner: 'side',
    });
    const moved = play(startWith(KERNEL, sides), move('archers-1', '1,1'), sides).state;

    expect(reason(over)).toStrictEqual(['kernel:not-enough-actions', { action: 'core:action' }]);
    expect(moved.phase).toStrictEqual({ kind: 'turn', side: 'attacker' });

    expect(reason(KERNEL.execute(moved, DEFEND, sides))).toStrictEqual([
      'kernel:not-enough-actions',
      { action: 'core:action' },
    ]);
  });

  it('does not put the turn off when the rest of a wait is aborted after an answer', () => {
    const shaky = variant('acme:shaky', {
      wait: () => ({ kind: 'steps', steps: [{ params: {}, type: 'acme:ask' }, { params: {}, type: 'acme:fail' }] }),
    });
    const external = { randomSources: { 'core:morale': 'external' as const } };
    const { content, kernel, state } = battleWith(shaky, {}, external);
    const asked = play(state, { kind: 'game', type: 'wait', unit: 'archers-1' }, content, kernel).state;
    const answered = play(asked, { kind: 'answer', request: 1, value: { dice: [3], kind: 'roll' } }, content, kernel);

    expect(answered.events.map(({ type }) => type)).toContain('kernel:command-aborted');
    expect(answered.state.turns).toStrictEqual([]);
    expect(answered.state.phase).toStrictEqual({ kind: 'turn', side: 'attacker', unit: 'archers-1' });
  });
});

describe('a round in which nobody can act', () => {
  it('goes on while a duration that could change it counts down, and ends in a draw once nothing can', () => {
    const { content, kernel, state } = battleWith(ORDER, stuck(['demo:dazed']));
    const frozen = battleWith(ORDER, stuck(['demo:frozen'])).state;

    expect(state.round).toBe(2);
    expect(state.phase).toStrictEqual({ kind: 'turn', side: 'attacker', unit: 'archers-1' });
    expect(asRecord(frozen.phase).outcome).toStrictEqual({ kind: 'draw', winners: [] });

    expect(play(state, endTurn('archers-1'), content, kernel).state.phase)
      .toStrictEqual({ kind: 'turn', side: 'defender', unit: 'pikemen-1' });
  });

  it('starts the turn of a side with many units on the field without filling the stack', () => {
    const defenders = Array.from({ length: 150 }, (unused, index) => ({
      cell: `${String(5 + (index % 15))},${String(Math.floor(index / 15))}`,
      count: 1,
      creature: 'demo:pikeman',
      effects: ['demo:poison'],
      id: `pikemen-${String(index + 1)}`,
      items: [],
      visibleTo: 'all' as const,
    }));
    const sides = SCENARIO.sides.map((side) => (side.id === 'attacker'
      ? { ...side, units: side.units.map((unit) => ({ ...unit, cell: '0,1' })) }
      : { ...side, deploymentZone: [], units: defenders }));
    const field = { ...SCENARIO.field, hazards: [], params: { height: 10, width: 20 } };
    const content = withScenario({ field, sides }, {
      mechanics: { 'kernel:turn-order': { variant: 'acme:sides-in-turn' } },
      turnOwner: 'side',
    });
    const kernel = kernelWith(SIDES);
    const started = play(kernel.createState({ scenario: 'demo:duel' }, content), START, content, kernel).state;
    const passed = play(started, { kind: 'game', side: 'attacker', type: 'end-turn' }, content, kernel).state;

    expect(passed.phase).toStrictEqual({ kind: 'turn', side: 'defender' });
    expect(passed.units.filter(({ health }) => health === 9)).toHaveLength(150);
  });
});

const ARCHERS: UnitHolder = { kind: 'unit', unit: 'archers-1' };

const PIKEMEN: UnitHolder = { kind: 'unit', unit: 'pikemen-1' };

const DEFEND: GameCommand = { kind: 'game', type: 'defend', unit: 'archers-1' };

const START: GameCommand = { kind: 'game', type: 'start-battle' };

function placedState(): BattleState {
  return startWith(KERNEL, CONTENT);
}

function guarded(defense: DefenseVariant): ReturnType<typeof battleWith> {
  const kernel = kernelWith(ORDER, { ...defense, name: 'acme:guard' });
  const mechanics = { ...RULESET.mechanics, 'kernel:defense': { variant: 'acme:guard' } };
  const content = withScenario({}, { mechanics });

  return { content, kernel, state: startWith(kernel, content) };
}

function stuck(effects: readonly string[]): Parameters<typeof battleWith>[1] {
  const sides = SCENARIO.sides.map((side) => ({ ...side, units: side.units.map((unit) => ({ ...unit, effects })) }));

  return { sides };
}

function withUses(state: BattleState, use: BattleState['units'][number]['abilityUses'][number]): BattleState {
  return {
    ...state,
    units: state.units.map((unit) => (unit.id === 'archers-1' ? { ...unit, abilityUses: [use] } : unit)),
  };
}

function remainingOf(state: BattleState, effect: string): number | undefined {
  return unitOf(state, 'archers-1').effects.find((one) => one.effect === effect)?.remaining;
}

function countOf(state: BattleState, unit: string, effect: string): number {
  return unitOf(state, unit).effects.filter((one) => one.effect === effect).length;
}

function poisonOf(context: MechanicContext, holder: UnitHolder | { readonly kind: 'side' }): number {
  return holder.kind === 'unit'
    ? unitOf(context.state, holder.unit).effects.find(({ effect }) => effect === 'demo:poison')
      ?.remaining ?? 0
    : 0;
}

function caches(): Parameters<typeof runDrafts>[1] {
  return { attributes: new AttributeCache(), fields: new FieldCache(), reactions: new ReactionIndex() };
}
