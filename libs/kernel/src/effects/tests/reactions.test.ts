import { describe, expect, it } from 'vitest';
import { ContentError } from '../../content/index.ts';
import { KERNEL_EVENTS, kernelEventDraft } from '../../events/index.ts';
import type { EventDraft } from '../../extensions/index.ts';
import type { BattleState, Command, Unit } from '../../model/index.ts';
import { operationDrafts } from '../../operations/index.ts';
import {
  contentWith,
  emit,
  KERNEL,
  markOp,
  MARK,
  PIKEMEN,
  run,
  runSteps,
  BARE_STATE,
  types,
  variables,
  withUnitEffects,
} from '../../tests/battle.ts';
import { accepted, applied, CONTENT, effect, node, unitOf } from '../../tests/fixtures.ts';
import { applicationDraft } from '../index.ts';

describe('reactions of effects', () => {
  const content = contentWith(
    effect('acme:thorns', {
      duration: { kind: 'battle' },
      triggers: [{ condition: SELF_IS_TARGET, on: 'kernel:health-changed', ops: [markOp('thorns')], priority: 0 }],
    }),
    effect('acme:first', { triggers: [{ on: 'kernel:flags-changed', ops: [markOp('order', 1)], priority: 1 }] }),
    effect('acme:second', { triggers: [{ on: 'kernel:flags-changed', ops: [markOp('order', 2)], priority: 5 }] }),
    effect('acme:fragile', { endsOn: [{ condition: SELF_IS_TARGET, on: 'kernel:health-changed' }] }),
  );

  it('fire triggers whose condition holds, linked to the event, before the steps of the step', () => {
    const state = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:thorns'), applied(6, 'acme:fragile')]);
    const result = run(state, content, emit([HEALTH], [markOp('after')]));

    expect(result.events.map(({ cause, payload, type }) => [type, cause, type === MARK ? payload : null]))
      .toStrictEqual([
        ['kernel:health-changed', undefined, null],
        ['kernel:variable-set', 0, { value: true, variable: 'thorns' }],
        ['kernel:effect-removed', 0, null],
        ['kernel:variable-set', 0, { value: true, variable: 'after' }],
      ]);
  });

  it('order triggers by the side that has the turn, then by priority, then by the order of application', () => {
    const state = withUnitEffects(
      withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:second')]),
      'archers-1',
      [applied(6, 'acme:first')],
    );
    const result = run(state, content, emit([flags('archers-1')]));

    expect(variables(result)).toStrictEqual([{ value: 1, variable: 'order' }, { value: 2, variable: 'order' }]);
  });

  it('keep one step on the stack per event however many effects react to it', () => {
    const many = Array.from({ length: 30 }, (unused, index) => troop(`pikemen-${String(index + 2)}`));
    const state: BattleState = {
      ...BARE_STATE,
      units: [...BARE_STATE.units, ...many].map((unit, index) => ({
        ...unit,
        effects: [applied(100 + index, 'acme:thorns')],
      })),
    };
    const hits = state.units.map(({ id, visibleTo }) => kernelEventDraft(KERNEL_EVENTS.healthChanged, {
      count: 1,
      health: 1,
      unit: id,
    }, visibleTo));
    const result = run(state, content, emit(hits));

    expect(variables(result)).toHaveLength(state.units.length);
  });

  it('pass over reactions that do nothing in one step, however many events the step gives', () => {
    const deaf = contentWith(effect('acme:deaf', {
      duration: { kind: 'battle' },
      triggers: [{ condition: false, on: 'kernel:flags-changed', ops: [markOp('heard')], priority: 0 }],
    }));
    const many = Array.from({ length: 38 }, (unused, index) => troop(`pikemen-${String(index + 2)}`));
    const state: BattleState = {
      ...BARE_STATE,
      units: [...BARE_STATE.units, ...many].map((unit, index) => ({
        ...unit,
        effects: [applied(100 + index, 'acme:deaf')],
      })),
    };
    const result = run(state, deaf, emit(Array.from({ length: 300 }, () => flags('archers-1'))));

    expect(result.events).toHaveLength(300);
  });

  it('take the effects there right after the event', () => {
    const applying = { ...applied(8, 'acme:thorns'), remaining: 2 };
    const state = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:fragile'), applied(6, 'acme:thorns')]);
    const result = run(state, content, emit([
      HEALTH,
      kernelEventDraft(KERNEL_EVENTS.effectApplied, { effect: applying, holder: PIKEMEN }, SEEN_PIKEMEN),
    ]));

    expect(variables(result)).toStrictEqual([{ value: true, variable: 'thorns' }]);
  });

  it('put the effects of definitions before the applied ones of the same priority', () => {
    const pikeman = CONTENT.creatures['demo:pikeman'];
    const named = {
      ...contentWith(
        effect('acme:born', {
          triggers: [{ on: 'kernel:flags-changed', ops: [markOp('order', 'born')], priority: 0 }],
        }),
        effect('acme:given', {
          triggers: [{ on: 'kernel:flags-changed', ops: [markOp('order', 'given')], priority: 0 }],
        }),
      ),
      creatures: {
        ...CONTENT.creatures,
        ...(pikeman === undefined ? {} : { 'demo:pikeman': { ...pikeman, effects: ['acme:born'] } }),
      },
    };
    const state = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:given')]);

    expect(variables(run(state, named, emit([flags('archers-1')]))))
      .toStrictEqual([{ value: 'born', variable: 'order' }, { value: 'given', variable: 'order' }]);
  });

  it('wait for a roll in the middle of the reactions and go on with the rest after the answer', () => {
    const lucky = node('kernel:compare', {
      left: node('kernel:dice', { count: 1, name: 'core:morale', sides: 6 }),
      operator: '>',
      right: 0,
    });
    const named = contentWith(
      effect('acme:first', {
        triggers: [{ condition: lucky, on: 'kernel:flags-changed', ops: [markOp('first')], priority: 2 }],
      }),
      effect('acme:second', {
        triggers: [{ condition: lucky, on: 'kernel:flags-changed', ops: [markOp('second')], priority: 1 }],
      }),
    );
    const state = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:first'), applied(6, 'acme:second')]);
    const paused = run(state, named, emit([flags('archers-1')]));
    const once = accepted(KERNEL.execute(paused.state, answer(8, 4), named));
    const twice = accepted(KERNEL.execute(once.state, answer(9, 2), named));

    expect(paused.state.steps.map(({ type }) => type)).toStrictEqual(['kernel:reaction']);

    expect(once.state.steps.map(({ inputs, params, type }) => [type, params.next, inputs])).toStrictEqual([
      ['kernel:reaction', [0, 1], undefined],
    ]);

    expect(once.state.variables.first).toBe(true);
    expect(twice.state.variables.second).toBe(true);
    expect(twice.state.steps).toStrictEqual([]);
  });

  it('give the target that a kind of event of a package names, and reject a target that is a cell', () => {
    const named = contentWith(effect('acme:watch', {
      duration: { kind: 'battle' },
      triggers: [
        { on: 'acme:hit', ops: [CURSE_TARGET], priority: 0 },
        { on: 'acme:poke', ops: [markOp('poked')], priority: 0 },
      ],
    }), effect('acme:curse'));
    const state = withUnitEffects(BARE_STATE, 'archers-1', [applied(5, 'acme:watch')]);
    const hit = { payload: { unit: 'pikemen-1' }, type: 'acme:hit', visibleTo: 'all' } as const;
    const poke = { payload: {}, type: 'acme:poke', visibleTo: 'all' } as const;

    expect(unitOf(run(state, named, emit([hit])).state, 'pikemen-1').effects.map(({ effect: name }) => name))
      .toStrictEqual(['acme:curse']);

    expect(() => run(state, named, emit([poke]))).toThrow('names a target that is neither a unit nor a side');
  });

  it('cannot be put on the stack by a step or an operation of a package', () => {
    expect(() => run(BARE_STATE, contentWith(), { params: {}, type: 'acme:sneak' }))
      .toThrow('"acme:sneak" adds the step "kernel:effect-refresh", but only the kernel adds such steps.');

    expect(() => run(BARE_STATE, contentWith(), ...operationDrafts([node('acme:sneaky')], { subjects: {} })))
      .toThrow('"acme:sneaky" adds the step "kernel:effect-turn"');
  });

  it('give no target for an event about nobody and the unit of a summoned unit as the target', () => {
    const summonedUnit = troop('#8');
    const named = contentWith(
      effect('acme:hex', {
        duration: { kind: 'battle' },
        triggers: [{ on: 'kernel:variable-set', ops: [CURSE_TARGET], priority: 0 }],
      }),
      effect('acme:welcome', {
        duration: { kind: 'battle' },
        triggers: [{ on: 'kernel:unit-summoned', ops: [CURSE_TARGET], priority: 0 }],
      }),
      effect('acme:curse'),
    );
    const hexed = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:hex')]);
    const welcoming = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:welcome')]);
    const summon = kernelEventDraft(KERNEL_EVENTS.unitSummoned, { unit: summonedUnit }, summonedUnit.visibleTo);

    expect(() => run(hexed, named, emit([], [markOp('any')]))).toThrow(ContentError);

    expect(unitOf(run(welcoming, named, emit([summon])).state, '#8').effects.map(({ effect: name }) => name))
      .toStrictEqual(['acme:curse']);
  });

  it('let the effects of a dead unit react only to the events about the unit until it comes back', () => {
    const watching = contentWith(effect('acme:watch', {
      triggers: [{ on: 'kernel:flags-changed', ops: [markOp('watched')], priority: 0 }],
    }));
    const watched = [{ value: true, variable: 'watched' }];
    const dead = withUnitEffects(withPikemen({ count: 0, health: 0 }), 'pikemen-1', [applied(5, 'acme:watch')]);
    const back = withUnitEffects(withPikemen({ count: 1, health: 10 }), 'pikemen-1', [applied(5, 'acme:watch')]);

    expect(variables(run(dead, watching, emit([flags('archers-1')])))).toStrictEqual([]);
    expect(variables(run(dead, watching, emit([flags('pikemen-1')])))).toStrictEqual(watched);
    expect(variables(run(back, watching, emit([flags('archers-1')])))).toStrictEqual(watched);
  });

  it('skip the reactions of a unit that an earlier reaction to the same event killed', () => {
    const kill = node('kernel:damage', { amount: 1000, to: 'self' });
    const fatal = contentWith(
      effect('acme:fatal', { triggers: [{ on: 'kernel:flags-changed', ops: [kill], priority: 9 }] }),
      effect('acme:watch', { triggers: [{ on: 'kernel:flags-changed', ops: [markOp('watched')], priority: 0 }] }),
    );
    const state = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:fatal'), applied(6, 'acme:watch')]);
    const result = run(state, fatal, emit([flags('archers-1')]));

    expect(unitOf(result.state, 'pikemen-1').count).toBe(0);
    expect(variables(result)).toStrictEqual([]);

    expect(variables(run(state, fatal, emit([flags('pikemen-1')]))))
      .toStrictEqual([{ value: true, variable: 'watched' }]);
  });

  it('let an effect ignore the events about itself', () => {
    const named = contentWith(effect('acme:shield', {
      endsOn: [{ on: 'kernel:effect-applied' }],
      triggers: [{ on: 'kernel:effect-applied', ops: [markOp('noticed')], priority: 0 }],
    }), effect('acme:other'));
    const shielded = run(BARE_STATE, named, applicationDraft({ effect: 'acme:shield', holder: PIKEMEN }));
    const other = run(shielded.state, named, applicationDraft({ effect: 'acme:other', holder: PIKEMEN }));

    expect(unitOf(shielded.state, 'pikemen-1').effects.map(({ effect: name }) => name)).toStrictEqual(['acme:shield']);
    expect('noticed' in shielded.state.variables).toBe(false);
    expect(unitOf(other.state, 'pikemen-1').effects.map(({ effect: name }) => name)).toStrictEqual(['acme:other']);
    expect(other.state.variables.noticed).toBe(true);
  });

  it('let conditions and operations of a trigger read the event and the parameters of the effect', () => {
    const named = contentWith(effect('acme:vampire', {
      duration: { kind: 'battle' },
      triggers: [{
        condition: node('kernel:compare', { left: COUNT, operator: '<', right: 20 }),
        on: 'kernel:health-changed',
        ops: [markOp('drained', node('kernel:add', {
          values: [COUNT, node('kernel:effect-param', { param: 'bonus' })],
        }))],
        priority: 0,
      }],
    }));
    const state = withUnitEffects(BARE_STATE, 'archers-1', [applied(5, 'acme:vampire', { params: { bonus: 100 } })]);

    expect(run(state, named, emit([HEALTH])).state.variables.drained).toBe(119);
  });

  it('check the condition of activity with the holder, and end even a switched-off effect', () => {
    const named = contentWith(effect('acme:calm', {
      activeWhile: node('kernel:not', { condition: node('kernel:has-tag', { of: 'target', tag: 'Debuff' }) }),
      duration: { kind: 'battle' },
      endsOn: [{ on: 'kernel:resource-changed' }],
      triggers: [{ on: 'kernel:flags-changed', ops: [markOp('calm')], priority: 0 }],
    }), effect('acme:poison', { duration: { kind: 'battle' }, grantsTags: ['Debuff.Poison'] }));
    const calm = withUnitEffects(
      withUnitEffects(BARE_STATE, 'archers-1', [applied(4, 'acme:poison')]),
      'pikemen-1',
      [applied(5, 'acme:calm')],
    );
    const restless = withUnitEffects(calm, 'pikemen-1', [applied(4, 'acme:poison'), applied(5, 'acme:calm')]);
    const payload = { resource: 'demo:mana', unit: 'pikemen-1', value: 1 };
    const mana = kernelEventDraft(KERNEL_EVENTS.resourceChanged, payload, SEEN_PIKEMEN);

    expect(run(calm, named, emit([flags('archers-1')])).state.variables.calm).toBe(true);
    expect('calm' in run(restless, named, emit([flags('archers-1')])).state.variables).toBe(false);

    expect(unitOf(run(restless, named, emit([mana])).state, 'pikemen-1').effects.map(({ id }) => id))
      .toStrictEqual([4]);
  });

  it('skip a reaction of an item whose effect stopped acting before its turn', () => {
    const named = {
      ...contentWith(
        effect('acme:watch', {
          duration: { kind: 'battle' },
          triggers: [{ on: 'kernel:flags-changed', ops: [markOp('watched')], priority: 0 }],
        }),
        effect('acme:drop', {
          duration: { kind: 'battle' },
          triggers: [{ on: 'kernel:flags-changed', ops: [node('acme:drop', { item: 40 })], priority: 9 }],
        }),
      ),
      items: {
        ...CONTENT.items,
        'acme:charm': {
          abilities: [],
          consumedOnUse: false,
          effects: ['acme:watch'],
          name: 'acme:charm',
          stack: 1,
          tags: [],
        },
      },
    };
    const state: BattleState = {
      ...BARE_STATE,
      units: BARE_STATE.units.map((unit) => (unit.id === 'pikemen-1'
        ? { ...unit, effects: [applied(5, 'acme:drop')], inventory: [{ count: 1, id: 40, item: 'acme:charm' }] }
        : unit)),
    };

    expect(types(run(state, named, emit([flags('pikemen-1')])))).toStrictEqual([
      'kernel:flags-changed',
      'kernel:item-removed',
    ]);
  });

  it('end only at the limit of steps for an effect that reacts to itself through another effect', () => {
    const named = contentWith(
      effect('acme:echo', {
        duration: { kind: 'battle' },
        triggers: [{ on: 'kernel:effect-changed', ops: [selfApply('acme:ring')], priority: 0 }],
      }),
      effect('acme:ring', {
        duration: { kind: 'battle' },
        triggers: [{ on: 'kernel:effect-changed', ops: [selfApply('acme:echo')], priority: 0 }],
      }),
    );
    const state = withUnitEffects(BARE_STATE, 'pikemen-1', [applied(5, 'acme:echo'), applied(6, 'acme:ring')]);
    const result = KERNEL.execute(state, runSteps([applicationDraft({ effect: 'acme:echo', holder: PIKEMEN })]), named);

    expect(result).toMatchObject({ ok: false, rejection: { reason: 'kernel:step-limit' } });
  });
});

