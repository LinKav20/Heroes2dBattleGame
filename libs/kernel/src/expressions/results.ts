import type { ExpressionNode } from '../content/index.ts';
import type { EvaluatedValue, StepRejects } from '../extensions/index.ts';
import type { ContentName, UnitId } from '../ids/index.ts';
import { REJECTION_REASONS } from '../model/index.ts';

/**
 * Returns the value of a formula or a condition as a result of evaluation.
 */
export function evaluated<Value>(value: Value): EvaluatedValue<Value> {
  return { kind: 'value', value };
}

/**
 * Returns the rejection of a command whose formula gives a value out of the safe range.
 */
export function outOfRange(node: ExpressionNode): StepRejects {
  return { kind: 'reject', params: { formula: node.type }, reason: REJECTION_REASONS.outOfRange };
}

/**
 * Returns the rejection of a command whose attribute gets a value out of the safe range.
 */
export function attributeOutOfRange(unit: UnitId, attribute: ContentName): StepRejects {
  return { kind: 'reject', params: { attribute, unit }, reason: REJECTION_REASONS.outOfRange };
}
