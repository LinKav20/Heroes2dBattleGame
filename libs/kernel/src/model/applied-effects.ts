import type { ContentName, SideId, UnitId, VisibleTo } from '../ids/index.ts';
import type { JsonObject } from '../json/index.ts';

/**
 * An effect applied to a holder: a unit, a side, the field or a hazard zone.
 */
export interface AppliedEffect {
  /** The identifier of this application; a larger one was applied later. */
  readonly id: number;
  /** The definition of the effect. */
  readonly effect: ContentName;
  /** The unit that applied the effect, if any. */
  readonly sourceUnit?: UnitId;
  /** The side that applied the effect, if any. */
  readonly sourceSide?: SideId;
  /** The rounds or turns left, for an effect with a counted duration. */
  readonly remaining?: number;
  /** How many times the effect is stacked. */
  readonly stacks: number;
  /** Whether the effect acts now; an effect is switched off while its condition does not hold. */
  readonly active: boolean;
  /** The values the effect was applied with, such as its strength. */
  readonly params: JsonObject;
  /** Which sides see the effect. */
  readonly visibleTo: VisibleTo;
}
