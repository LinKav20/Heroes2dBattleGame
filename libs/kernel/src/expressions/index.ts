export { AttributeCache } from './attributes/attribute-cache.ts';
export { battlefieldEffects, itemEffects } from './attributes/sources.ts';
export { COMPARISON_OPERATORS, KERNEL_CONDITIONS, KERNEL_FORMULAS } from './built-in/names.ts';
export { KERNEL_CONDITION_KINDS, KERNEL_FORMULA_KINDS } from './built-in/kinds.ts';
export { FORMULA_SCHEMA, listSchema, NAME_SCHEMA, nodeSchema, ROLE_SCHEMA } from './built-in/schema.ts';
export { contentError, isCondition, isFormula, isNode, listParam, roleParam, stringParam } from './params.ts';
export { createExpressions, type ExpressionRegistries, type ExpressionSetup } from './evaluator.ts';
export { MAX_DICE_PER_ROLL, MAX_DIE_SIDES } from './limits.ts';
export { hasTag, isBlocked, matchesAny, tagMatches, withTagSources } from './tags.ts';
