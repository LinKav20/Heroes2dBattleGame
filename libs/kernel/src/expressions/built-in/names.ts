import { kernelName } from '../../names/index.ts';

/**
 * The full names of the nodes of conditions that the kernel registers itself.
 */
export const KERNEL_CONDITIONS = Object.freeze({
  and: kernelName('and'),
  compare: kernelName('compare'),
  hasTag: kernelName('has-tag'),
  not: kernelName('not'),
  or: kernelName('or'),
  same: kernelName('same'),
  variableIs: kernelName('variable-is'),
});

/**
 * The full names of the nodes of formulas that the kernel registers itself.
 */
export const KERNEL_FORMULAS = Object.freeze({
  add: kernelName('add'),
  attribute: kernelName('attribute'),
  dice: kernelName('dice'),
  divide: kernelName('divide'),
  max: kernelName('max'),
  min: kernelName('min'),
  multiply: kernelName('multiply'),
  percent: kernelName('percent'),
  round: kernelName('round'),
  subtract: kernelName('subtract'),
  table: kernelName('table'),
  variable: kernelName('variable'),
});

/**
 * The operators of `kernel:compare`.
 */
export const COMPARISON_OPERATORS = Object.freeze(['<', '<=', '=', '!=', '>=', '>'] as const);