const SELF_IS_TARGET = node('kernel:same', { left: 'self', right: 'target' });

const SEEN_PIKEMEN = unitOf(BARE_STATE, 'pikemen-1').visibleTo;

const HEALTH: EventDraft = kernelEventDraft(
  KERNEL_EVENTS.healthChanged,
  { count: 19, health: 10, unit: 'pikemen-1' },
  SEEN_PIKEMEN,
);

const CURSE_TARGET = node('kernel:apply-effect', { effect: 'acme:curse', to: 'target' });

const COUNT = node('kernel:event-value', { path: ['count'] });

function selfApply(name: string): ReturnType<typeof node> {
  return node('kernel:apply-effect', { effect: name, to: 'self' });
}

function answer(request: number, die: number): Command {
  return { kind: 'answer', request, value: { dice: [die], kind: 'roll' } };
}

function flags(unit: string): EventDraft {
  return kernelEventDraft(KERNEL_EVENTS.flagsChanged, { flags: [], unit }, unitOf(BARE_STATE, unit).visibleTo);
}

function withPikemen(change: Partial<Unit>): BattleState {
  const units = BARE_STATE.units.map((unit) => (unit.id === 'pikemen-1' ? { ...unit, ...change } : unit));

  return { ...BARE_STATE, units };
}

function troop(id: string): Unit {
  const [, pikemen] = BARE_STATE.units;

  if (pikemen === undefined) throw new Error('No pikemen');

  return { ...pikemen, effects: [], id, summoned: id.startsWith('#') };
}
