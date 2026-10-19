import { describe, expect, it } from 'vitest';
import { ContentError, type ExpressionNode, type Predicate, type ValueExpr } from '../../content/index.ts';
import type {
  ConditionExtension,
  Evaluation,
  Expressions,
  FormulaExtension,
  Subjects,
} from '../../extensions/index.ts';
import { createKernel, type Kernel } from '../../kernel/index.ts';
import type { BattleEvent, BattleState, StepInput } from '../../model/index.ts';
import { applied, CONTENT, effect, FROZEN_STATE, node } from '../../tests/fixtures.ts';
import {
  createExpressions,
  defineFormula,
  evaluated,
  FORMULA_SCHEMA,
  isFormula,
  NAME_SCHEMA,
  ROLE_SCHEMA,
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

describe('helpers for nodes', () => {
  it('tell a formula by a safe integer or a node', () => {
    expect([7, 1.5, Number.NaN, node('acme:x'), true].map((value) => isFormula(value))).toStrictEqual([
      true,
      false,
      false,
      true,
      false,
    ]);
  });

  it('declare a node with optional parameters, a short name and other keys of its schema', () => {
    const declared = defineFormula({
      name: 'acme:bonus',
      optional: ['cap'],
      params: { cap: FORMULA_SCHEMA, of: ROLE_SCHEMA },
      schema: { description: 'A bonus.' },
      shortName: 'bonus',
    }, () => evaluated(1));

    expect(declared).toMatchObject({
      kind: 'formula',
      name: 'acme:bonus',
      schema: { description: 'A bonus.', required: ['type', 'of'] },
      shortName: 'bonus',
    });

    expect(Object.isFrozen(declared.schema.properties)).toBe(true);

    expect(() => defineFormula({ name: 'acme:x', optional: ['typo'], params: {} }, () => evaluated(1)))
      .toThrow('has no parameters typo to make optional');

    expect(() => defineFormula({ name: 'acme:x', params: { type: NAME_SCHEMA } }, () => evaluated(1)))
      .toThrow('has a parameter called "type"');
  });

  it('name the node in an error of content', () => {
    expect(thrown(() => value(node(KERNEL_FORMULAS.divide, { left: 1, right: 0 }))))
      .toMatchObject({ name: 'ContentError', node: KERNEL_FORMULAS.divide });
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

    expect(thrown(() => value(speed, { self: { kind: 'unit', unit: 'ghosts-1' } })))
      .toMatchObject({ message: 'The battle has no unit "ghosts-1".', name: 'TypeError' });

    expect(() => value(node(KERNEL_FORMULAS.attribute, { attribute: 'core:speed', of: 'target' }), archer))
      .toThrow('refers to target, which is neither a unit nor a side here');
  });

  it('read an attribute of a side from the effects of the side, the field and the battlefield, starting at 0', () => {
    const content = {
      ...CONTENT,
      effects: {
        ...CONTENT.effects,
        'acme:command': effect('acme:command', { modifiers: [{ attribute: 'demo:mana', operation: 'add', value: 7 }] }),
      },
    };
    const state = {
      ...FROZEN_STATE,
      sides: FROZEN_STATE.sides.map((side) => ({ ...side, effects: [applied(9, 'acme:command')] })),
    };
    const mana = node(KERNEL_FORMULAS.attribute, { attribute: 'demo:mana', of: 'self' });

    expect(value(mana, { self: { kind: 'side', side: 'attacker' } }, state, content)).toBe(7);
    expect(value(mana, { self: { kind: 'side', side: 'defender' } }, FROZEN_STATE)).toBe(0);
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

  it('give a roll of a formula and a roll of the step from one queue and reject a roll of another value', () => {
    const expressions = createExpressions({
      content: CONTENT,
      inputs: [roll(5), roll(2, 2)],
      registries: KERNEL.registries,
      state: FROZEN_STATE,
    });
    const own = { count: 1, kind: 'roll', name: 'core:damage', sides: 6 } as const;

    expect(expressions.roll(own)).toStrictEqual({ kind: 'value', value: 5 });
    expect(expressions.value(dice(2, 6))).toStrictEqual({ kind: 'value', value: 4 });
    expect(expressions.roll(own)).toMatchObject({ kind: 'need', need: own });

    expect(() => value(dice(1, 6), {}, FROZEN_STATE, CONTENT, [namedRoll('core:morale', 5)]))
      .toThrow('for "core:morale" came where 1 dice with 6 sides for "core:damage" are asked');

    expect(() => value(dice(1, 4), {}, FROZEN_STATE, CONTENT, [roll(5)])).toThrow('with 4 sides');
  });

  it('let a roll be seen by every side, the side of self or nobody', () => {
    const archer = { self: { kind: 'unit', unit: 'archers-1' } } as const;

    function seen(visibility: string): unknown {
      const roll = node(KERNEL_FORMULAS.dice, { count: 1, name: 'core:damage', sides: 6, visibility });
      const result = evaluate(roll, archer);

      return result.kind === 'need' ? result.need.visibleTo : 'no need';
    }

    expect(seen('all')).toBeUndefined();
    expect(seen('owner')).toStrictEqual(['attacker']);
    expect(seen('none')).toStrictEqual([]);
    expect(() => seen('friends')).toThrow('needs all, none, owner in "visibility"');
  });

  it('read a parameter and the stacks of the applied effect and a number of the event of the scope', () => {
    const expressions = expressionsOf(KERNEL);
    const effect = applied(4, 'core:poison', { params: { damage: 6, kind: 'acid' }, stacks: 3 });
    const event: BattleEvent = {
      id: 0,
      payload: { hit: { amount: 12 }, unit: 'archers-1' },
      type: 'acme:hit',
      version: 1,
      visibleTo: 'all',
    };
    const scoped = expressions.within({ effect, event });
    const param = node(KERNEL_FORMULAS.effectParam, { param: 'damage' });
    const amount = node(KERNEL_FORMULAS.eventValue, { path: ['hit', 'amount'] });

    expect(scoped.value(param)).toStrictEqual({ kind: 'value', value: 6 });
    expect(scoped.value(node(KERNEL_FORMULAS.effectStacks))).toStrictEqual({ kind: 'value', value: 3 });
    expect(scoped.value(amount)).toStrictEqual({ kind: 'value', value: 12 });

    expect(scoped.value(node(KERNEL_FORMULAS.effectParam, { default: 1, param: 'missing' })))
      .toMatchObject({ value: 1 });

    expect(() => scoped.value(node(KERNEL_FORMULAS.effectParam, { default: 1, param: 'kind' })))
      .toThrow('needs the parameter "kind" of an applied effect as a safe integer, not "acid"');

    expect(expressions.value(node(KERNEL_FORMULAS.eventValue, { default: 2, path: ['hit'] })))
      .toMatchObject({ value: 2 });

    expect(() => expressions.value(param)).toThrow('needs the parameter "damage" of an applied effect');
    expect(() => expressions.value(node(KERNEL_FORMULAS.effectStacks))).toThrow('outside of an applied effect');
  });

  it('forbid rolls in a scope without rolls and keep them forbidden in narrower scopes', () => {
    const { registries } = KERNEL;
    const expressions = createExpressions({ content: CONTENT, inputs: [roll(3)], registries, state: FROZEN_STATE });
    const narrower = expressions.within({ rolls: false }).within({ rolls: true, subjects: {} });

    expect(() => narrower.value(dice(1, 6))).toThrow(ContentError);

    expect(() => narrower.roll({ count: 1, kind: 'roll', name: 'core:damage', sides: 6 }))
      .toThrow('dice cannot be rolled');
  });

  it('roll no dice for a count of 0 and treat wrong dice as errors of the content', () => {
    expect(value(dice(0, 6))).toBe(0);
    expect(() => value(dice(-1, 6))).toThrow('needs from 0 to 1000 dice, not -1');
    expect(() => value(dice(MAX_DICE_PER_ROLL + 1, 6))).toThrow('dice');
    expect(() => value(dice(1, 0))).toThrow('sides, not 0');
    expect(() => value(dice(1, MAX_DIE_SIDES + 1))).toThrow('sides');
    expect(() => value(dice(2, 6), {}, FROZEN_STATE, CONTENT, [roll(3)])).toThrow('A roll of 1 dice for');
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

  it('check a tag of a unit that is absent, a side or a cell as false', () => {
    expect(test(hasTag('Creature'), {})).toBe(false);
    expect(test(hasTag('Creature'), { self: { kind: 'side', side: 'attacker' } })).toBe(false);
    expect(test(hasTag('Creature'), { self: { cell: '1,1', kind: 'cell' } })).toBe(false);
    expect(test(hasTag('Creature'), { self: { kind: 'unit', unit: 'ghosts-1' } })).toBe(false);
  });

  it('check the kind of a participant', () => {
    const subjects = { self: { kind: 'side', side: 'attacker' }, target: { cell: '1,1', kind: 'cell' } } as const;

    function is(of: string, kind: string): boolean {
      return test(node(KERNEL_CONDITIONS.subjectIs, { kind, of }), subjects);
    }

    expect([is('self', 'side'), is('self', 'unit'), is('target', 'cell'), is('source', 'unit')])
      .toStrictEqual([true, false, true, false]);

    expect(() => is('self', 'hero')).toThrow('needs cell, side, unit in "kind"');
  });

  it('check a tag of the creature and of the effects acting on a unit', () => {
    const archer = { self: { kind: 'unit', unit: 'archers-1' } } as const;

    expect(test(hasTag('Creature.Human'), archer)).toBe(true);
    expect(test(hasTag('Debuff.Poison'), archer)).toBe(true);
    expect(test(hasTag('Debuff.Poison'), { self: { kind: 'unit', unit: 'pikemen-1' } })).toBe(false);
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
    expect(() => test(is('reinforcements-arrived', 0.5))).toThrow('needs a boolean, a safe integer or a string');
  });

  it('evaluate a nested condition with other participants', () => {
    const swapped: ConditionExtension = {
      kind: 'condition',
      name: 'acme:swapped',
      schema: { type: 'object' },
      test: (condition, context) => {
        const { target } = context.subjects;

        return context.test(condition.condition as Predicate, target === undefined ? {} : { self: target });
      },
    };
    const expressions = expressionsOf(createKernel({ extensions: [swapped] }));
    const subjects = { self: { kind: 'side', side: 'attacker' }, target: { kind: 'unit', unit: 'archers-1' } } as const;

    expect(expressions.test(node('acme:swapped', { condition: hasTag('Creature') }), subjects))
      .toStrictEqual({ kind: 'value', value: true });
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

  it('cannot return a value that is not an integer, and an integer out of the safe range rejects the command', () => {
    const half = formula('acme:half', () => ({ kind: 'value', value: 0.5 }));
    const huge = formula('acme:huge', () => ({ kind: 'value', value: 2 ** 60 }));
    const expressions = expressionsOf(createKernel({ extensions: [half, huge] }));

    expect(() => expressions.value(node('acme:half'))).toThrow('gave 0.5, not an integer');

    expect(expressions.value(node('acme:huge')))
      .toStrictEqual({ kind: 'reject', params: { formula: 'acme:huge' }, reason: 'kernel:out-of-range' });
  });

  it('cannot need a value it did not ask for through roll or give a condition that is not true or false', () => {
    const sneaky = formula('acme:sneaky', () => ({
      kind: 'need',
      need: { count: 1, kind: 'roll', name: 'core:damage', sides: 6 },
    }));
    const vague: ConditionExtension = {
      kind: 'condition',
      name: 'acme:vague',
      schema: { type: 'object' },
      test: () => ({ kind: 'value', value: 'yes' as unknown as boolean }),
    };
    const expressions = expressionsOf(createKernel({ extensions: [sneaky, vague] }));

    expect(() => expressions.value(node('acme:sneaky'))).toThrow('needs a value it did not ask for through roll');
    expect(() => expressions.test(node('acme:vague'))).toThrow('gave "yes", not true or false');
  });

  it('roll for the side and the unit of self unless the need names them', () => {
    const lucky = formula('acme:lucky', (unused, context) =>
      context.roll({ count: 1, kind: 'roll', name: 'core:morale', sides: 10 }));
    const expressions = expressionsOf(createKernel({ extensions: [lucky] }));

    expect(expressions.value(node('acme:lucky'), { self: { kind: 'unit', unit: 'pikemen-1' } })).toStrictEqual({
      kind: 'need',
      need: { count: 1, kind: 'roll', name: 'core:morale', side: 'defender', sides: 10, unit: 'pikemen-1' },
    });
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

function formula(name: string, evaluate: FormulaExtension['evaluate']): FormulaExtension {
  return { evaluate, kind: 'formula', name, schema: { type: 'object' } };
}

function compare(left: ValueExpr, operator: string, right: ValueExpr): ExpressionNode {
  return node(KERNEL_CONDITIONS.compare, { left, operator, right });
}

function roll(...dice: number[]): StepInput {
  return namedRoll('core:damage', ...dice);
}

function namedRoll(name: string, ...dice: number[]): StepInput {
  return { dice, kind: 'roll', name, result: dice.reduce((total, die) => total + die, 0) };
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

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  return undefined;
}
