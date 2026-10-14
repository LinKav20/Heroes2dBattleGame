import type { CountedDuration, Op } from '../content/index.ts';
import type { Subjects } from '../extensions/index.ts';
import type { ContentName } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';
import type { EffectHolder, SideHolder, UnitHolder } from '../model/index.ts';

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
  /** The values the effect is applied with. */
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
export interface TickParams {
  /** The moment. */
  readonly moment: TickMoment;
  /** The unit or the side whose turn starts or ends; a round ends for every holder. */
  readonly holder?: SideHolder | UnitHolder;
}

/**
 * A moment when the counter of an effect goes down.
 */
export type TickMoment = CountedDuration['tick'];

/**
 * The parameters of `kernel:operation`: run one operation of content.
 */
export interface OperationParams {
  /** The operation. */
  readonly op: Op;
  /** The participants of the operation. */
  readonly subjects: Subjects;
}

/**
 * The parameters of `kernel:reaction`: a trigger of an effect fires, or an event ends an effect.
 */
export interface ReactionParams {
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
  /** The participant the event is about, as `target`. */
  readonly subjects: Subjects;
}
