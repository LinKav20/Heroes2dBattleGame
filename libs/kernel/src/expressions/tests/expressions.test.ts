import { describe, expect, it } from 'vitest';
import type { ExpressionNode, Predicate, ValueExpr } from '../../content/index.ts';
import type { Evaluation, Expressions, FormulaExtension, Subjects } from '../../extensions/index.ts';
import { createKernel, type Kernel } from '../../kernel/index.ts';
import type { BattleState, StepInput } from '../../model/index.ts';
import { CONTENT, FROZEN_STATE } from '../../tests/fixtures.ts';
import {
  createExpressions,
  KERNEL_CONDITION_KINDS,
  KERNEL_CONDITIONS,
  KERNEL_FORMULA_KINDS,
  KERNEL_FORMULAS,
  MAX_DICE_PER_ROLL,
  MAX_DIE_SIDES,
} from '../index.ts';

describe('the nodes of the kernel', () => {
  it('are registered by the kernel itself with a schema each', () => {
    const { conditions, formulas } = createKernel({ extensions: [] }).registries;

    expect(conditions.extensions.map(({ name }) => name)).toStrictEqual(KERNEL_CONDITION_KINDS.map(({ name }) => name));
    expect(formulas.extensions.map(({ name }) => name)).toStrictEqual(KERNEL_FORMULA_KINDS.map(({ name }) => name));

    expect(KERNEL_CONDITION_KINDS.map(({ name }) => name).sort())
      .toStrictEqual(Object.values(KERNEL_CONDITIONS).sort());

    expect(KERNEL_FORMULA_KINDS.map(({ name }) => name).sort()).toStrictEqual(Object.values(KERNEL_FORMULAS).sort());

    expect([...KERNEL_CONDITION_KINDS, ...KERNEL_FORMULA_KINDS].every(({ name, schema }) =>
      schema.type === 'object' && JSON.stringify(schema).includes(`"const":"${name}"`))).toBe(true);
  });
});

