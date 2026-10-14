import { describe, expect, it } from 'vitest';
import { ContentError } from '../../content/index.ts';
import type { AppliedEffect, BattleState } from '../../model/index.ts';
import { applied, effect, node, unitOf } from '../../tests/fixtures.ts';
import { applicationDraft, removalDraft } from '../index.ts';
import {
  AFTER_ROUND_5,
  ARCHERS,
  ATTACKER,
  contentWith,
  mark,
  PIKEMEN,
  run,
  BARE_STATE,
  tagsOf,
  types,
  variables,
  withUnitEffects,
} from './helpers.ts';

describe('applying an effect', () => {
  it('stores it with the next number, its duration, strength, parameters and visibility and runs operations', () => {
    const content = contentWith(effect('acme:curse', {
      grantsTags: ['Debuff.Curse'],
      onApply: [mark('level', node('kernel:effect-param', { param: 'level' }))],
      strength: 5,
      visibility: 'owner',
    }));
    const result = run(BARE_STATE, content, applicationDraft({
      effect: 'acme:curse',
      holder: PIKEMEN,
      params: { level: 2 },
      source: ARCHERS,
    }));
    const pikemen = unitOf(result.state, 'pikemen-1');

    expect(types(result)).toStrictEqual(['kernel:effect-applied', 'kernel:variable-set']);

    expect(pikemen.effects).toStrictEqual([{
      active: true,
      effect: 'acme:curse',
      id: 8,
      params: { level: 2 },
      remaining: 2,
      sourceUnit: 'archers-1',
      stacks: 1,
      strength: 5,
      visibleTo: ['defender'],
    }]);

    expect(pikemen.tags).toStrictEqual({});
    expect(tagsOf(result.state, content, 'pikemen-1')).toStrictEqual({ 'Creature.Human': 1, 'Debuff.Curse': 1 });
    expect(result.state.nextId).toBe(9);
    expect(result.state.variables.level).toBe(2);
    expect(result.events[0]?.visibleTo).toStrictEqual(['defender']);
  });

  it('tells why an effect is not applied: immunity, the condition or the mode of stacking', () => {
    const content = contentWith(
      effect('acme:poison', { blockedBy: ['Creature'], visibility: 'owner' }),
      effect('acme:late', { condition: AFTER_ROUND_5 }),
      effect('acme:once', { stacking: 'ignore' }),
    );

    function reason(name: string, state: BattleState = BARE_STATE): unknown {
      const result = run(state, content, applicationDraft({ effect: name, holder: PIKEMEN }));

      return result.events.map(({ payload, type, visibleTo }) => [type, payload, visibleTo]);
    }

    expect(reason('acme:poison')).toStrictEqual([[
      'kernel:effect-not-applied',
      { effect: 'acme:poison', holder: PIKEMEN, reason: 'immune' },
      ['defender'],
    ]]);

    expect(reason('acme:late')).toMatchObject([['kernel:effect-not-applied', { reason: 'condition' }, 'all']]);

    expect(reason('acme:once', withUnitEffects(BARE_STATE, 'pikemen-1', [applied(7, 'acme:once')])))
      .toMatchObject([['kernel:effect-not-applied', { reason: 'stacking' }, 'all']]);
  });

  it('checks immunity by the tags of the creature and of every effect acting on the unit', () => {
    const content = contentWith(
      effect('acme:fear', { blockedBy: ['Immunity.Mind.Fear'] }),
      effect('acme:banner', { duration: { kind: 'battle' }, grantsTags: ['Immunity.Mind'] }),
    );
    const sides = BARE_STATE.sides.map((side) => ({ ...side, effects: [applied(6, 'acme:banner')] }));
    const state = { ...BARE_STATE, sides };
    const result = run(state, content, applicationDraft({ effect: 'acme:fear', holder: PIKEMEN }));

    expect(types(result)).toStrictEqual(['kernel:effect-not-applied']);
  });

  it('removes effects by tags and runs the operations of an instant effect, which stays nowhere', () => {
    const content = contentWith(
      effect('acme:flash', { duration: { kind: 'instant' }, onApply: [mark('flash')], removes: ['Debuff'] }),
      effect('acme:poison', { tags: ['Debuff.Poison'] }),
    );
    const state = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(7, 'acme:poison')]);
    const result = run(state, content, applicationDraft({ effect: 'acme:flash', holder: PIKEMEN }));

    expect(types(result)).toStrictEqual(['kernel:effect-removed', 'kernel:variable-set']);
    expect(unitOf(result.state, 'pikemen-1').effects).toStrictEqual([]);
  });

  it('applies to a side, the field and a hazard zone, which have no mark of activity of their own', () => {
    const forUnits = node('kernel:has-tag', { of: 'target', tag: 'Creature' });
    const content = contentWith(effect('acme:fog', {
      activeWhile: forUnits,
      duration: { count: 2, kind: 'rounds', tick: 'round-end' },
      visibility: 'owner',
    }));
    const side = run(BARE_STATE, content, applicationDraft({ effect: 'acme:fog', holder: ATTACKER }));
    const field = run(BARE_STATE, content, applicationDraft({ effect: 'acme:fog', holder: { kind: 'field' } }));
    const hazard = run(BARE_STATE, content, applicationDraft({ effect: 'acme:fog', holder: SWAMP }));

    expect(side.state.sides[0]?.effects[0]).toMatchObject({ active: true, visibleTo: ['attacker'] });
    expect(field.state.field.effects[0]?.visibleTo).toStrictEqual([]);
    expect(hazard.state.field.hazards[0]?.effects.at(-1)?.effect).toBe('acme:fog');
  });

  it('evaluates the condition of activity with the source of the effect', () => {
    const content = contentWith(effect('acme:loyal', {
      activeWhile: node('kernel:has-tag', { of: 'source', tag: 'Creature.Human' }),
    }));
    const draft = applicationDraft({ effect: 'acme:loyal', holder: PIKEMEN, source: ARCHERS });
    const result = run(BARE_STATE, content, draft);

    expect(types(result)).toStrictEqual(['kernel:effect-applied']);
    expect(unitOf(result.state, 'pikemen-1').effects[0]?.active).toBe(true);
  });

  it('treats a definition that cannot be applied as an error of the content', () => {
    const content = contentWith(
      effect('acme:instant', { duration: { kind: 'instant' }, modifiers: [SPEED_PLUS_1] }),
      effect('acme:empty', { duration: { count: 0, kind: 'turns', tick: 'holder-turn-start' } }),
      effect('acme:turns', { duration: { count: 2, kind: 'turns', tick: 'holder-turn-start' } }),
      effect('acme:capped', { maxStacks: 0 }),
      { ...effect('acme:odd'), stacking: 'sometimes' as 'stack' },
    );
    const odd = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(7, 'acme:odd')]);

    expect(() => run(odd, content, applicationDraft({ effect: 'acme:odd', holder: PIKEMEN }))).toThrow(ContentError);

    function apply(name: string, holder: Parameters<typeof applicationDraft>[0]['holder'] = PIKEMEN): unknown {
      return run(BARE_STATE, content, applicationDraft({ effect: name, holder }));
    }

    expect(() => apply('acme:instant')).toThrow(ContentError);
    expect(() => apply('acme:instant')).toThrow('is instant, but has modifiers, which it never uses');
    expect(() => apply('acme:empty')).toThrow('needs a counted duration from 1');
    expect(() => apply('acme:turns', { kind: 'field' })).toThrow('counts its duration only at round-end');
    expect(() => apply('acme:capped')).toThrow('needs a whole number from 1 in maxStacks');
    expect(() => apply('acme:none')).toThrow('The content has no effect "acme:none".');
    expect(() => apply('acme:turns', { kind: 'unit', unit: 'ghost' })).toThrow('The battle has no unit "ghost".');
    expect(() => apply('acme:turns', { kind: 'unit', unit: 'ghost' })).not.toThrow(ContentError);
  });
});

