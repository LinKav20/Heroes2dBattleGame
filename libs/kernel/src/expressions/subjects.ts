import { contentError, type ExpressionNode } from '../content/index.ts';
import type { ExpressionContext, SubjectRole, Subjects } from '../extensions/index.ts';
import type { SideId, UnitId } from '../ids/index.ts';
import type { AppliedEffect, BattleState, SideTarget, Target, Unit, UnitTarget } from '../model/index.ts';

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
 * The roles of the participants of a formula or a condition.
 */
export const SUBJECT_ROLES = Object.freeze(['self', 'source', 'target'] as const satisfies readonly SubjectRole[]);

/**
 * Returns the unit of the battle that a node refers to by its role, or nothing if the participant is absent, is not a
 * unit or is not in the battle.
 */
export function subjectUnit(context: ExpressionContext, role: SubjectRole): Unit | undefined {
  const subject = context.subjects[role];

  return subject?.kind === 'unit' ? context.state.units.find(({ id }) => id === subject.unit) : undefined;
}

/**
 * Returns the unit or the side that a node refers to by its role.
 *
 * @throws {ContentError} If the participant is absent or is a cell.
 */
export function subjectHolder(
  node: ExpressionNode,
  context: ExpressionContext,
  role: SubjectRole,
): SideTarget | UnitTarget {
  const subject = context.subjects[role];

  if (subject?.kind === 'side' || subject?.kind === 'unit') return subject;

  throw contentError(node, `refers to ${role}, which is neither a unit nor a side here`);
}

/**
 * Returns the side of a participant: the side itself, or the side of a unit of the battle; nothing for a cell, an
 * absent participant or a unit that is not in the battle.
 */
export function subjectSide(context: ExpressionContext, role: SubjectRole): SideId | undefined {
  const subject = context.subjects[role];

  if (subject?.kind === 'side') return subject.side;

  return subject?.kind === 'unit' ? context.state.units.find(({ id }) => id === subject.unit)?.side : undefined;
}

/**
 * Returns who a roll belongs to: the side and the unit of `self`.
 */
export function rollOwner(state: BattleState, subjects: Subjects): RollOwner {
  const { self } = subjects;

  if (self?.kind === 'side') return { side: self.side };

  if (self?.kind !== 'unit') return {};

  const unit = state.units.find(({ id }) => id === self.unit);

  return unit === undefined ? { unit: self.unit } : { side: unit.side, unit: self.unit };
}

/**
 * Returns the unit or the side that applied an effect, if any.
 */
export function appliedSource(applied: AppliedEffect): Target | undefined {
  if (applied.sourceUnit !== undefined) return { kind: 'unit', unit: applied.sourceUnit };

  return applied.sourceSide === undefined ? undefined : { kind: 'side', side: applied.sourceSide };
}
