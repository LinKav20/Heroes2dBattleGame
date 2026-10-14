import { contentError, type ExpressionNode, type ValueExpr } from '../../content/index.ts';
import type { FormulaExtension } from '../../extensions/index.ts';
import { isRecord, ownValue } from '../../shared/index.ts';
import { formulaParam, isFormula, roleParam, stringParam } from '../params.ts';
import { evaluated } from '../results.ts';
import { subjectHolder } from '../subjects.ts';
import { defineFormula } from './define.ts';
import { KERNEL_FORMULAS } from './names.ts';
import { FORMULA_SCHEMA, listSchema, NAME_SCHEMA, referenceSchema, ROLE_SCHEMA, TABLE_ROW_SCHEMA } from './schema.ts';

/**
 * The nodes of formulas that the kernel registers itself for values of the battle: an attribute of a participant,
 * the round, a scenario variable and a table of values.
 */
export const VALUE_KINDS: readonly FormulaExtension[] = [
  defineFormula(
    { name: KERNEL_FORMULAS.attribute, params: { attribute: referenceSchema('attribute'), of: ROLE_SCHEMA } },
    (node, context) => {
      const of = subjectHolder(node, context, roleParam(node, 'of'));

      return context.attribute(of, stringParam(node, 'attribute'));
    },
  ),
  defineFormula({ name: KERNEL_FORMULAS.round, params: {} }, (node, context) => evaluated(context.state.round)),
  defineFormula({ name: KERNEL_FORMULAS.variable, params: { variable: NAME_SCHEMA } }, (node, context) => {
    const variable = stringParam(node, 'variable');
    const value = ownValue(context.state.variables, variable);

    if (typeof value !== 'number') {
      throw contentError(node, `refers to the variable ${JSON.stringify(variable)}, which is not a number`);
    }

    return evaluated(value);
  }),
  defineFormula(
    { name: KERNEL_FORMULAS.table, params: { key: FORMULA_SCHEMA, rows: listSchema(TABLE_ROW_SCHEMA) } },
    (node, context) => {
      const key = context.value(formulaParam(node, 'key'));

      return key.kind === 'value' ? context.value(rowFor(node, key.value)) : key;
    },
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
