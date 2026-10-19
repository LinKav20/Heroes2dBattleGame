import type { Extension } from '../names/index.ts';

/**
 * A variant of a mechanic that rulesets refer to, such as the turn order or the attack calculation.
 */
export interface MechanicExtension extends Extension {
  /** The registry the extension belongs to. */
  readonly kind: 'mechanic';
}
