import type { ChosenMechanic, MechanicContext, Unit } from '@heroes2dgame/kernel';
import { describe, expect, it } from 'vitest';
import { chanceHit, chosenChance, type Chance } from '../chances.ts';
import { started, unitOf } from './world.ts';

describe('chances of morale and luck', () => {
  it('succeed on the highest sides for a good chance and on the lowest for a bad one', () => {
    const good: Chance = { hits: 2, kind: 'good', roll: 'core:morale-roll', sides: 24 };
    const bad: Chance = { ...good, kind: 'bad', sides: 12 };

    expect([22, 23, 24].map((result) => chanceHit(good, { dice: [result], kind: 'roll', name: good.roll, result })))
      .toStrictEqual([false, true, true]);

    expect([1, 2, 3].map((result) => chanceHit(bad, { dice: [result], kind: 'roll', name: bad.roll, result })))
      .toStrictEqual([true, true, false]);
  });

  it('take only a roll of their own random value', () => {
    const chance: Chance = { hits: 1, kind: 'good', roll: 'core:luck-roll', sides: 24 };

    expect(() => chanceHit(chance, { dice: [24], kind: 'roll', name: 'core:damage-roll', result: 24 }))
      .toThrow(TypeError);

    expect(() => chanceHit(chance, { kind: 'choice', option: 'yes' })).toThrow(TypeError);
  });

  it('refuse a chosen variant without a function chance and a chance it gives out of bounds', () => {
    const foreign = chosen({ kind: 'mechanic', mechanic: 'rules-stdlib:luck', name: 'acme:luck', schema: {} });
    const right: Chance = { hits: 1, kind: 'good', roll: 'core:luck-roll', sides: 24 };
    const strange: unknown = { ...right, kind: 'great' };
    const outOfBounds: readonly Chance[] = [{ ...right, hits: 0 }, { ...right, hits: 25 }, { ...right, sides: 0 }];

    expect(() => chosenChance(foreign)).toThrow(TypeError);
    expect(chosenChance(undefined)).toBeUndefined();
    expect(given(right)).toStrictEqual({ kind: 'value', value: right });
    expect(() => given(strange as Chance)).toThrow(TypeError);

    for (const chance of outOfBounds) {
      expect(() => given(chance)).toThrow(TypeError);
    }
  });
});

const NOTHING: unknown = {};
const CONTEXT = NOTHING as MechanicContext;

function given(chance: Chance): unknown {
  return chosenChance(chosen(luck(chance)))?.variant.chance(CONTEXT, unitOf(started(), 'pikemen-1'));
}

function chosen(variant: ChosenMechanic['variant']): ChosenMechanic {
  return { context: CONTEXT, variant };
}

function luck(chance: Chance): ChosenMechanic['variant'] {
  const variant = {
    chance: (context: MechanicContext, unit: Unit) => ({ kind: 'value', value: unit.id === '' ? undefined : chance }),
    kind: 'mechanic',
    mechanic: 'rules-stdlib:luck',
    name: 'acme:luck',
    schema: {},
  } as const;

  return variant;
}
