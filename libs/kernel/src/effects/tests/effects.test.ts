import { describe, expect, it } from 'vitest';
import type { AppliedEffect } from '../../model/index.ts';
import { applicationDraft, operationDrafts, removalDraft, tickDraft } from '../index.ts';
import {
  applied,
  ARCHERS,
  contentWith,
  effect,
  KERNEL,
  mark,
  node,
  PIKEMEN,
  run,
  runSteps,
  STATE,
  types,
  unitOf,
  withUnitEffects,
} from './helpers.ts';

describe('applying an effect', () => {
  it('stores it with the next identifier, its duration, strength and visibility and runs its operations', () => {
    const content = contentWith(effect('acme:curse', {
      grantsTags: ['Debuff.Curse'],
      onApply: [mark('cursed')],
      strength: 5,
      visibility: 'owner',
    }));
    const result = run(STATE, content, applicationDraft({
      effect: 'acme:curse',
      holder: PIKEMEN,
      params: { level: 2 },
      source: ARCHERS,
    }));
    const pikemen = unitOf(result.state, 'pikemen-1');

    expect(types(result)).toStrictEqual(['kernel:effect-applied', 'kernel:tags-changed', 'kernel:variable-set']);

    expect(pikemen.effects).toStrictEqual([{
      active: true,
      effect: 'acme:curse',
      id: 8,
      params: { level: 2, strength: 5 },
      remaining: 2,
      sourceUnit: 'archers-1',
      stacks: 1,
      visibleTo: ['defender'],
    }]);

    expect(pikemen.tags).toStrictEqual({ 'Creature.Human': 1, 'Debuff.Curse': 1 });
    expect(result.state.nextId).toBe(9);
    expect(result.state.variables.cursed).toBe(true);
    expect(result.events[0]?.visibleTo).toStrictEqual(['defender']);
  });

  it('skips a holder that is immune or an effect whose condition does not hold', () => {
    const content = contentWith(
      effect('acme:poison', { blockedBy: ['Creature'] }),
      effect('acme:late', { condition: AFTER_ROUND_5 }),
    );

    expect(types(run(STATE, content, applicationDraft({ effect: 'acme:poison', holder: PIKEMEN })))).toStrictEqual([]);
    expect(types(run(STATE, content, applicationDraft({ effect: 'acme:late', holder: PIKEMEN })))).toStrictEqual([]);
  });

  it('only runs the operations of an instant effect', () => {
    const content = contentWith(effect('acme:flash', { duration: { kind: 'instant' }, onApply: [mark('flash')] }));
    const result = run(STATE, content, applicationDraft({ effect: 'acme:flash', holder: PIKEMEN }));

    expect(types(result)).toStrictEqual(['kernel:variable-set']);
    expect(unitOf(result.state, 'pikemen-1').effects).toStrictEqual([]);
  });

  it('applies to a side, the field and a hazard zone', () => {
    const content = contentWith(effect('acme:fog', { visibility: 'owner' }));
    const side = run(STATE, content, applicationDraft({ effect: 'acme:fog', holder: ATTACKER }));
    const field = run(STATE, content, applicationDraft({ effect: 'acme:fog', holder: { kind: 'field' } }));
    const hazard = run(STATE, content, applicationDraft({ effect: 'acme:fog', holder: SWAMP }));

    expect(side.state.sides[0]?.effects[0]?.visibleTo).toStrictEqual(['attacker']);
    expect(field.state.field.effects[0]?.visibleTo).toStrictEqual([]);
    expect(hazard.state.field.hazards[0]?.effects.at(-1)?.effect).toBe('acme:fog');
  });

  it('throws for an effect the content does not have and for a unit that does not exist', () => {
    expect(() => run(STATE, contentWith(), applicationDraft({ effect: 'acme:none', holder: PIKEMEN })))
      .toThrow('The content has no effect "acme:none".');

    expect(() => run(STATE, contentWith(effect('acme:a')), applicationDraft({
      effect: 'acme:a',
      holder: { kind: 'unit', unit: 'ghost' },
    }))).toThrow('The battle has no unit "ghost".');
  });
});

