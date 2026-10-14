import { contentError, type ExpressionNode } from '../../content/index.ts';
import type { Evaluation, ExpressionContext, FormulaExtension } from '../../extensions/index.ts';
import { VISIBLE_TO_NONE, type VisibleTo } from '../../ids/index.ts';
import { MAX_DICE_PER_ROLL, MAX_DIE_SIDES } from '../limits.ts';
import { enumParam, formulaParam, stringParam } from '../params.ts';
import { evaluated } from '../results.ts';
import { rollOwner } from '../subjects.ts';
import { defineFormula, valuesOf } from './define.ts';
import { KERNEL_FORMULAS, ROLL_VISIBILITIES } from './names.ts';
import { FORMULA_SCHEMA, referenceSchema } from './schema.ts';

/**
 * The node of formulas `kernel:dice`: a roll of dice for a random value of the ruleset. The roll belongs to the side
 * and the unit of `self`; `visibility` tells who sees it: every side, the side of `self`, or nobody.
 */
export const DICE_KIND: FormulaExtension = defineFormula({
  name: KERNEL_FORMULAS.dice,
  optional: ['visibility'],
  params: {
    count: FORMULA_SCHEMA,
    name: referenceSchema('randomValue'),
    sides: FORMULA_SCHEMA,
    visibility: { enum: [...ROLL_VISIBILITIES] },
  },
}, rollDice);

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

  return count === 0 ? evaluated(0) : context.roll({ count, kind: 'roll', name, sides, ...audience(node, context) });
}

function audience(node: ExpressionNode, context: ExpressionContext): { readonly visibleTo?: VisibleTo } {
  const visibility = enumParam(node, 'visibility', ROLL_VISIBILITIES, 'all');

  if (visibility === 'all') return {};

  if (visibility === 'none') return { visibleTo: VISIBLE_TO_NONE };

  const { side } = rollOwner(context.state, context.subjects);

  return { visibleTo: side === undefined ? VISIBLE_TO_NONE : [side] };
}
