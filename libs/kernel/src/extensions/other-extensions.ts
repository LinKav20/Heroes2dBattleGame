import type { Extension } from '../names/index.ts';

/**
 * A check such as "adjacent cell" that content uses in conditions.
 */
export interface ConditionExtension extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'condition';
}

/**
 * A variant of a mechanic that rulesets refer to, such as the turn order or the attack calculation.
 */
export interface MechanicExtension extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'mechanic';
}

/**
 * An operation such as damage, healing or summoning that content combines into behavior.
 */
export interface OperationExtension extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'operation';
}

/**
 * A field topology, such as hexes.
 */
export interface TopologyExtension extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'topology';
}