describe('formulas', () => {
  it('take a safe integer as it is and reject other numbers and values', () => {
    expect(value(7)).toBe(7);
    expect(() => value(1.5)).toThrow('is not a safe integer');
    expect(() => value(true as unknown as ValueExpr)).toThrow('is not a formula');
    expect(() => value(node('acme:unknown'))).toThrow('The kernel has no node of formulas "acme:unknown".');
  });

  it('do arithmetic', () => {
    expect(value(node(KERNEL_FORMULAS.add, { values: [1, 2, node(KERNEL_FORMULAS.multiply, { values: [3, 4] })] })))
      .toBe(15);

    expect(value(node(KERNEL_FORMULAS.subtract, { left: 2, right: 5 }))).toBe(-3);
    expect(value(node(KERNEL_FORMULAS.min, { values: [4, -2, 9] }))).toBe(-2);
    expect(value(node(KERNEL_FORMULAS.max, { values: [4, -2, 9] }))).toBe(9);
    expect(value(node(KERNEL_FORMULAS.divide, { left: 7, right: 2 }))).toBe(3);
    expect(value(node(KERNEL_FORMULAS.percent, { percent: 150, value: 7 }))).toBe(10);
  });

  it('round a quotient and a percent as the ruleset says', () => {
    const up = { ...FROZEN_STATE, ruleset: { ...FROZEN_STATE.ruleset, rounding: 'up' } } as const;

    expect(value(node(KERNEL_FORMULAS.divide, { left: 7, right: 2 }), {}, up)).toBe(4);
    expect(value(node(KERNEL_FORMULAS.percent, { percent: 150, value: 7 }), {}, up)).toBe(11);
  });

  it('reject the command when a result leaves the safe range', () => {
    const huge = node(KERNEL_FORMULAS.multiply, { values: [Number.MAX_SAFE_INTEGER, 2] });

    expect(evaluate(node(KERNEL_FORMULAS.add, { values: [1, huge] }))).toStrictEqual({
      kind: 'reject',
      params: { formula: KERNEL_FORMULAS.multiply },
      reason: 'kernel:out-of-range',
    });
  });

  it('treat a division by zero and a malformed node as errors of the content', () => {
    expect(() => value(node(KERNEL_FORMULAS.divide, { left: 1, right: 0 }))).toThrow('divides by 0');
    expect(() => value(node(KERNEL_FORMULAS.add, { values: [] }))).toThrow('needs a non-empty list in "values"');
    expect(() => value(node(KERNEL_FORMULAS.subtract, { left: 1 }))).toThrow('needs a formula in "right"');
  });

  it('read the attribute of a participant with the modifiers of its effects', () => {
    const archer = { self: { kind: 'unit', unit: 'archers-1' } } as const;
    const pikemen = { self: { kind: 'unit', unit: 'pikemen-1' } } as const;
    const bounded = {
      ...CONTENT,
      attributes: { ...CONTENT.attributes, 'core:speed': { max: 2, name: 'core:speed' } },
    };
    const speed = node(KERNEL_FORMULAS.attribute, { attribute: 'core:speed', of: 'self' });

    expect(value(speed, pikemen)).toBe(4);
    expect(value(speed, archer)).toBe(3);
    expect(value(node(KERNEL_FORMULAS.attribute, { attribute: 'demo:mana', of: 'self' }), archer)).toBe(5);
    expect(value(speed, archer, FROZEN_STATE, bounded)).toBe(2);

    expect(() => value(node(KERNEL_FORMULAS.attribute, { attribute: 'core:luck', of: 'self' }), archer))
      .toThrow('The content has no attribute "core:luck".');

    expect(() => value(node(KERNEL_FORMULAS.attribute, { attribute: 'core:speed', of: 'target' }), archer))
      .toThrow('refers to target, which is not a unit here');
  });

  it('read the round and a number variable of the scenario', () => {
    const state = { ...FROZEN_STATE, variables: { flag: true, waves: 3 } };

    expect(value(node(KERNEL_FORMULAS.round), {}, state)).toBe(1);
    expect(value(node(KERNEL_FORMULAS.variable, { variable: 'waves' }), {}, state)).toBe(3);
    expect(() => value(node(KERNEL_FORMULAS.variable, { variable: 'flag' }), {}, state)).toThrow('not a number');
    expect(() => value(node(KERNEL_FORMULAS.variable, { variable: 'toString' }), {}, state)).toThrow('not a number');
  });

  it('look up a table: the last row whose key is not above the value, or the first row', () => {
    const rows = [{ from: -1, value: 10 }, { from: 2, value: 20 }, { from: 5, value: node(KERNEL_FORMULAS.round) }];

    expect([-9, -1, 1, 2, 4, 5, 99].map((key) => value(node(KERNEL_FORMULAS.table, { key, rows }))))
      .toStrictEqual([10, 10, 10, 20, 20, 1, 1]);

    expect(() => value(node(KERNEL_FORMULAS.table, { key: 1, rows: [{ from: 2, value: 1 }, { from: 2, value: 2 }] })))
      .toThrow('sorted by "from" without repeats');
  });

  it('ask for a dice roll with the side and the unit of self, then use the rolls in order', () => {
    const dice = node(KERNEL_FORMULAS.dice, { count: 2, name: 'core:damage', sides: 6 });
    const twice = node(KERNEL_FORMULAS.add, { values: [dice, dice] });
    const archer = { self: { kind: 'unit', unit: 'archers-1' } } as const;

    expect(evaluate(twice, archer)).toStrictEqual({
      kind: 'need',
      need: { count: 2, kind: 'roll', name: 'core:damage', side: 'attacker', sides: 6, unit: 'archers-1' },
    });

    expect(evaluate(twice, archer, [roll(3, 4)])).toMatchObject({ kind: 'need' });

    expect(value(twice, archer, FROZEN_STATE, CONTENT, [roll(3, 4), { kind: 'choice', option: 'a' }, roll(1, 1)]))
      .toBe(9);
  });

  it('roll no dice for a count of 0 and treat wrong dice as errors of the content', () => {
    expect(value(dice(0, 6))).toBe(0);
    expect(() => value(dice(-1, 6))).toThrow('needs from 0 to 1000 dice, not -1');
    expect(() => value(dice(MAX_DICE_PER_ROLL + 1, 6))).toThrow('dice');
    expect(() => value(dice(1, 0))).toThrow('sides, not 0');
    expect(() => value(dice(1, MAX_DIE_SIDES + 1))).toThrow('sides');
    expect(() => value(dice(2, 6), {}, FROZEN_STATE, CONTENT, [roll(3)])).toThrow('A roll of 1 dice came');
  });
});

