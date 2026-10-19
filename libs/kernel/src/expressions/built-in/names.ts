import { kernelName } from '../../names/index.ts';

/**
 * The full name of a node of conditions of the kernel.
 */
export type KernelConditionType = (typeof KERNEL_CONDITIONS)[keyof typeof KERNEL_CONDITIONS];

/**
 * The full name of a node of formulas of the kernel.
 */
export type KernelFormulaType = (typeof KERNEL_FORMULAS)[keyof typeof KERNEL_FORMULAS];

/**
 * An operator of `kernel:compare`.
 */
export type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number];

/**
 * A kind of participant that `kernel:subject-is` checks for.
 */
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

/**
 * Who sees a roll of `kernel:dice`.
 */
export type RollVisibility = (typeof ROLL_VISIBILITIES)[number];

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
  subjectIs: kernelName('subject-is'),
  variableIs: kernelName('variable-is'),
});

/**
 * The full names of the nodes of formulas that the kernel registers itself.
 */
export const KERNEL_FORMULAS = Object.freeze({
  add: kernelName('add'),
  attribute: kernelName('attribute'),
  dice: kernelName('dice'),
  distance: kernelName('distance'),
  divide: kernelName('divide'),
  effectParam: kernelName('effect-param'),
  effectStacks: kernelName('effect-stacks'),
  eventValue: kernelName('event-value'),
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

/**
 * The kinds of participants `kernel:subject-is` checks for.
 */
export const SUBJECT_KINDS = Object.freeze(['cell', 'side', 'unit'] as const);

/**
 * Who sees a roll of `kernel:dice`: every side, the side of `self`, or nobody but an actor with full visibility.
 */
export const ROLL_VISIBILITIES = Object.freeze(['all', 'none', 'owner'] as const);
