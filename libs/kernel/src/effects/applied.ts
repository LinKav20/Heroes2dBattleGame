import type { ContentRegistry, Effect } from '../content/index.ts';
import { appliedSource } from '../expressions/index.ts';
import type { Subjects } from '../extensions/index.ts';
import { VISIBLE_TO_ALL, VISIBLE_TO_NONE, type ContentName, type VisibleTo } from '../ids/index.ts';
import { holderTarget, type AppliedEffect, type BattleState, type EffectHolder } from '../model/index.ts';
import { definitionEffectsOf, effectsOf, sideOf } from './holders.ts';

/**
 * An effect found still in place: its applied effect, or nothing for an effect of a definition.
 */
export interface PresentEffect {
  /** The applied effect, if it is one. */
  readonly applied?: AppliedEffect;
}

/**
 * Returns the participants of an effect on its holder: the holder as `self` and `target`, and the one that applied
 * the effect as `source`.
 */
export function appliedSubjects(holder: EffectHolder, applied?: AppliedEffect): Subjects {
  const self = holderTarget(holder);
  const source = applied === undefined ? undefined : appliedSource(applied);

  return {
    ...(self === undefined ? {} : { self, target: self }),
    ...(source === undefined ? {} : { source }),
  };
}

/**
 * Returns an effect if it is still in place: the applied effect with this identifier on its holder, or the effect in
 * the definitions of its holder; nothing if it is gone.
 *
 * @throws {ContentError} If the content has no definition the holder refers to.
 */
export function presentEffect(
  state: BattleState,
  content: ContentRegistry,
  holder: EffectHolder,
  effect: ContentName,
  applied: number | undefined,
): PresentEffect | undefined {
  if (applied === undefined) return definitionEffectsOf(state, content, holder).includes(effect) ? {} : undefined;

  const found = effectsOf(state, holder).find(({ id }) => id === applied);

  return found === undefined ? undefined : { applied: found };
}

/**
 * Returns who sees an effect on a holder: everybody, the side of the holder, or nobody but full visibility.
 */
export function visibilityOf(effect: Effect, state: BattleState, holder: EffectHolder): VisibleTo {
  if (effect.visibility === 'all') return VISIBLE_TO_ALL;

  const side = effect.visibility === 'owner' ? sideOf(state, holder) : undefined;

  return side === undefined ? VISIBLE_TO_NONE : [side];
}

/**
 * Returns the counter of a counted duration at its start, or nothing for another duration.
 */
export function remainingOf(effect: Effect): { readonly remaining?: number } {
  const { duration } = effect;

  return duration.kind === 'rounds' || duration.kind === 'turns' ? { remaining: duration.count } : {};
}