describe('conditions', () => {
  it('take true and false as they are and reject other values', () => {
    expect(test(true)).toBe(true);
    expect(test(false)).toBe(false);
    expect(() => test(1 as unknown as Predicate)).toThrow('is not a condition');
    expect(() => test(node('acme:unknown'))).toThrow('The kernel has no node of conditions "acme:unknown".');
  });

  it('combine conditions and stop as soon as the result is known', () => {
    const roll = compare(node(KERNEL_FORMULAS.dice, { count: 1, name: 'core:damage', sides: 6 }), '>', 0);

    expect(test(node(KERNEL_CONDITIONS.and, { conditions: [true, true] }))).toBe(true);
    expect(test(node(KERNEL_CONDITIONS.and, { conditions: [true, false, roll] }))).toBe(false);
    expect(test(node(KERNEL_CONDITIONS.or, { conditions: [false, true, roll] }))).toBe(true);
    expect(test(node(KERNEL_CONDITIONS.or, { conditions: [false, false] }))).toBe(false);
    expect(test(node(KERNEL_CONDITIONS.not, { condition: false }))).toBe(true);
    expect(check(node(KERNEL_CONDITIONS.and, { conditions: [true, roll] }))).toMatchObject({ kind: 'need' });
  });

  it.each([
    { left: 1, operator: '<', result: true, right: 2 },
    { left: 2, operator: '<', result: false, right: 2 },
    { left: 2, operator: '<=', result: true, right: 2 },
    { left: 2, operator: '=', result: true, right: 2 },
    { left: 2, operator: '!=', result: false, right: 2 },
    { left: 3, operator: '>=', result: true, right: 2 },
    { left: 2, operator: '>', result: false, right: 2 },
  ])('compare $left $operator $right', ({ left, operator, result, right }) => {
    expect(test(compare(left, operator, right))).toBe(result);
  });

  it('reject an unknown operator as an error of the content', () => {
    expect(() => test(compare(1, '<>', 2))).toThrow('needs one of < <= = != >= > in "operator"');
  });

  it('check a tag with its nested tags, counting only tags with sources', () => {
    const archer = { self: { kind: 'unit', unit: 'archers-1' } } as const;
    const state = {
      ...FROZEN_STATE,
      units: FROZEN_STATE.units.map((unit) => ({ ...unit, tags: { 'Buff.Haste': 0, 'Debuff.Poison': 1 } })),
    };

    expect(test(hasTag('Debuff'), archer, state)).toBe(true);
    expect(test(hasTag('Debuff.Poison'), archer, state)).toBe(true);
    expect(test(hasTag('Debuff.Poison.Strong'), archer, state)).toBe(false);
    expect(test(hasTag('Debu'), archer, state)).toBe(false);
    expect(test(hasTag('Buff'), archer, state)).toBe(false);
  });

  it('compare a scenario variable with a value', () => {
    expect(test(is('reinforcements-arrived', false))).toBe(true);
    expect(test(is('reinforcements-arrived', 0))).toBe(false);
    expect(() => test(is('waves', 1))).toThrow('refers to the variable "waves", which is absent');
  });
});

