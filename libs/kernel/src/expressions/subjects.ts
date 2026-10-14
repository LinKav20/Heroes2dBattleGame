import type { ExpressionNode } from '../content/index.ts';
import type { ExpressionContext, SubjectRole } from '../extensions/index.ts';
import type { SideId, UnitId } from '../ids/index.ts';
import type { Unit } from '../model/index.ts';
import { contentError } from './params.ts';

/**
 * Who a roll belongs to: the side and the unit of `self`, if `self` is a unit or a side.
 */
export interface RollOwner {
  /** The side that rolls. */
  readonly side?: SideId;
  /** The unit that rolls. */
  readonly unit?: UnitId;
}

/**
 * Returns the unit a node refers to by its role.
 *
 * @throws {TypeError} If the participant with this role is absent or is not a unit of the battle.
 */
export function subjectUnit(node: ExpressionNode, context: ExpressionContext, role: SubjectRole): Unit {
  const subject = context.subjects[role];

  if (subject?.kind !== 'unit') throw contentError(node, `refers to ${role}, which is not a unit here`);

  const unit = context.state.units.find(({ id }) => id === subject.unit);

  if (unit === undefined) {
    throw contentError(node, `refers to the unit ${JSON.stringify(subject.unit)}, which is absent`);
  }

  return unit;
}

/**
 * Returns who a roll in a formula belongs to: the side and the unit of `self`.
 */
export function rollOwner(context: ExpressionContext): RollOwner {
  const { self } = context.subjects;

  if (self?.kind === 'side') return { side: self.side };

  if (self?.kind !== 'unit') return {};

  const unit = context.state.units.find(({ id }) => id === self.unit);

  return unit === undefined ? { unit: self.unit } : { side: unit.side, unit: self.unit };
}
