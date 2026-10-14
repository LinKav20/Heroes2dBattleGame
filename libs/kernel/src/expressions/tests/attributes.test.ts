import { describe, expect, it } from 'vitest';
import type { ContentRegistry, Effect, ExpressionNode, Modifier, ValueExpr } from '../../content/index.ts';
import type { FormulaExtension } from '../../extensions/index.ts';
import { createKernel, type Kernel } from '../../kernel/index.ts';
import type { AppliedEffect, BattleState } from '../../model/index.ts';
import { CONTENT, FROZEN_STATE } from '../../tests/fixtures.ts';
import { applyModifiers, type ModifierValue } from '../attributes/calculation.ts';
import { AttributeCache, createExpressions, KERNEL_CONDITIONS, KERNEL_FORMULAS } from '../index.ts';

describe('applyModifiers', () => {
  it('applies the modifiers in the order of the rules and rounds every percent and multiplier', () => {
    const modifiers = [
      modifier('final-add', 1),
      modifier('multiply', 200),
      modifier('multiply', 150),
      modifier('percent', 10),
      modifier('add', 3),
      modifier('base-percent', 50),
      modifier('base-add', 2),
    ].map((current, order) => ({ ...current, order: 6 - order }));

    expect(applyModifiers(10, modifiers, {}, 'down')).toBe(69);
    expect(applyModifiers(10, modifiers, {}, 'up')).toBe(73);
  });

  it('keeps only the largest bonus and the strongest penalty of one type of bonus', () => {
    const modifiers = [
      modifier('add', 3, { bonusType: 'morale' }),
      modifier('add', 5, { bonusType: 'morale' }),
      modifier('add', -2, { bonusType: 'morale' }),
      modifier('add', -4, { bonusType: 'morale' }),
      modifier('add', 1),
      modifier('add', 7, { bonusType: 'luck' }),
      modifier('percent', 20, { bonusType: 'morale' }),
    ];

    expect(applyModifiers(0, modifiers, {}, 'down')).toBe(10);
  });

  it('keeps one modifier of one stacking key and counts it once however it is stacked', () => {
    const modifiers = [
      modifier('add', 2, { stackingKey: 'blessing' }),
      modifier('add', 3, { stackingKey: 'blessing', stacks: 4 }),
      modifier('multiply', 150, { bonusType: 'rage' }),
      modifier('multiply', 120, { bonusType: 'rage' }),
    ];

    expect(applyModifiers(10, modifiers, {}, 'down')).toBe(19);
  });

  it('lets a stacked effect act as many times as it is stacked', () => {
    expect(applyModifiers(0, [modifier('add', 2, { stacks: 3 })], {}, 'down')).toBe(6);
    expect(applyModifiers(10, [modifier('multiply', 150, { stacks: 2 })], {}, 'down')).toBe(22);
    expect(applyModifiers(10, [modifier('percent', 10, { stacks: 3 })], {}, 'down')).toBe(13);
  });

  it('ignores neutral values when it groups bonuses', () => {
    const modifiers = [modifier('add', 0, { bonusType: 'morale' }), modifier('add', 4, { bonusType: 'morale' })];

    expect(applyModifiers(1, modifiers, {}, 'down')).toBe(5);
  });

  it('overrides by the highest priority and then by the latest override', () => {
    const modifiers = [
      modifier('override', 7, { order: 0, priority: 2 }),
      modifier('override', 9, { order: 1, priority: 1 }),
      modifier('override', 8, { order: 2, priority: 2 }),
      modifier('add', 100, { order: 3 }),
    ];

    expect(applyModifiers(1, modifiers, {}, 'down')).toBe(8);
  });

  it('bounds the value by the modifiers and then by the attribute, the upper bound winning', () => {
    expect(applyModifiers(10, [modifier('min', 12), modifier('min', 11)], {}, 'down')).toBe(12);
    expect(applyModifiers(10, [modifier('max', 4), modifier('max', 6)], {}, 'down')).toBe(4);
    expect(applyModifiers(10, [modifier('min', 5), modifier('max', 3)], {}, 'down')).toBe(3);
    expect(applyModifiers(10, [modifier('min', 50)], { max: 20, min: 0 }, 'down')).toBe(20);
    expect(applyModifiers(-5, [], { min: 0 }, 'down')).toBe(0);
  });

  it('gives nothing when a value leaves the safe integers', () => {
    expect(applyModifiers(Number.MAX_SAFE_INTEGER, [modifier('add', 1)], {}, 'down')).toBeUndefined();
    expect(applyModifiers(2 ** 52, [modifier('multiply', 300)], {}, 'down')).toBeUndefined();
    expect(applyModifiers(1, [modifier('add', Number.MAX_SAFE_INTEGER, { stacks: 2 })], {}, 'down')).toBeUndefined();
  });
});

