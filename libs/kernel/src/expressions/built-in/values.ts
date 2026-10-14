import type { ExpressionNode, ValueExpr } from '../../content/index.ts';
import type { Evaluation, ExpressionContext, FormulaExtension } from '../../extensions/index.ts';
import { isRecord, ownValue } from '../../shared/index.ts';
import { MAX_DICE_PER_ROLL, MAX_DIE_SIDES } from '../limits.ts';
import { contentError, formulaParam, isFormula, roleParam, stringParam } from '../params.ts';
import { evaluated } from '../results.ts';
import { rollOwner, subjectUnit } from '../subjects.ts';
import { defineFormula, valuesOf } from './define.ts';
import { KERNEL_FORMULAS } from './names.ts';
import { FORMULA_SCHEMA, listSchema, NAME_SCHEMA, ROLE_SCHEMA, TABLE_ROW_SCHEMA } from './schema.ts';

/**
 * The nodes of formulas that the kernel registers itself for values of the battle: an attribute of a participant,
 * the round, a scenario variable, a table of values and a dice roll.
 */
export const VALUE_KINDS: readonly FormulaExtension[] = [
  defineFormula(KERNEL_FORMULAS.attribute, { attribute: NAME_SCHEMA, of: ROLE_SCHEMA }, (node, context) => {
    const unit = subjectUnit(node, context, roleParam(node, 'of'));

    return context.attribute(unit.id, stringParam(node, 'attribute'));
  }),
  defineFormula(KERNEL_FORMULAS.round, {}, (node, context) => evaluated(context.state.round)),
  defineFormula(KERNEL_FORMULAS.variable, { variable: NAME_SCHEMA }, (node, context) => {
    const variable = stringParam(node, 'variable');
    const value = ownValue(context.state.variables, variable);

    if (typeof value !== 'number') {
      throw contentError(node, `refers to the variable ${JSON.stringify(variable)}, which is not a number`);
    }

    return evaluated(value);
  }),
  defineFormula(
    KERNEL_FORMULAS.table,
    { key: FORMULA_SCHEMA, rows: listSchema(TABLE_ROW_SCHEMA) },
    (node, context) => {
      const key = context.value(formulaParam(node, 'key'));

      return key.kind === 'value' ? context.value(rowFor(node, key.value)) : key;
    },
  ),
  defineFormula(
    KERNEL_FORMULAS.dice,
    { count: FORMULA_SCHEMA, name: NAME_SCHEMA, sides: FORMULA_SCHEMA },
    rollDice,
  ),
];

function rowFor(node: ExpressionNode, key: number): ValueExpr {
  const rows = node.rows;

  if (!Array.isArray(rows) || rows.length === 0) throw contentError(node, 'needs a non-empty list in "rows"');

  let chosen: ValueExpr | undefined;
  let previous = -Infinity;

  for (const row of rows) {
    if (!isRecord(row) || !Number.isSafeInteger(row.from) || !isFormula(row.value)) {
      throw contentError(node, 'needs rows with a whole number in "from" and a formula in "value"');
    }

    const from = Number(row.from);

    if (from <= previous) throw contentError(node, 'needs rows sorted by "from" without repeats');

    if (chosen === undefined || from <= key) chosen = row.value;

    previous = from;
  }

  return chosen ?? 0;
}

function rollDice(node: ExpressionNode, context: ExpressionContext): Evaluation<number> {
  const name = stringParam(node, 'name');
  const values = valuesOf([formulaParam(node, 'count'), formulaParam(node, 'sides')], context);

  if (values.kind !== 'value') return values;

  const [count = 0, sides = 0] = values.value;

  if (count < 0 || count > MAX_DICE_PER_ROLL) {
    throw contentError(node, `needs from 0 to ${String(MAX_DICE_PER_ROLL)} dice, not ${String(count)}`);
  }

  if (sides < 1 || sides > MAX_DIE_SIDES) {
    throw contentError(node, `needs dice with 1 to ${String(MAX_DIE_SIDES)} sides, not ${String(sides)}`);
  }

  return count === 0 ? evaluated(0) : context.roll({ count, kind: 'roll', name, sides, ...rollOwner(context) });
}