describe('applying an effect again', () => {
  it.each([
    { expected: [applied(7, 'acme:a', { remaining: 1 })], stacking: 'ignore' },
    { expected: [applied(7, 'acme:a', { remaining: 2 })], stacking: 'refresh' },
    { expected: [applied(7, 'acme:a', { remaining: 2, stacks: 2 })], stacking: 'stack' },
  ] as const)('with $stacking keeps one effect', ({ expected, stacking }) => {
    const content = contentWith(effect('acme:a', { stacking }));
    const result = run(existing('acme:a'), content, applicationDraft({ effect: 'acme:a', holder: PIKEMEN }));

    expect(unitOf(result.state, 'pikemen-1').effects).toStrictEqual(expected);
  });

  it('with replace removes the old effect with its operations and applies the new one', () => {
    const content = contentWith(effect('acme:a', {
      onApply: [mark('applied')],
      onRemove: [mark('removed')],
      stacking: 'replace',
    }));
    const result = run(existing('acme:a'), content, applicationDraft({ effect: 'acme:a', holder: PIKEMEN }));

    expect(types(result)).toStrictEqual([
      'kernel:effect-removed',
      'kernel:effect-applied',
      'kernel:variable-set',
      'kernel:variable-set',
    ]);

    expect(unitOf(result.state, 'pikemen-1').effects.map(({ id }) => id)).toStrictEqual([20]);
    expect(result.state.variables).toMatchObject({ applied: true, removed: true });
  });

  it('with strongest replaces only a weaker effect', () => {
    const content = contentWith(effect('acme:a', { stacking: 'strongest', strength: 3 }));
    const weaker = existing('acme:a', { params: { strength: 2 } });
    const equal = existing('acme:a', { params: { strength: 3 } });

    expect(unitOf(run(weaker, content, applicationDraft({ effect: 'acme:a', holder: PIKEMEN })).state, 'pikemen-1')
      .effects.map(({ id }) => id)).toStrictEqual([20]);

    expect(unitOf(run(equal, content, applicationDraft({ effect: 'acme:a', holder: PIKEMEN })).state, 'pikemen-1')
      .effects.map(({ id }) => id)).toStrictEqual([7]);
  });

  it('removes the effects the new one removes by tags', () => {
    const content = contentWith(
      effect('acme:poison', { onRemove: [mark('cured')], tags: ['Debuff.Poison'] }),
      effect('acme:shield', { tags: ['Buff.Shield'] }),
      effect('acme:cleanse', { removes: ['Debuff'] }),
    );
    const state = withUnitEffects({ ...STATE, nextId: 20 }, 'pikemen-1', [
      applied(7, 'acme:poison'),
      applied(8, 'acme:shield'),
    ]);
    const result = run(state, content, applicationDraft({ effect: 'acme:cleanse', holder: PIKEMEN }));

    expect(unitOf(result.state, 'pikemen-1').effects.map(({ effect: name }) => name))
      .toStrictEqual(['acme:shield', 'acme:cleanse']);

    expect(result.state.variables.cured).toBe(true);
  });
});

describe('removing an effect', () => {
  it('takes back its tags, runs its operations and leaves a gone effect alone', () => {
    const content = contentWith(effect('acme:curse', { grantsTags: ['Debuff.Curse'], onRemove: [mark('lifted')] }));
    const cursed = run(STATE, content, applicationDraft({ effect: 'acme:curse', holder: PIKEMEN })).state;
    const lifted = run(cursed, content, removalDraft(PIKEMEN, 8));

    expect(types(lifted)).toStrictEqual(['kernel:effect-removed', 'kernel:tags-changed', 'kernel:variable-set']);
    expect(unitOf(lifted.state, 'pikemen-1').tags).toStrictEqual({ 'Creature.Human': 1 });
    expect(types(run(lifted.state, content, removalDraft(PIKEMEN, 8)))).toStrictEqual([]);
  });
});

