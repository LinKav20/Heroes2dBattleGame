import type { ConditionExtension, FormulaExtension } from '../../extensions/index.ts';
import { compareCodeUnits } from '../../shared/index.ts';
import { ARITHMETIC_KINDS } from './arithmetic.ts';
import { CONDITION_KINDS } from './conditions.ts';
import { DICE_KIND } from './dice.ts';
import { SCOPE_KINDS } from './scope-values.ts';
import { VALUE_KINDS } from './values.ts';

/**
 * All nodes of conditions that the kernel registers itself, sorted by name.
 */
export const KERNEL_CONDITION_KINDS: readonly ConditionExtension[] = Object.freeze(
  CONDITION_KINDS.toSorted((left, right) => compareCodeUnits(left.name, right.name)),
);

/**
 * All nodes of formulas that the kernel registers itself, sorted by name.
 */
export const KERNEL_FORMULA_KINDS: readonly FormulaExtension[] = Object.freeze(
  [...ARITHMETIC_KINDS, ...VALUE_KINDS, DICE_KIND, ...SCOPE_KINDS]
    .toSorted((left, right) => compareCodeUnits(left.name, right.name)),
);