describe('the parameters of an application', () => {
  const power = node('kernel:effect-param', { param: 'power' });
  const content = contentWith(
    effect('acme:bolt', { duration: { kind: 'instant' }, onApply: [mark('damage', power)] }),
    effect('acme:charm', { condition: node('kernel:compare', { left: power, operator: '>', right: 2 }) }),
    effect('acme:ward', { stacking: 'strongest', strength: power }),
  );

  function apply(name: string, value: number, state = BARE_STATE): ReturnType<typeof run> {
    return run(state, content, applicationDraft({ effect: name, holder: PIKEMEN, params: { power: value } }));
  }

  it('reach the operations of an instant effect, the condition of application and the strength', () => {
    const ward = applied(7, 'acme:ward', { strength: 3 });
    const warded = withUnitEffects({ ...BARE_STATE, nextId: 20 }, 'pikemen-1', [ward]);

    expect(apply('acme:bolt', 7).state.variables.damage).toBe(7);
    expect(types(apply('acme:charm', 2))).toStrictEqual(['kernel:effect-not-applied']);
    expect(types(apply('acme:charm', 3))).toStrictEqual(['kernel:effect-applied']);
    expect(unitOf(apply('acme:ward', 5, warded).state, 'pikemen-1').effects).toMatchObject([{ id: 20, strength: 5 }]);
    expect(types(apply('acme:ward', 3, warded))).toStrictEqual(['kernel:effect-not-applied']);
  });
});

