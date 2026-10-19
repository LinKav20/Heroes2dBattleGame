import { ContentError, type Aura, type Effect } from '../content/index.ts';
import type { EffectHolder } from '../model/index.ts';

/**
 * Checks the parts of the definition of an effect that matter when it is applied to a holder: an instant effect has
 * only what it uses, a counted duration and the largest number of stacks are whole numbers from 1, and an effect of
 * the field or a hazard zone counts its duration at the end of a round, because these holders have no turns.
 *
 * @throws {ContentError} If the definition breaks any of these rules.
 */
export function checkEffect(effect: Effect, holder: EffectHolder): void {
  const problem = problemOf(effect, holder);

  if (problem !== undefined) {
    throw new ContentError(`The effect ${JSON.stringify(effect.name)} ${problem}.`, { definition: effect.name });
  }
}

/**
 * Checks the aura of an effect: its area is a radius of a whole number of cells from 0 around the holder.
 *
 * @throws {ContentError} If the aura breaks this rule.
 */
export function checkAura(effect: Effect, aura: Aura): void {
  const { shape, size } = aura.area;

  if (shape !== 'radius' || !Number.isSafeInteger(size) || size < 0) {
    throw new ContentError(
      `The effect ${JSON.stringify(effect.name)} needs a radius of a whole number of cells from 0 for its aura.`,
      { definition: effect.name },
    );
  }
}

const INSTANT_UNUSED: ReadonlyArray<keyof Effect> = [
  'activeWhile',
  'aura',
  'endsOn',
  'forbids',
  'grantsTags',
  'maxStacks',
  'modifiers',
  'onRemove',
  'onTurn',
  'strength',
  'triggers',
];

function problemOf(effect: Effect, holder: EffectHolder): string | undefined {
  const { duration, maxStacks } = effect;

  if (duration.kind === 'instant') {
    const unused = INSTANT_UNUSED.filter((part) => {
      const value: unknown = effect[part];

      return Array.isArray(value) ? value.length > 0 : value !== undefined;
    });

    return unused.length === 0 ? undefined : `is instant, but has ${unused.join(', ')}, which it never uses`;
  }

  if (maxStacks !== undefined && !(Number.isSafeInteger(maxStacks) && maxStacks >= 1)) {
    return 'needs a whole number from 1 in maxStacks';
  }

  if (duration.kind !== 'rounds' && duration.kind !== 'turns') return undefined;

  if (!(Number.isSafeInteger(duration.count) && duration.count >= 1)) return 'needs a counted duration from 1';

  const turnless = holder.kind === 'field' || holder.kind === 'hazard';

  return turnless && duration.tick !== 'round-end' ? 'on the field counts its duration only at round-end' : undefined;
}
