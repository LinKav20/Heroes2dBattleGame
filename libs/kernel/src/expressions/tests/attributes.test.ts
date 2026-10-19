import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ContentError, type ContentRegistry, type Effect, type Modifier, type ValueExpr } from '../../content/index.ts';
import type { FormulaExtension } from '../../extensions/index.ts';
import { createKernel, type Kernel } from '../../kernel/index.ts';
import type { AppliedEffect, BattleState } from '../../model/index.ts';
import { applied, CONTENT, effect, FROZEN_STATE, node } from '../../tests/fixtures.ts';
import {
  applyModifiers,
  AttributeCache,
  createExpressions,
  KERNEL_CONDITIONS,
  KERNEL_FORMULAS,
  type ModifierValue,
} from '../index.ts';

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

  it('brings the value to 0, not below, when percents add up to less than -100', () => {
    const weak = [modifier('percent', -60), modifier('percent', -60), modifier('final-add', 5)];

    expect(applyModifiers(10, weak, {}, 'down')).toBe(5);

    expect(applyModifiers(10, [modifier('base-percent', -150)], {}, 'down')).toBe(0);
  });

  it('adds bonuses in any order to the same sum, and a neutral percent changes nothing', () => {
    const integer = fc.integer({ max: 1_000_000, min: -1_000_000 });

    fc.assert(fc.property(integer, fc.array(integer, { maxLength: 8 }), (base, amounts) => {
      const adds = amounts.map((amount, order) => modifier('add', amount, { order }));
      const total = amounts.reduce((sumOfAmounts, amount) => sumOfAmounts + amount, base);

      expect(applyModifiers(base, adds, {}, 'down')).toBe(total);
      expect(applyModifiers(base, adds.toReversed(), {}, 'down')).toBe(total);
      expect(applyModifiers(base, [...adds, modifier('percent', 0), modifier('multiply', 100)], {}, 'up')).toBe(total);
    }));
  });

  it('never goes beyond the bounds of the attribute', () => {
    const integer = fc.integer({ max: 10_000, min: -10_000 });

    fc.assert(fc.property(integer, integer, integer, integer, (base, amount, low, span) => {
      const bounds = { max: low + Math.abs(span), min: low };
      const result = applyModifiers(base, [modifier('add', amount), modifier('percent', amount)], bounds, 'nearest');

      expect(result).toBeGreaterThanOrEqual(bounds.min);
      expect(result).toBeLessThanOrEqual(bounds.max);
    }));
  });

  it('gives nothing when a value leaves the safe integers', () => {
    expect(applyModifiers(Number.MAX_SAFE_INTEGER, [modifier('add', 1)], {}, 'down')).toBeUndefined();
    expect(applyModifiers(2 ** 52, [modifier('multiply', 300)], {}, 'down')).toBeUndefined();
    expect(applyModifiers(1, [modifier('add', Number.MAX_SAFE_INTEGER, { stacks: 2 })], {}, 'down')).toBeUndefined();
  });
});