describe('nodes of extensions', () => {
  it('evaluate with nested formulas and the same participants', () => {
    const twice: FormulaExtension = {
      evaluate: (formula, context) => {
        const inner = context.value(formula.value as ValueExpr);

        return inner.kind === 'value' ? { kind: 'value', value: inner.value * 2 } : inner;
      },
      kind: 'formula',
      name: 'acme:twice',
      schema: { type: 'object' },
    };
    const kernel = createKernel({ extensions: [twice] });
    const expressions = expressionsOf(kernel);
    const speed = node(KERNEL_FORMULAS.attribute, { attribute: 'core:speed', of: 'self' });

    expect(expressions.value(node('acme:twice', { value: speed }), { self: { kind: 'unit', unit: 'pikemen-1' } }))
      .toStrictEqual({ kind: 'value', value: 8 });
  });

  it('cannot return a value that is not a safe integer', () => {
    const broken: FormulaExtension = {
      evaluate: () => ({ kind: 'value', value: 0.5 }),
      kind: 'formula',
      name: 'acme:half',
      schema: { type: 'object' },
    };
    const kernel = createKernel({ extensions: [broken] });
    const expressions = expressionsOf(kernel);

    expect(() => expressions.value(node('acme:half'))).toThrow('gave 0.5, not a safe integer');
  });
});

const KERNEL = createKernel({ extensions: [] });

function dice(count: number, sides: number): ExpressionNode {
  return node(KERNEL_FORMULAS.dice, { count, name: 'core:damage', sides });
}

function hasTag(tag: string): ExpressionNode {
  return node(KERNEL_CONDITIONS.hasTag, { of: 'self', tag });
}

function is(variable: string, expected: boolean | number | string): ExpressionNode {
  return node(KERNEL_CONDITIONS.variableIs, { value: expected, variable });
}

function expressionsOf(kernel: Kernel): Expressions {
  return createExpressions({ content: CONTENT, inputs: [], registries: kernel.registries, state: FROZEN_STATE });
}

function node(type: string, params: Readonly<Record<string, unknown>> = {}): ExpressionNode {
  const value: unknown = { ...params, type };

  return value as ExpressionNode;
}

function compare(left: ValueExpr, operator: string, right: ValueExpr): ExpressionNode {
  return node(KERNEL_CONDITIONS.compare, { left, operator, right });
}

function roll(...dice: number[]): StepInput {
  return { dice, kind: 'roll', result: dice.reduce((total, die) => total + die, 0) };
}

function evaluate(
  formula: ValueExpr,
  subjects: Subjects = {},
  inputs: readonly StepInput[] = [],
  state: BattleState = FROZEN_STATE,
): Evaluation<number> {
  return createExpressions({ content: CONTENT, inputs, registries: KERNEL.registries, state }).value(formula, subjects);
}

function value(
  formula: ValueExpr,
  subjects: Subjects = {},
  state: BattleState = FROZEN_STATE,
  content = CONTENT,
  inputs: readonly StepInput[] = [],
): number {
  const result = createExpressions({ content, inputs, registries: KERNEL.registries, state }).value(formula, subjects);

  if (result.kind !== 'value') throw new Error(`No value: ${JSON.stringify(result)}`);

  return result.value;
}

function check(condition: Predicate, subjects: Subjects = {}): Evaluation<boolean> {
  return createExpressions({ content: CONTENT, inputs: [], registries: KERNEL.registries, state: FROZEN_STATE })
    .test(condition, subjects);
}

function test(condition: Predicate, subjects: Subjects = {}, state: BattleState = FROZEN_STATE): boolean {
  const result = createExpressions({ content: CONTENT, inputs: [], registries: KERNEL.registries, state })
    .test(condition, subjects);

  if (result.kind !== 'value') throw new Error(`No value: ${JSON.stringify(result)}`);

  return result.value;
}
