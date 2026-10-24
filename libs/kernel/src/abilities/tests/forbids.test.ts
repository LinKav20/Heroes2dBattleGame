import { describe, expect, it } from 'vitest';
import type { ContentRegistry, Effect } from '../../content/index.ts';
import type { BattleState } from '../../model/index.ts';
import { ABILITY_CONTENT, FIRE_ARROW, RALLY, READY, useAbility, withArchers } from '../../tests/abilities.ts';
import { ARCHERS, KERNEL, PIKEMEN } from '../../tests/battle.ts';
import { applied, effect, node } from '../../tests/fixtures.ts';
import type { AbilityRequest } from '../index.ts';

describe('the abilities that effects forbid', () => {
  it.each([
    { forbids: ['Spell'], name: 'a tag above its tag', reason: { ability: ARROW.ability, tag: 'Spell' } },
    { forbids: ['Spell.Fire'], name: 'its tag', reason: { ability: ARROW.ability, tag: 'Spell.Fire' } },
    { forbids: ['Spell.Ice'], name: 'another tag', reason: undefined },
    { forbids: ['Spell.Fire.Big'], name: 'a tag below its tag', reason: undefined },
  ])('forbid an ability by $name, as the command does', ({ forbids, reason }) => {
    const content = withEffect({ forbids });
    const state = withArchers(READY, { effects: [applied(91, 'demo:hush')] });

    expect(answers(state, content)).toStrictEqual(reasonOf(reason));
  });

  it('forbid it from every effect that acts on the unit: of its creature, its side and the field', () => {
    const content = withEffect({ forbids: ['Spell'] });
    const archer = content.creatures['demo:archer'];

    if (archer === undefined) throw new Error('No archer');

    const creatures = { ...content.creatures, 'demo:archer': { ...archer, effects: ['demo:hush'] } };
    const ofCreature = { ...content, creatures };
    const ofSide = sideWith(READY, 'attacker', [applied(91, 'demo:hush')]);
    const ofField = { ...READY, field: { ...READY.field, effects: [applied(91, 'demo:hush')] } };
    const forbidden = reasonOf({ ability: 'demo:fire-arrow', tag: 'Spell' });

    expect(answers(READY, ofCreature)).toStrictEqual(forbidden);
    expect(answers(ofSide, content)).toStrictEqual(forbidden);
    expect(answers(ofField, content)).toStrictEqual(forbidden);
    expect(answers(READY, content)).toStrictEqual(reasonOf(undefined));
  });

  it('forbid nothing while the condition of activity of the effect does not hold', () => {
    const content = withEffect({
      activeWhile: node('kernel:variable-is', { value: true, variable: 'hushed' }),
      forbids: ['Spell'],
    });
    const base = withArchers(READY, { effects: [applied(91, 'demo:hush')] });
    const state = { ...base, variables: { ...base.variables, hushed: false } };
    const hushed = { ...base, variables: { ...base.variables, hushed: true } };

    expect(answers(state, content)).toStrictEqual(reasonOf(undefined));
    expect(answers(hushed, content)).toStrictEqual(reasonOf({ ability: 'demo:fire-arrow', tag: 'Spell' }));
  });

  it('forbid an ability of a side by the effects of the side', () => {
    const base = withEffect({ forbids: ['Command'] });
    const content = { ...base, abilities: { ...base.abilities, 'demo:rally': { ...RALLY, tags: ['Command.Rally'] } } };
    const state = sideWith(READY, 'attacker', [applied(91, 'demo:hush')]);
    const attacker = { kind: 'side', side: 'attacker' } as const;
    const request: AbilityRequest = { ability: 'demo:rally', targets: [attacker], user: attacker };
    const result = KERNEL.execute(state, useAbility('demo:rally', request.targets, { side: 'attacker' }), content);

    expect(KERNEL.checkAbility(state, request, content)).toStrictEqual(result.ok ? undefined : result.rejection);
    expect(result.ok ? undefined : result.rejection.reason).toBe('kernel:ability-forbidden');
  });
});

const ARROW: AbilityRequest = { ability: 'demo:fire-arrow', targets: [PIKEMEN], user: ARCHERS };

function withEffect(change: Partial<Effect>): ContentRegistry {
  return {
    ...ABILITY_CONTENT,
    abilities: { ...ABILITY_CONTENT.abilities, 'demo:fire-arrow': { ...FIRE_ARROW, tags: ['Spell.Fire'] } },
    effects: {
      ...ABILITY_CONTENT.effects,
      'demo:hush': effect('demo:hush', { duration: { kind: 'battle' }, ...change }),
    },
  };
}

function sideWith(state: BattleState, id: string, effects: BattleState['sides'][number]['effects']): BattleState {
  return { ...state, sides: state.sides.map((side) => (side.id === id ? { ...side, effects } : side)) };
}

function answers(state: BattleState, content: ContentRegistry): unknown {
  const result = KERNEL.execute(state, useAbility('demo:fire-arrow', [PIKEMEN]), content);

  return {
    check: KERNEL.checkAbility(state, ARROW, content)?.params,
    command: result.ok ? undefined : result.rejection.params,
  };
}

function reasonOf(params: object | undefined): unknown {
  return { check: params, command: params };
}