describe('tags of units', () => {
  it('come from the state, the creature and the effects acting on the unit while they are active', () => {
    const state = {
      ...withEffects({
        battlefield: 'demo:meadow',
        pikemen: [applied(10, 'acme:brave'), applied(11, 'acme:sleepy')],
        sides: { defender: [applied(20, 'acme:banner')] },
      }),
      units: FROZEN_STATE.units.map((unit) => (unit.id === 'pikemen-1'
        ? { ...unit, effects: [applied(10, 'acme:brave'), applied(11, 'acme:sleepy')], tags: { 'Mark.Chosen': 1 } }
        : unit)),
    };

    expect(tags(state, 'pikemen-1')).toStrictEqual({
      'Creature.Human': 1,
      'Immunity.Mind': 2,
      'Mark.Chosen': 1,
      'Terrain.Meadow': 1,
    });

    expect(tags(state, 'archers-1')).toStrictEqual({ 'Creature.Human': 1, 'Debuff.Poison': 1, 'Terrain.Meadow': 1 });
  });

  it('treat tags that depend on themselves as an error of the content', () => {
    expect(() => tags(withEffects({ pikemen: [applied(10, 'acme:proud')] }), 'pikemen-1'))
      .toThrow('The tags of the unit "pikemen-1" depend on themselves.');
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

  it('evaluate the condition of activity only of the effects that change the attribute', () => {
    const state = withEffects({ pikemen: [applied(10, 'acme:desperate')] });

    expect(speed(state, 'pikemen-1')).toBe(6);
    expect(value(state, node(KERNEL_FORMULAS.attribute, { attribute: 'core:health', of: 'self' }))).toBe(10);
    expect(speed({ ...state, round: 9 }, 'pikemen-1')).toBe(6 + 5);
  });

  it('treat wrong numbers of an attribute as errors of the content', () => {
    function withSpeed(attribute: ContentRegistry['attributes'][string], base = 4): ContentRegistry {
      const pikeman = { ...pikemanOf(TEST_CONTENT), attributes: { 'core:speed': base } };

      return {
        ...TEST_CONTENT,
        attributes: { ...TEST_CONTENT.attributes, 'core:speed': attribute },
        creatures: { ...TEST_CONTENT.creatures, 'demo:pikeman': pikeman },
      };
    }

    expect(() => speedWith(withSpeed({ name: 'core:speed' }, 1.5))).toThrow(ContentError);
    expect(() => speedWith(withSpeed({ max: 2.5, name: 'core:speed' }))).toThrow('not a safe integer');
    expect(() => speedWith(withSpeed({ max: 1, min: 3, name: 'core:speed' }))).toThrow('lowest bound above');
  });

  it('treat an attribute that depends on itself and a roll in a modifier as errors of the content', () => {
    expect(() => speed(withEffects({ pikemen: [applied(10, 'acme:loop')] }), 'pikemen-1'))
      .toThrow('The attribute "core:speed" of the unit "pikemen-1" depends on itself.');

    expect(() => speed(withEffects({ pikemen: [applied(10, 'acme:lucky')] }), 'pikemen-1'))
      .toThrow('dice cannot be rolled');
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

const ROUND = node(KERNEL_FORMULAS.round);

const TEST_CONTENT: ContentRegistry = {
  ...CONTENT,
  battlefields: { 'demo:meadow': { effects: ['acme:plus-20000', 'acme:meadow'], name: 'demo:meadow' } },
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
    'acme:banner': effect('acme:banner', { duration: { kind: 'battle' }, grantsTags: ['Immunity.Mind'] }),
    'acme:brave': effect('acme:brave', { duration: { kind: 'battle' }, grantsTags: ['Immunity.Mind'] }),
    'acme:desperate': {
      ...effectOf('acme:desperate', [speedModifier('add', 5)]),
      activeWhile: node(KERNEL_CONDITIONS.compare, {
        left: node(KERNEL_FORMULAS.add, {
          values: [node(KERNEL_FORMULAS.attribute, { attribute: 'core:health', of: 'self' }), ROUND],
        }),
        operator: '>',
        right: 15,
      }),
    },
    'acme:meadow': effect('acme:meadow', { duration: { kind: 'battle' }, grantsTags: ['Terrain.Meadow'] }),
    'acme:proud': effect('acme:proud', {
      activeWhile: node(KERNEL_CONDITIONS.hasTag, { of: 'self', tag: 'Creature' }),
      duration: { kind: 'battle' },
      grantsTags: ['Mark.Proud'],
    }),
    'acme:sleepy': effect('acme:sleepy', {
      activeWhile: false,
      duration: { kind: 'battle' },
      grantsTags: ['Debuff.Sleep'],
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

function effectOf(name: string, modifiers: readonly Modifier[]): Effect {
  return effect(name, { duration: { kind: 'battle' }, modifiers });
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
  return value(state, SPEED, unit);
}

function speedWith(content: ContentRegistry): unknown {
  const { registries } = KERNEL;

  return createExpressions({ content, inputs: [], registries, state: FROZEN_STATE }).value(SPEED, PIKEMEN);
}

function value(state: BattleState, formula: ValueExpr, unit = 'pikemen-1'): number {
  const result = expressions(state).value(formula, { self: { kind: 'unit', unit } });

  if (result.kind !== 'value') throw new Error(`No value: ${JSON.stringify(result)}`);

  return result.value;
}

function tags(state: BattleState, unit: string): unknown {
  const result = expressions(state).tags(unit);

  return result.kind === 'value' ? result.value : result;
}
