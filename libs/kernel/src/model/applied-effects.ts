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
  /**
   * The mark of activity: whether the condition of activity held when the kernel last checked it. Only an effect of a
   * unit has the mark; an effect of a side, the field or a hazard zone is always marked active, because its condition
   * is checked for every unit separately.
   */
  readonly active: boolean;
  /** The strength the effect was applied with, if its definition has a formula of strength. */
  readonly strength?: number;
  /** The values the effect was applied with. */
  readonly params: JsonObject;
  /** Which sides see the effect. */
  readonly visibleTo: VisibleTo;
}