describe('ticks of effects', () => {
  const content = contentWith(
    effect('acme:bleed', { onTurn: [mark('bled')] }),
    effect('acme:aura', { duration: { kind: 'battle' }, onTurn: [mark('glowed')] }),
    effect('acme:slow', { duration: { count: 1, kind: 'rounds', tick: 'round-end' } }),
    effect('acme:sleep', {
      activeWhile: false,
      duration: { count: 3, kind: 'turns', tick: 'holder-turn-start' },
      onTurn: [mark('snored')],
    }),
  );

  it('count down at the start of the turn, run the operations of every turn and end at 0', () => {
    const state = withUnitEffects(STATE, 'pikemen-1', [
      applied(5, 'acme:bleed', { remaining: 2 }),
      applied(6, 'acme:aura'),
      applied(7, 'acme:sleep', { active: false, remaining: 3 }),
    ]);
    const first = run(state, content, tickDraft({ holder: PIKEMEN, moment: 'holder-turn-start' }));
    const second = run(first.state, content, tickDraft({ holder: PIKEMEN, moment: 'holder-turn-start' }));

    expect(unitOf(first.state, 'pikemen-1').effects.map(({ remaining }) => remaining)).toStrictEqual([1, undefined, 2]);
    expect(first.state.variables).toMatchObject({ bled: true, glowed: true });
    expect('snored' in first.state.variables).toBe(false);

    expect(unitOf(second.state, 'pikemen-1').effects.map(({ effect: name }) => name))
      .toStrictEqual(['acme:aura', 'acme:sleep']);
  });

  it('count down effects that tick at the end of a round on every holder', () => {
    const state = {
      ...withUnitEffects(STATE, 'pikemen-1', [applied(5, 'acme:slow', { remaining: 1 })]),
      field: { ...STATE.field, effects: [applied(6, 'acme:slow', { remaining: 2 })] },
    };
    const result = run(state, content, tickDraft({ moment: 'round-end' }));

    expect(unitOf(result.state, 'pikemen-1').effects).toStrictEqual([]);
    expect(result.state.field.effects.map(({ remaining }) => remaining)).toStrictEqual([1]);
    expect(() => run(state, content, tickDraft({ moment: 'holder-turn-end' }))).toThrow('needs a unit or a side');
  });
});

describe('reactions of effects', () => {
  const content = contentWith(
    effect('acme:thorns', {
      duration: { kind: 'battle' },
      triggers: [{
        condition: node('kernel:same', { left: 'self', right: 'target' }),
        on: 'kernel:health-changed',
        ops: [mark('thorns')],
        priority: 0,
      }],
    }),
    effect('acme:first', { triggers: [{ on: 'kernel:flags-changed', ops: [mark('order', 1)], priority: 1 }] }),
    effect('acme:second', { triggers: [{ on: 'kernel:flags-changed', ops: [mark('order', 2)], priority: 5 }] }),
    effect('acme:fragile', {
      endsOn: [{ condition: node('kernel:same', { left: 'self', right: 'target' }), on: 'kernel:health-changed' }],
    }),
  );

  it('fire triggers whose condition holds, linked to the event, before the steps of the step', () => {
    const state = withUnitEffects(STATE, 'pikemen-1', [applied(5, 'acme:thorns'), applied(6, 'acme:fragile')]);
    const payload = { count: 19, health: 10, unit: 'pikemen-1' };
    const health = { payload, type: 'kernel:health-changed', visibleTo: 'all' };
    const command = runSteps([{ params: { events: [health], then: [mark('after')] }, type: 'acme:emit' }]);
    const result = KERNEL.execute(state, command, content);

    if (!result.ok) throw new Error('Rejected');

    expect(result.events.map(({ cause, payload: value, type }) => [type, cause, type === MARK ? value : null]))
      .toStrictEqual([
        ['kernel:health-changed', undefined, null],
        ['kernel:variable-set', 0, { value: true, variable: 'thorns' }],
        ['kernel:effect-removed', 0, null],
        ['kernel:variable-set', 0, { value: true, variable: 'after' }],
      ]);
  });

  it('order triggers by the side that has the turn, then by priority, then by the order of application', () => {
    const state = {
      ...withUnitEffects(withUnitEffects(STATE, 'pikemen-1', [applied(5, 'acme:second')]), 'archers-1', [
        applied(6, 'acme:first'),
      ]),
    };
    const flags = { payload: { flags: [], unit: 'archers-1' }, type: 'kernel:flags-changed', visibleTo: 'all' };
    const command = runSteps([{ params: { events: [flags], then: [] }, type: 'acme:emit' }]);
    const result = KERNEL.execute(state, command, content);

    if (!result.ok) throw new Error('Rejected');

    expect(result.state.variables.order).toBe(2);

    expect(result.events.filter(({ type }) => type === 'kernel:variable-set').map(({ payload }) => payload))
      .toStrictEqual([{ value: 1, variable: 'order' }, { value: 2, variable: 'order' }]);
  });
});

