import type { Op } from '../content/index.ts';
import type { Subjects } from '../extensions/index.ts';
import type { AppliedEffect, BattleEvent } from '../model/index.ts';

/**
 * What operations of content run with: their participants, the applied effect and the event they react to.
 */
export interface OperationScope {
  /** The participants of the operation. */
  readonly subjects: Subjects;
  /** The applied effect whose operation it is, if any. */
  readonly effect?: AppliedEffect;
  /** The event a trigger reacts to, if the operation is one of a trigger. */
  readonly event?: BattleEvent;
}

/**
 * The parameters of `kernel:operation`: run one operation of content.
 */
export interface OperationParams extends OperationScope {
  /** The operation. */
  readonly op: Op;
}
