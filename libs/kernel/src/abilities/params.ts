import type { ContentName, UnitId } from '../ids/index.ts';
import type { SideHolder, Target, UnitHolder } from '../model/index.ts';

/**
 * A unit or a side that uses an ability, the item it uses and the chosen targets. These are also the parameters of
 * `kernel:ability-use`.
 */
export interface AbilityRequest {
  /** The full name of the ability. */
  readonly ability: ContentName;
  /** The unit or the side that uses the ability. */
  readonly user: SideHolder | UnitHolder;
  /** The item of the unit whose ability it is, if the unit uses an item. */
  readonly item?: number;
  /** The chosen targets. */
  readonly targets: readonly Target[];
}

/**
 * The parameters of `kernel:ability-targets`: the operations of an ability run for its targets one at a time.
 */
export interface AbilityTargetsParams {
  /** The full name of the ability. */
  readonly ability: ContentName;
  /** The unit or the side that used the ability. */
  readonly user: SideHolder | UnitHolder;
  /** The chosen targets. */
  readonly targets: readonly Target[];
  /** The units in the area of an ability that targets an area, once the step has chosen them. */
  readonly units?: readonly UnitId[];
  /** The place of the next target among the targets, or among the units for an area. */
  readonly next: number;
}

/**
 * The parameters of `kernel:ability-tick`: a moment when counts of uses start again, cooldowns go down, actions of the
 * turn come back and resources are restored.
 */
export type AbilityTickParams = AbilityRoundTick | AbilityTurnTick;

/**
 * The start of the turn of a unit or a side.
 */
export interface AbilityTurnTick {
  /** The moment. */
  readonly moment: 'holder-turn-start';
  /** The unit or the side whose turn starts. */
  readonly holder: SideHolder | UnitHolder;
}

/**
 * The start of a round, for every unit and side.
 */
export interface AbilityRoundTick {
  /** The moment. */
  readonly moment: 'round-start';
}
