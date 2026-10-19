import type { ContentRegistry } from '../content/index.ts';
import { battlefieldEffects, unitDefinitionEffects } from '../expressions/index.ts';
import type { ContentName, SideId } from '../ids/index.ts';
import {
  findHazard,
  findSide,
  findUnit,
  type AppliedEffect,
  type BattleState,
  type EffectHolder,
} from '../model/index.ts';

/**
 * A holder of effects with the effects applied to it.
 */
export interface HeldEffects {
  /** The holder. */
  readonly holder: EffectHolder;
  /** The side of the holder, if it has one. */
  readonly side?: SideId;
  /** The applied effects in the order they were applied. */
  readonly effects: readonly AppliedEffect[];
}

/**
 * An effect that acts in the battle: an applied effect or an effect of a definition of its holder.
 */
export interface ActingEffect {
  /** The full name of the effect. */
  readonly effect: ContentName;
  /** The holder of the effect. */
  readonly holder: EffectHolder;
  /** The side of the holder, if it has one. */
  readonly side?: SideId;
  /** The applied effect; an effect of a definition has none. */
  readonly applied?: AppliedEffect;
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
      return findHazard(state, holder.hazard)?.effects ?? [];
    }

    case 'side': {
      return findSide(state, holder.side)?.effects ?? [];
    }

    case 'unit': {
      return findUnit(state, holder.unit)?.effects ?? [];
    }

    default: {
      throw new TypeError('Unknown kind of effect holder.');
    }
  }
}

/**
 * Returns the effects of definitions a holder has: the effects of the creature and the equipped items of a unit and of
 * the auras that cover it, the effects of the battlefield for the field, and none for a side or a hazard zone.
 *
 * @throws {ContentError} If the content has no definition the holder refers to.
 */
export function definitionEffectsOf(
  state: BattleState,
  content: ContentRegistry,
  holder: EffectHolder,
): readonly ContentName[] {
  if (holder.kind === 'field') return battlefieldEffects(state, content);

  if (holder.kind !== 'unit') return [];

  const unit = findUnit(state, holder.unit);

  return unit === undefined ? [] : unitDefinitionEffects(content, unit);
}

/**
 * Returns every holder of the battle with its applied effects: units, sides, the field and hazard zones.
 */
export function allHolders(state: BattleState): readonly HeldEffects[] {
  return [
    ...state.units.map(({ effects, id, side }) => ({ effects, holder: { kind: 'unit', unit: id } as const, side })),
    ...state.sides.map(({ effects, id }) => ({ effects, holder: { kind: 'side', side: id } as const, side: id })),
    { effects: state.field.effects, holder: { kind: 'field' } as const },
    ...state.field.hazards.map(({ effects, id }) => ({ effects, holder: { hazard: id, kind: 'hazard' } as const })),
  ];
}

/**
 * Returns the effects among the given ones that act in the battle: for every holder, the effects of its definitions,
 * then its applied effects. The battlefield comes as the definition of the field.
 *
 * @throws {ContentError} If the content has no definition a holder refers to.
 */
export function actingEffects(
  state: BattleState,
  content: ContentRegistry,
  wanted: ReadonlySet<ContentName>,
): readonly ActingEffect[] {
  return allHolders(state).flatMap(({ effects, holder, side }) => {
    const owner = side === undefined ? {} : { side };
    const definitions = definitionEffectsOf(state, content, holder)
      .filter((effect) => wanted.has(effect))
      .map((effect) => ({ effect, holder, ...owner }));
    const applied = effects
      .filter(({ effect }) => wanted.has(effect))
      .map((effect) => ({ applied: effect, effect: effect.effect, holder, ...owner }));

    return [...definitions, ...applied];
  });
}

/**
 * Returns the side a holder belongs to, if any.
 */
export function sideOf(state: BattleState, holder: EffectHolder): SideId | undefined {
  if (holder.kind === 'side') return holder.side;

  return holder.kind === 'unit' ? findUnit(state, holder.unit)?.side : undefined;
}
