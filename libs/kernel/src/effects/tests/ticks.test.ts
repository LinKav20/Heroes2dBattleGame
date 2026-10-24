import { describe, expect, it } from 'vitest';
import type { BattleState, Unit } from '../../model/index.ts';
import {
  contentWith,
  markOp,
  PIKEMEN,
  run,
  BARE_STATE,
  withUnitEffects,
} from '../../tests/battle.ts';
import { applied, CONTENT, effect, node, unitOf } from '../../tests/fixtures.ts';
import { tickDraft } from '../index.ts';

describe('ticks of effects', () => {
  const content = contentWith(
    effect('acme:bleed', { onTurn: [markOp('bled')] }),
    effect('acme:glow', { duration: { kind: 'battle' }, onTurn: [markOp('glowed')] }),
    effect('acme:slow', { duration: { count: 1, kind: 'rounds', tick: 'round-end' } }),
    effect('acme:sleep', {
      activeWhile: false,
      duration: { count: 3, kind: 'turns', tick: 'holder-turn-start' },
      onTurn: [markOp('snored')],
    }),
    effect('acme:cure', {
      duration: { kind: 'battle' },
      onTurn: [node('kernel:remove-effects', { from: 'self', tags: ['Debuff'] })],
    }),
    effect('acme:poison', { duration: { kind: 'battle' }, onTurn: [markOp('poisoned')], tags: ['Debuff.Poison'] }),
    effect('acme:regen', { duration: { kind: 'battle' }, onTurn: [markOp('regenerated')] }),
    effect('acme:rain', { duration: { kind: 'battle' }, onTurn: [markOp('rained')] }),
    effect('acme:fade', {
      duration: { count: 3, kind: 'turns', tick: 'holder-turn-end' },
      onTurn: [markOp('faded')],
    }),
    effect('acme:doom', {
      duration: { kind: 'battle' },
      onTurn: [node('kernel:damage', { amount: 1000, to: 'self' })],
    }),
  );

  it('count down at the start of the turn, run the operations of every turn and end at 0', () => {
    const state = withUnitEffects(BARE_STATE, 'pikemen-1', [
      applied(5, 'acme:bleed', { remaining: 2 }),
      applied(6, 'acme:glow'),
      applied(7, 'acme:sleep', { active: false, remaining: 3 }),
    ]);
    const first = run(state, content, tickDraft({ holder: PIKEMEN, moment: 'holder-turn-start' }));
    const second = run(first.state, content, tickDraft({ holder: PIKEMEN, moment: 'holder-turn-start' }));

    expect(unitOf(first.state, 'pikemen-1').effects.map(({ remaining }) => remaining)).toStrictEqual([1, undefined, 2]);
    expect(first.state.variables).toMatchObject({ bled: true, glowed: true });
    expect('snored' in first.state.variables).toBe(false);

    expect(unitOf(second.state, 'pikemen-1').effects.map(({ effect: name }) => name))
      .toStrictEqual(['acme:glow', 'acme:sleep']);
  });

  it('count down effects that tick at the end of a round on every holder and run the turn of the field', () => {
    const state = {
      ...withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:slow', { remaining: 1 })]),
      field: { ...BARE_STATE.field, effects: [applied(6, 'acme:slow', { remaining: 2 }), applied(7, 'acme:rain')] },
    };
    const result = run(state, content, tickDraft({ moment: 'round-end' }));
    const turn = run(state, content, tickDraft({ holder: PIKEMEN, moment: 'holder-turn-start' }));

    expect(unitOf(result.state, 'pikemen-1').effects).toStrictEqual([]);
    expect(result.state.field.effects.map(({ remaining }) => remaining)).toStrictEqual([1, undefined]);
    expect(result.state.variables.rained).toBe(true);
    expect('rained' in turn.state.variables).toBe(false);
  });

  it('leave the effects of a dead unit alone at the end of a round until the unit comes back', () => {
    const effects = [applied(5, 'acme:slow', { remaining: 1 }), applied(6, 'acme:glow')];
    const dead = withUnitEffects(withPikemen({ count: 0, health: 0 }), 'pikemen-1', effects);
    const back = withUnitEffects(withPikemen({ count: 1, health: 10 }), 'pikemen-1', effects);
    const field = { ...BARE_STATE.field, effects: [applied(7, 'acme:rain')] };
    const lying = run({ ...dead, field }, content, tickDraft({ moment: 'round-end' }));
    const risen = run(back, content, tickDraft({ moment: 'round-end' }));

    expect(unitOf(lying.state, 'pikemen-1').effects).toStrictEqual(effects);
    expect(lying.state.variables.rained).toBe(true);
    expect(unitOf(risen.state, 'pikemen-1').effects.map(({ effect: name }) => name)).toStrictEqual(['acme:glow']);
  });

  it('leave the effects of a unit that died in its own turn alone at the start and the end of the turn', () => {
    const effects = [applied(5, 'acme:fade', { remaining: 3 }), applied(6, 'acme:bleed')];
    const dead = withUnitEffects(withPikemen({ count: 0, health: 0 }), 'pikemen-1', effects);
    const ended = run(dead, content, tickDraft({ holder: PIKEMEN, moment: 'holder-turn-end' }));
    const started = run(dead, content, tickDraft({ holder: PIKEMEN, moment: 'holder-turn-start' }));

    expect(ended.events).toStrictEqual([]);
    expect(started.events).toStrictEqual([]);
  });

  it('stop the operations of every turn of a unit that an earlier effect of the same turn killed', () => {
    const state = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:doom'), applied(6, 'acme:regen')]);
    const result = run(state, content, tickDraft({ holder: PIKEMEN, moment: 'holder-turn-start' }));

    expect(unitOf(result.state, 'pikemen-1').count).toBe(0);
    expect('regenerated' in result.state.variables).toBe(false);
  });

  it('skip the operations of an effect removed earlier in the same tick', () => {
    const state = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:cure'), applied(6, 'acme:poison')]);
    const result = run(state, content, tickDraft({ holder: PIKEMEN, moment: 'holder-turn-start' }));

    expect(unitOf(result.state, 'pikemen-1').effects.map(({ effect: name }) => name)).toStrictEqual(['acme:cure']);
    expect('poisoned' in result.state.variables).toBe(false);
  });

  it('run the operations of every turn of the effects of the creature and of the battlefield', () => {
    const pikeman = CONTENT.creatures['demo:pikeman'];
    const withDefinitions = {
      ...content,
      battlefields: { 'demo:meadow': { effects: ['acme:rain'], name: 'demo:meadow' } },
      creatures: {
        ...content.creatures,
        ...(pikeman === undefined ? {} : { 'demo:pikeman': { ...pikeman, effects: ['acme:regen'] } }),
      },
    };
    const state = { ...BARE_STATE, field: { ...BARE_STATE.field, battlefield: 'demo:meadow' } };
    const turn = run(state, withDefinitions, tickDraft({ holder: PIKEMEN, moment: 'holder-turn-start' }));
    const round = run(state, withDefinitions, tickDraft({ moment: 'round-end' }));

    expect(turn.state.variables).toMatchObject({ regenerated: true });
    expect('rained' in turn.state.variables).toBe(false);
    expect(round.state.variables).toMatchObject({ rained: true });
    expect('regenerated' in round.state.variables).toBe(false);
  });
});

function withPikemen(change: Partial<Unit>): BattleState {
  const units = BARE_STATE.units.map((unit) => (unit.id === 'pikemen-1' ? { ...unit, ...change } : unit));

  return { ...BARE_STATE, units };
}