describe('applying an effect again', () => {
  it.each([
    { expected: [applied(7, 'acme:a', { remaining: 2, sourceUnit: 'archers-1' })], stacking: 'refresh' },
    { expected: [applied(7, 'acme:a', { remaining: 2, sourceUnit: 'archers-1', stacks: 2 })], stacking: 'stack' },
  ] as const)('with $stacking keeps one effect and takes the new source', ({ expected, stacking }) => {
    const content = contentWith(effect('acme:a', { stacking }));
    const draft = applicationDraft({ effect: 'acme:a', holder: PIKEMEN, source: ARCHERS });
    const result = run(existing('acme:a'), content, draft);

    expect(unitOf(result.state, 'pikemen-1').effects).toStrictEqual(expected);
  });

  it('tells that it is not applied when a refresh or a full stack changes nothing', () => {
    const content = contentWith(
      effect('acme:aura', { duration: { kind: 'battle' }, stacking: 'refresh' }),
      effect('acme:rage', { duration: { kind: 'battle' }, maxStacks: 2 }),
    );
    const effects = [applied(7, 'acme:aura'), applied(8, 'acme:rage', { stacks: 2 })];
    const state = withUnitEffects(BARE_STATE, 'pikemen-1', effects);

    for (const name of ['acme:aura', 'acme:rage']) {
      const result = run(state, content, applicationDraft({ effect: name, holder: PIKEMEN }));

      expect(result.events.map(({ payload, type }) => [type, payload]))
        .toMatchObject([['kernel:effect-not-applied', { reason: 'stacking' }]]);
    }
  });

  it('with stack runs the operations of every new stack up to the largest number of stacks', () => {
    const onApply = [mark('stacks', node('kernel:effect-stacks'))];
    const content = contentWith(effect('acme:a', { maxStacks: 2, onApply }));
    const draft = applicationDraft({ effect: 'acme:a', holder: PIKEMEN });
    const second = run(existing('acme:a'), content, draft);
    const third = run(second.state, content, draft);

    expect(variables(second)).toStrictEqual([{ value: 2, variable: 'stacks' }]);
    expect(unitOf(third.state, 'pikemen-1').effects[0]).toMatchObject({ remaining: 2, stacks: 2 });
    expect(variables(third)).toStrictEqual([]);
  });

  it('with replace removes the old effect with its operations and keeps the tags it gives', () => {
    const content = contentWith(effect('acme:a', {
      grantsTags: ['Buff.A'],
      onApply: [mark('applied')],
      onRemove: [mark('removed', node('kernel:effect-param', { default: 0, param: 'power' }))],
      stacking: 'replace',
    }));
    const old = existing('acme:a', { params: { power: 4 } });
    const result = run(old, content, applicationDraft({ effect: 'acme:a', holder: PIKEMEN }));
    const removed = run(result.state, content, removalDraft({ effect: 20, holder: PIKEMEN }));

    expect(types(result)).toStrictEqual([
      'kernel:effect-removed',
      'kernel:effect-applied',
      'kernel:variable-set',
      'kernel:variable-set',
    ]);

    expect(unitOf(result.state, 'pikemen-1').effects.map(({ id }) => id)).toStrictEqual([20]);
    expect(result.state.variables).toMatchObject({ applied: true, removed: 4 });
    expect(tagsOf(result.state, content, 'pikemen-1')).toMatchObject({ 'Buff.A': 1 });
    expect(tagsOf(removed.state, content, 'pikemen-1')).toStrictEqual({ 'Creature.Human': 1 });
  });

  it('with strongest replaces only a weaker effect and evaluates the strength only then', () => {
    const roll = node('kernel:dice', { count: 1, name: 'core:damage-roll', sides: 6 });
    const content = contentWith(
      effect('acme:a', { stacking: 'strongest', strength: 3 }),
      effect('acme:lucky', { stacking: 'refresh', strength: roll }),
    );

    function ids(strength: number): readonly number[] {
      const draft = applicationDraft({ effect: 'acme:a', holder: PIKEMEN });
      const result = run(existing('acme:a', { strength }), content, draft);

      return unitOf(result.state, 'pikemen-1').effects.map(({ id }) => id);
    }

    expect(ids(2)).toStrictEqual([20]);
    expect(ids(3)).toStrictEqual([7]);

    expect(types(run(existing('acme:lucky'), content, applicationDraft({ effect: 'acme:lucky', holder: PIKEMEN }))))
      .toStrictEqual(['kernel:effect-changed']);
  });

  it('removes the effects the new one removes by tags, also when it only refreshes', () => {
    const content = contentWith(
      effect('acme:poison', { onRemove: [mark('cured')], tags: ['Debuff.Poison'] }),
      effect('acme:shield', { tags: ['Buff.Shield'] }),
      effect('acme:cleanse', { removes: ['Debuff'], stacking: 'refresh' }),
    );
    const state = withUnitEffects({ ...BARE_STATE, nextId: 20 }, 'pikemen-1', [
      applied(7, 'acme:poison'),
      applied(8, 'acme:shield'),
      applied(9, 'acme:cleanse'),
    ]);
    const result = run(state, content, applicationDraft({ effect: 'acme:cleanse', holder: PIKEMEN }));

    expect(unitOf(result.state, 'pikemen-1').effects.map(({ effect: name }) => name))
      .toStrictEqual(['acme:shield', 'acme:cleanse']);

    expect(result.state.variables.cured).toBe(true);
  });
});

describe('removing an effect', () => {
  it('runs its operations with the effect as it was and leaves a gone effect alone', () => {
    const content = contentWith(effect('acme:curse', { onRemove: [mark('stacks', node('kernel:effect-stacks'))] }));
    const state = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(8, 'acme:curse', { stacks: 3 })]);
    const lifted = run(state, content, removalDraft({ effect: 8, holder: PIKEMEN }));

    expect(types(lifted)).toStrictEqual(['kernel:effect-removed', 'kernel:variable-set']);
    expect(lifted.state.variables.stacks).toBe(3);
    expect(types(run(lifted.state, content, removalDraft({ effect: 8, holder: PIKEMEN })))).toStrictEqual([]);
  });
});

const SWAMP = { hazard: 'swamp', kind: 'hazard' } as const;

const SPEED_PLUS_1 = { attribute: 'core:speed', operation: 'add', value: 1 } as const;

function existing(name: string, extra: Partial<AppliedEffect> = {}): BattleState {
  return withUnitEffects({ ...BARE_STATE, nextId: 20 }, 'pikemen-1', [applied(7, name, { remaining: 1, ...extra })]);
}