describe('attributes of units', () => {
  it('take the modifiers of the creature, the battlefield, the items, the unit, its side and the field', () => {
    expect.hasAssertions();

    const state = withEffects({
      battlefield: 'demo:meadow',
      field: [applied(30, 'acme:plus-1000')],
      pikemen: [
        applied(10, 'acme:plus-10'),
        applied(11, 'acme:waiting'),
        applied(12, 'acme:plus-1', { active: false }),
      ],
      sides: { defender: [applied(20, 'acme:plus-100')] },
    });

    expect(speed(state, 'pikemen-1')).toBe(4 + 2 + 20_000 + 10 + 1 + 100 + 1000);
    expect(speed(state, 'archers-1')).toBe((4 + 20_000 + 1000) * 0.75);
  });

  it('take the effects of an item with a slot only while it is equipped', () => {
    const carried = { count: 1, id: 40, item: 'acme:boots' };

    expect(speed(withEffects({ inventory: [carried] }), 'pikemen-1')).toBe(6);
    expect(speed(withEffects({ inventory: [{ ...carried, slot: 'feet' }] }), 'pikemen-1')).toBe(6 + 300);
    expect(speed(withEffects({ inventory: [{ ...carried, item: 'acme:charm' }] }), 'pikemen-1')).toBe(6 + 7);
  });

  it('let an effect act only while its condition of activity holds, whatever its mark of activity says', () => {
    const early = withEffects({ inventory: [{ count: 1, id: 40, item: 'acme:hourglass' }] });

    expect(speed(early, 'pikemen-1')).toBe(6);
    expect(speed({ ...early, round: 3 }, 'pikemen-1')).toBe(6 + 50);
  });

  it('evaluate a modifier with the holder as self, the unit as target and the one that applied it as source', () => {
    const state = withEffects({
      sides: { defender: [applied(20, 'acme:mirror', { sourceUnit: 'archers-1' })] },
    });

    expect(speed(state, 'pikemen-1')).toBe(6 + 3);
  });

  it('reject the command when an attribute leaves the safe integers', () => {
    const state = withEffects({ pikemen: [applied(10, 'acme:huge'), applied(11, 'acme:huge')] });

    expect(expressions(state).value(SPEED, PIKEMEN)).toStrictEqual({
      kind: 'reject',
      params: { attribute: 'core:speed', unit: 'pikemen-1' },
      reason: 'kernel:out-of-range',
    });
  });

  it('treat an attribute that depends on itself and a roll in a modifier as errors of the content', () => {
    expect(() => speed(withEffects({ pikemen: [applied(10, 'acme:loop')] }), 'pikemen-1'))
      .toThrow('The attribute "core:speed" of the unit "pikemen-1" depends on itself.');

    expect(() => speed(withEffects({ pikemen: [applied(10, 'acme:lucky')] }), 'pikemen-1'))
      .toThrow('cannot roll dice');
  });

  it('keep a calculated value for the same state and content', () => {
    let evaluations = 0;
    const counting: FormulaExtension = {
      evaluate: () => {
        evaluations += 1;

        return { kind: 'value', value: 1 };
      },
      kind: 'formula',
      name: 'acme:count',
      schema: { type: 'object' },
    };
    const kernel = createKernel({ extensions: [counting] });
    const cache = new AttributeCache();
    const state = withEffects({ pikemen: [applied(10, 'acme:counted')] });

    function run(current: BattleState): unknown {
      const { registries } = kernel;

      return createExpressions({ cache, content: TEST_CONTENT, inputs: [], registries, state: current })
        .value(SPEED, PIKEMEN);
    }

    expect(run(state)).toStrictEqual({ kind: 'value', value: 7 });
    expect(run(state)).toStrictEqual({ kind: 'value', value: 7 });
    expect(evaluations).toBe(1);
    expect(run({ ...state })).toStrictEqual({ kind: 'value', value: 7 });
    expect(evaluations).toBe(2);
  });
});

const KERNEL: Kernel = createKernel({ extensions: [] });

const PIKEMEN = { self: { kind: 'unit', unit: 'pikemen-1' } } as const;

const SPEED = node(KERNEL_FORMULAS.attribute, { attribute: 'core:speed', of: 'self' });

