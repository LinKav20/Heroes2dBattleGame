import type { ContentRegistry, Effect } from '../content/index.ts';
import type { Subjects } from '../extensions/index.ts';
import { VISIBLE_TO_NONE, type ContentName, type SideId, type VisibleTo } from '../ids/index.ts';
import type { AppliedEffect, BattleState, EffectHolder, Target } from '../model/index.ts';
import { ownValue } from '../shared/index.ts';

/**
 * A holder of effects with the effects applied to it.
 */
export interface HeldEffects {
  /** The holder. */
  readonly holder: EffectHolder;
  /** The applied effects in the order they were applied. */
  readonly effects: readonly AppliedEffect[];
}

/**
 * Returns the definition of an effect.
 *
 * @throws {TypeError} If the content has no such effect.
 */
export function effectDefinition(content: ContentRegistry, name: ContentName): Effect {
  const effect = ownValue(content.effects, name);

  if (effect === undefined) throw new TypeError(`The content has no effect ${JSON.stringify(name)}.`);

  return effect;
}

/**
 * Returns the effects applied to a holder, or none if the holder does not exist.
 */
export function effectsOf(state: BattleState, holder: EffectHolder): readonly AppliedEffect[] {
  switch (holder.kind) {
    case 'field': {
      return state.field.effects;
    }

    case 'hazard': {
      return state.field.hazards.find(({ id }) => id === holder.hazard)?.effects ?? [];
    }

    case 'side': {
      return state.sides.find(({ id }) => id === holder.side)?.effects ?? [];
    }

    case 'unit': {
      return state.units.find(({ id }) => id === holder.unit)?.effects ?? [];
    }

    default: {
      throw new TypeError('Unknown kind of effect holder.');
    }
  }
}

/**
 * Returns every holder of the battle with its applied effects: units, sides, the field and hazard zones.
 */
export function allHolders(state: BattleState): readonly HeldEffects[] {
  return [
    ...state.units.map(({ effects, id }) => ({ effects, holder: { kind: 'unit', unit: id } as const })),
    ...state.sides.map(({ effects, id }) => ({ effects, holder: { kind: 'side', side: id } as const })),
    { effects: state.field.effects, holder: { kind: 'field' } as const },
    ...state.field.hazards.map(({ effects, id }) => ({ effects, holder: { hazard: id, kind: 'hazard' } as const })),
  ];
}

/**
 * Returns a holder as a participant of a formula: a unit or a side, or nothing for the field and a hazard zone.
 */
export function asTarget(holder: EffectHolder): Target | undefined {
  if (holder.kind === 'side') return { kind: 'side', side: holder.side };

  return holder.kind === 'unit' ? { kind: 'unit', unit: holder.unit } : undefined;
}

/**
 * Returns the side a holder belongs to, if any.
 */
export function sideOf(state: BattleState, holder: EffectHolder): SideId | undefined {
  if (holder.kind === 'side') return holder.side;

  return holder.kind === 'unit' ? state.units.find(({ id }) => id === holder.unit)?.side : undefined;
}

/**
 * Returns who sees an effect on a holder: everybody, the side of the holder, or nobody but full visibility.
 */
export function visibilityOf(effect: Effect, state: BattleState, holder: EffectHolder): VisibleTo {
  if (effect.visibility === 'all') return 'all';

  const side = effect.visibility === 'owner' ? sideOf(state, holder) : undefined;

  return side === undefined ? VISIBLE_TO_NONE : [side];
}

/**
 * Returns the participants of an applied effect: its holder as `self` and `target` and the one that applied it as
 * `source`.
 */
export function appliedSubjects(holder: EffectHolder, applied?: AppliedEffect): Subjects {
  const self = asTarget(holder);
  const source = applied === undefined ? undefined : sourceOf(applied);

  return {
    ...(self === undefined ? {} : { self, target: self }),
    ...(source === undefined ? {} : { source }),
  };
}

function sourceOf(applied: AppliedEffect): Target | undefined {
  if (applied.sourceUnit !== undefined) return { kind: 'unit', unit: applied.sourceUnit };

  return applied.sourceSide === undefined ? undefined : { kind: 'side', side: applied.sourceSide };
}
