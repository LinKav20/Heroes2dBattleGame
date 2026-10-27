import type { ContentRegistry } from '../content/index.ts';
import type { EventKind } from '../extensions/index.ts';
import type { SidesVisibility, UnitId, Visibility } from '../ids/index.ts';
import type { BattleState } from '../model/index.ts';
import type { DataView, ExtensionData, Registry } from '../names/index.ts';

/**
 * What the kernel needs to build a projection: the content of the battle, the visibility of the actor, the kinds of
 * events and the data that extensions declare, by the full name of the extension.
 */
export interface ProjectionSetup {
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** What the actor sees. */
  readonly visibility: Visibility;
  /** The kinds of events, those of the kernel included. */
  readonly events: Registry<EventKind>;
  /** The data that extensions keep in the state, by the full name of the extension. */
  readonly data: ReadonlyMap<string, ExtensionData>;
}

/**
 * What the kernel needs to build a projection for an actor who sees what some sides see.
 */
export interface SidesSetup extends ProjectionSetup {
  /** The sides whose view the actor has. */
  readonly visibility: SidesVisibility;
}

/**
 * One full state as an actor who sees what some sides see looks at it, for the projection of its parts.
 */
export interface Lens {
  /** The full state. */
  readonly state: BattleState;
  /** The setup of the projection. */
  readonly setup: SidesSetup;
  /** What the actor sees of the units of the state. */
  readonly view: DataView;
  /** The units whose cells the scenario fixed. */
  readonly fixed: ReadonlySet<UnitId>;
}