const TEST_CONTENT: ContentRegistry = {
  ...CONTENT,
  battlefields: { 'demo:meadow': { effects: ['acme:plus-20000'], name: 'demo:meadow' } },
  creatures: {
    ...CONTENT.creatures,
    'demo:pikeman': { ...pikemanOf(CONTENT), effects: ['acme:plus-2'] },
  },
  effects: {
    ...CONTENT.effects,
    ...effects({
      'acme:counted': [speedModifier('add', node('acme:count'))],
      'acme:huge': [speedModifier('add', Number.MAX_SAFE_INTEGER)],
      'acme:lucky': [speedModifier('add', node(KERNEL_FORMULAS.dice, { count: 1, name: 'acme:luck', sides: 6 }))],
      'acme:loop': [speedModifier('add', node(KERNEL_FORMULAS.attribute, { attribute: 'core:speed', of: 'target' }))],
      'acme:mirror': [speedModifier('add', node(KERNEL_FORMULAS.attribute, { attribute: 'core:speed', of: 'source' }))],
      'acme:plus-1': [speedModifier('add', 1)],
      'acme:plus-10': [speedModifier('add', 10)],
      'acme:plus-100': [speedModifier('add', 100)],
      'acme:plus-1000': [speedModifier('add', 1000)],
      'acme:plus-2': [speedModifier('add', 2)],
      'acme:plus-20000': [speedModifier('add', 20_000)],
      'acme:plus-300': [speedModifier('add', 300)],
      'acme:plus-50': [speedModifier('add', 50)],
      'acme:plus-7': [speedModifier('add', 7)],
    }),
    'acme:waiting': {
      ...effectOf('acme:waiting', [speedModifier('add', 50)]),
      activeWhile: node(KERNEL_CONDITIONS.compare, { left: node(KERNEL_FORMULAS.round), operator: '>=', right: 3 }),
    },
  },
  items: {
    ...CONTENT.items,
    'acme:boots': { ...itemOf('acme:boots', ['acme:plus-300']), slot: 'feet' },
    'acme:charm': itemOf('acme:charm', ['acme:plus-7']),
    'acme:hourglass': itemOf('acme:hourglass', ['acme:waiting']),
  },
};

function modifier(
  operation: ModifierValue['operation'],
  value: number,
  extra: Partial<Omit<ModifierValue, 'operation' | 'value'>> = {},
): ModifierValue {
  return { operation, order: 0, priority: 0, stacks: 1, value, ...extra };
}

function speedModifier(operation: Modifier['operation'], value: ValueExpr): Modifier {
  return { attribute: 'core:speed', operation, value };
}

function node(type: string, params: Readonly<Record<string, unknown>> = {}): ExpressionNode {
  const value: unknown = { ...params, type };

  return value as ExpressionNode;
}

function effectOf(name: string, modifiers: readonly Modifier[]): Effect {
  return {
    blockedBy: [],
    duration: { kind: 'battle' },
    endsOn: [],
    forbids: [],
    grantsTags: [],
    modifiers,
    name,
    onApply: [],
    onRemove: [],
    onTurn: [],
    removes: [],
    stacking: 'stack',
    tags: [],
    triggers: [],
    visibility: 'all',
  };
}

function effects(table: Readonly<Record<string, readonly Modifier[]>>): Readonly<Record<string, Effect>> {
  return Object.fromEntries(Object.entries(table).map(([name, modifiers]) => [name, effectOf(name, modifiers)]));
}

function itemOf(name: string, itemEffects: readonly string[]): ContentRegistry['items'][string] {
  return { abilities: [], consumedOnUse: false, effects: itemEffects, name, stack: 1, tags: [] };
}

function pikemanOf(content: ContentRegistry): ContentRegistry['creatures'][string] {
  const pikeman = content.creatures['demo:pikeman'];

  if (pikeman === undefined) throw new Error('No pikeman');

  return pikeman;
}

function applied(id: number, effect: string, extra: Partial<AppliedEffect> = {}): AppliedEffect {
  return { active: true, effect, id, params: {}, stacks: 1, visibleTo: 'all', ...extra };
}

function withEffects(change: {
  readonly battlefield?: string;
  readonly field?: readonly AppliedEffect[];
  readonly inventory?: BattleState['units'][number]['inventory'];
  readonly pikemen?: readonly AppliedEffect[];
  readonly sides?: Readonly<Record<string, readonly AppliedEffect[]>>;
}): BattleState {
  return {
    ...FROZEN_STATE,
    field: {
      ...FROZEN_STATE.field,
      effects: change.field ?? [],
      ...(change.battlefield === undefined ? {} : { battlefield: change.battlefield }),
    },
    sides: FROZEN_STATE.sides.map((side) => ({ ...side, effects: change.sides?.[side.id] ?? [] })),
    units: FROZEN_STATE.units.map((unit) => (unit.id === 'pikemen-1'
      ? { ...unit, effects: change.pikemen ?? [], inventory: change.inventory ?? [] }
      : unit)),
  };
}

function expressions(state: BattleState): ReturnType<typeof createExpressions> {
  return createExpressions({ content: TEST_CONTENT, inputs: [], registries: KERNEL.registries, state });
}

function speed(state: BattleState, unit: string): number {
  const result = expressions(state).value(SPEED, { self: { kind: 'unit', unit } });

  if (result.kind !== 'value') throw new Error(`No value: ${JSON.stringify(result)}`);

  return result.value;
}