describe('the end of a command', () => {
  it('brings the marks of activity up to date', () => {
    const content = contentWith(effect('acme:night', {
      activeWhile: AFTER_ROUND_5,
    }));
    const state = withUnitEffects(STATE, 'pikemen-1', [applied(5, 'acme:night', { active: true })]);
    const result = run(state, content);

    expect(types(result)).toStrictEqual(['kernel:effect-changed']);
    expect(unitOf(result.state, 'pikemen-1').effects[0]?.active).toBe(false);
  });
});

describe('operations of the kernel', () => {
  const content = contentWith(
    effect('acme:burn', { tags: ['Debuff.Fire'] }),
    effect('acme:chill', { tags: ['Debuff.Cold'] }),
  );
  const subjects = { self: ARCHERS, target: PIKEMEN };

  it('apply an effect to a participant with the self as its source and remove effects by tags', () => {
    const burned = run(STATE, content, ...operationDrafts([
      node('kernel:apply-effect', { effect: 'acme:burn', params: { power: 2 }, to: 'target' }),
      node('kernel:apply-effect', { effect: 'acme:chill', to: 'target' }),
    ], subjects));
    const cooled = run(burned.state, content, ...operationDrafts([
      node('kernel:remove-effects', { from: 'target', tags: ['Debuff.Fire'] }),
    ], subjects));

    expect(unitOf(burned.state, 'pikemen-1').effects.map(({ params, sourceUnit }) => [params, sourceUnit]))
      .toStrictEqual([[{ power: 2 }, 'archers-1'], [{}, 'archers-1']]);

    expect(unitOf(cooled.state, 'pikemen-1').effects.map(({ effect: name }) => name)).toStrictEqual(['acme:chill']);
  });

  it('set a variable to a value or to a formula', () => {
    const result = run(STATE, content, ...operationDrafts([
      mark('flag', 'on'),
      mark('sum', node('kernel:add', { values: [2, 3] })),
    ], subjects));

    expect(result.state.variables).toMatchObject({ flag: 'on', sum: 5 });
  });

  it('treat an unknown operation and a holder that is not a participant as errors of the content', () => {
    expect(() => run(STATE, content, ...operationDrafts([node('acme:dance')], subjects)))
      .toThrow('The kernel has no operation "acme:dance".');

    const toSource = node('kernel:apply-effect', { effect: 'acme:burn', to: 'source' });

    expect(() => run(STATE, content, ...operationDrafts([toSource], subjects)))
      .toThrow('needs field or a unit or a side');
  });
});

const AFTER_ROUND_5 = node('kernel:compare', { left: node('kernel:round'), operator: '>', right: 5 });

const MARK = 'kernel:variable-set';

const ATTACKER = { kind: 'side', side: 'attacker' } as const;

const SWAMP = { hazard: 'swamp', kind: 'hazard' } as const;

function existing(name: string, extra: Partial<AppliedEffect> = {}): typeof STATE {
  return withUnitEffects({ ...STATE, nextId: 20 }, 'pikemen-1', [applied(7, name, { remaining: 1, ...extra })]);
}
