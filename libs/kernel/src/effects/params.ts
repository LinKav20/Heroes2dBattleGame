import type { CountedDuration, Op } from '../content/index.ts';
import type { Subjects } from '../extensions/index.ts';
import type { ContentName } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';
import type {
  AppliedEffect,
  BattleEvent,
  EffectHolder,
  SideHolder,
  SideTarget,
  UnitHolder,
  UnitTarget,
} from '../model/index.ts';

/**
 * The parameters of `kernel:effect-application`: apply an effect to a holder.
 */
export interface ApplicationParams {
  /** The full name of the effect. */
  readonly effect: ContentName;
  /** What the effect is applied to. */
  readonly holder: EffectHolder;
  /** The unit or the side that applies the effect, if any. */
  readonly source?: SideHolder | UnitHolder;
  /** The values the effect is applied with; formulas of the effect read them with `kernel:effect-param`. */
  readonly params?: JsonObject;
}

/**
 * The parameters of `kernel:effect-removal`: remove an applied effect from its holder.
 */
export interface RemovalParams {
  /** What the effect is applied to. */
  readonly holder: EffectHolder;
  /** The identifier of the applied effect. */
  readonly effect: number;
}

/**
 * The parameters of `kernel:effect-tick`: a moment when counters of effects go down and operations of every turn run.
 */
export type TickParams = HolderTurnTick | RoundEndTick;

/**
 * The start or the end of the turn of a unit or a side.
 */
export interface HolderTurnTick {
  /** The moment. */
  readonly moment: Exclude<TickMoment, 'round-end'>;
  /** The unit or the side whose turn starts or ends. */
  readonly holder: SideHolder | UnitHolder;
}

/**
 * The end of a round, for every holder.
 */
export interface RoundEndTick {
  /** The moment. */
  readonly moment: 'round-end';
}

/**
 * A moment when the counter of an effect goes down.
 */
export type TickMoment = CountedDuration['tick'];

/**
 * The parameters of `kernel:effect-turn`: an effect runs its operations of every turn if it is still there and its
 * condition of activity holds.
 */
export interface TurnParams {
  /** What the effect is applied to, or the unit or the field whose definition has the effect. */
  readonly holder: EffectHolder;
  /** The full name of the effect. */
  readonly effect: ContentName;
  /** The identifier of the applied effect; an effect of a definition has none. */
  readonly applied?: number;
}

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

/**
 * The parameters of `kernel:reaction`: the reactions of effects to the events of one step, in the order they run. The
 * step runs them from `next` on until one of them does something, and leaves the rest to the next step of its kind.
 */
export interface ReactionParams {
  /** The events with the reactions to them, in the order of the events. */
  readonly batches: readonly ReactionBatch[];
  /** The reaction to run next: its batch and its place in the batch. */
  readonly next: readonly [number, number];
}

/**
 * An event with the reactions of effects to it.
 */
export interface ReactionBatch {
  /** The event. */
  readonly event: BattleEvent;
  /** The unit or the side the event is about, if any. */
  readonly target?: SideTarget | UnitTarget;
  /** The reactions in the order they run, at least one. */
  readonly reactions: readonly Reaction[];
}

/**
 * A reaction of an effect to an event: a trigger fires, or the event ends the effect.
 */
export interface Reaction {
  /** Whether a trigger fires or the effect ends. */
  readonly kind: 'end' | 'trigger';
  /** What the effect is applied to, or the unit or the field whose definition has the effect. */
  readonly holder: EffectHolder;
  /** The full name of the effect. */
  readonly effect: ContentName;
  /** The identifier of the applied effect; an effect of a definition has none. */
  readonly applied?: number;
  /** The position of the trigger or of the ending event in the definition of the effect. */
  readonly index: number;
}
