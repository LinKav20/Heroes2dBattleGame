import type { ExpressionNode } from '../content/index.ts';
import type { EvaluatedValue, StepRejects } from '../extensions/index.ts';
import type { ContentName } from '../ids/index.ts';
import { REJECTION_REASONS, type SideTarget, type UnitTarget } from '../model/index.ts';

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
 * Returns the rejection of a command whose attribute of a unit or a side gets a value out of the safe range.
 */
export function attributeOutOfRange(of: SideTarget | UnitTarget, attribute: ContentName): StepRejects {
  const holder = of.kind === 'unit' ? { unit: of.unit } : { side: of.side };

  return { kind: 'reject', params: { attribute, ...holder }, reason: REJECTION_REASONS.outOfRange };
}
