import type { ContentName, Tag } from '../ids/index.ts';
import type { Modifier } from './attributes.ts';
import type { Op, Predicate, ValueExpr } from './expressions.ts';

/**
 * A definition of an effect: anything that changes a unit, a side or the field for a while or for good.
 */
export interface Effect {
  /** The full name of the effect. */
  readonly name: ContentName;
  /** The tags of the effect, for example `Debuff.Poison`. */
  readonly tags: readonly Tag[];
  /** The effect is not applied to a unit that has any of these tags. */
  readonly blockedBy: readonly Tag[];
  /** How long the effect lasts. */
  readonly duration: EffectDuration;
  /** The events that end the effect, for example taking damage or an attack of the holder. */
  readonly endsOn: readonly EffectEnd[];
  /** What happens when the effect is applied again. */
  readonly stacking: EffectStacking;
  /** How many times the effect stacks at most with the stacking mode `stack`; without it there is no limit. */
  readonly maxStacks?: number;
  /** The strength of the effect; with the stacking mode `strongest` the effect with the larger strength stays. */
  readonly strength?: ValueExpr;
  /** The modifiers the effect adds. */
  readonly modifiers: readonly Modifier[];
  /** The tags the effect gives to its holder. */
  readonly grantsTags: readonly Tag[];
  /** The effect is applied only if this condition holds. */
  readonly condition?: Predicate;
  /** The effect is switched off while this condition does not hold. */
  readonly activeWhile?: Predicate;
  /** Effects with any of these tags are removed when this effect is applied. */
  readonly removes: readonly Tag[];
  /** Abilities with any of these tags cannot be used while the effect is active. */
  readonly forbids: readonly Tag[];
  /** Operations to run when the effect is applied. */
  readonly onApply: readonly Op[];
  /**
   * Operations to run every turn: at the moment set by `tick` for a counted duration, and otherwise in the turn of the
   * holder, that is at the start of the turn of a unit or a side and at the end of a round for the field or a hazard
   * zone.
   */
  readonly onTurn: readonly Op[];
  /** Operations to run when the effect is removed. */
  readonly onRemove: readonly Op[];
  /** Reactions to battle events. */
  readonly triggers: readonly TriggerDef[];
  /** The aura the effect creates around its holder, if any. */
  readonly aura?: Aura;
  /**
   * Who sees the effect: everybody, the side of the holder only, or nobody but an actor with full visibility. An
   * effect seen by its own side on the field or a hazard zone, which have no side, is seen by nobody but full
   * visibility.
   */
  readonly visibility: 'all' | 'none' | 'owner';
}

/**
 * How long an effect lasts.
 */
export type EffectDuration = BattleDuration | CountedDuration | InstantDuration;

/**
 * The effect acts once, when it is applied.
 */
export interface InstantDuration {
  /** The kind of duration. */
  readonly kind: 'instant';
}

/**
 * The effect lasts until the end of the battle.
 */
export interface BattleDuration {
  /** The kind of duration. */
  readonly kind: 'battle';
}

/**
 * A duration in rounds or turns.
 */
export interface CountedDuration {
  /** What the counter counts. */
  readonly kind: 'rounds' | 'turns';
  /** The number of rounds or turns. */
  readonly count: number;
  /** When the counter goes down: at the start or the end of the holder's turn, or at the end of a round. */
  readonly tick: 'holder-turn-end' | 'holder-turn-start' | 'round-end';
}

/**
 * An event that ends an effect.
 */
export interface EffectEnd {
  /** The full name of the kind of event; an effect does not end by the events listed at `TriggerDef.on`. */
  readonly on: string;
  /** The event ends the effect only if this condition holds, for example if the holder is the attacker. */
  readonly condition?: Predicate;
}

/**
 * What happens when an effect is applied again: the effects stack, the duration is refreshed, the new one is ignored,
 * the strongest stays, or the new one replaces the old one.
 */
export type EffectStacking = 'ignore' | 'refresh' | 'replace' | 'stack' | 'strongest';

/**
 * A reaction of an effect to a battle event.
 */
export interface TriggerDef {
  /**
   * The full name of the kind of event. Effects do not react to the events the kernel gives while it runs a command
   * (`kernel:input-requested`, `kernel:input-closed`, `kernel:steps-saved`, `kernel:roll-made`,
   * `kernel:command-aborted`) and to `kernel:battle-ended`, after which no step runs.
   */
  readonly on: string;
  /** The trigger fires only if this condition holds. */
  readonly condition?: Predicate;
  /** The operations to run. */
  readonly ops: readonly Op[];
  /** Triggers with a higher priority fire first. */
  readonly priority: number;
}

/**
 * An aura: an effect that acts on the units around the holder as an effect of their own creature does. The area of an
 * aura is a radius of a whole number of cells from 0.
 */
export interface Aura {
  /** The area around the holder. */
  readonly area: AreaRule;
  /** Whose units the aura affects. */
  readonly affects: 'all' | 'allies' | 'enemies';
  /** The full name of the effect that acts on the covered units as their own. */
  readonly effect: ContentName;
}

/**
 * An area of cells that the field topology builds: a radius around a cell, or a line or a cone from the cell of the
 * user toward a cell.
 */
export interface AreaRule {
  /** The shape of the area. */
  readonly shape: 'cone' | 'line' | 'radius';
  /**
   * The size of the area in cells: the radius around the center, the length of a line, or how far a cone goes from
   * the user.
   */
  readonly size: number;
}
