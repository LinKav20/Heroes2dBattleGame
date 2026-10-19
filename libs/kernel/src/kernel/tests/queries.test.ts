import { describe, expect, it } from 'vitest';
import type { AbilityRequest } from '../../abilities/index.ts';
import type { ContentRegistry } from '../../content/index.ts';
import type { BattleState } from '../../model/index.ts';
import { ABILITY_CONTENT, ability, execute, READY, useAbility, withArchers } from '../../tests/abilities.ts';
import { ARCHERS, KERNEL, PIKEMEN } from '../../tests/battle.ts';
import { node, unitOf } from '../../tests/fixtures.ts';

describe('the queries of a kernel', () => {
  it('tells why the rules forbid using an ability now, as the command to use it does', () => {
    const drained = withArchers(READY, { resources: { 'demo:mana': 0 } });
    const result = execute(drained, useAbility('demo:fire-arrow', [PIKEMEN]));
    const checked = KERNEL.checkAbility(drained, ARROW, ABILITY_CONTENT);

    expect(KERNEL.checkAbility(READY, ARROW, ABILITY_CONTENT)).toBeUndefined();
    expect(result.ok ? undefined : result.rejection).toStrictEqual(checked);
    expect(checked?.reason).toBe('kernel:not-enough-resource');
  });

  it('gives a rejection of a formula, such as a distance from a unit that is not on the field', () => {
    const { cell, ...unplaced } = unitOf(GRID_STATE, 'archers-1');
    const state = { ...GRID_STATE, units: GRID_STATE.units.map((unit) => (unit.id === 'archers-1' ? unplaced : unit)) };
    const touch = { ability: 'demo:touch', targets: [PIKEMEN], user: ARCHERS };

    expect(cell).toBeDefined();
    expect(KERNEL.checkAbility(GRID_STATE, touch, TOUCHING)).toBeUndefined();

    expect(KERNEL.checkAbility(state, touch, TOUCHING)).toStrictEqual({
      code: 'rule-violation',
      params: { unit: 'archers-1' },
      reason: 'kernel:not-on-field',
    });
  });

  it('gives the field of a state with the units on it', () => {
    const field = KERNEL.field(GRID_STATE, ABILITY_CONTENT);

    expect(field.cellsOf('archers-1')).toStrictEqual(['1,5']);
    expect(field.distance('1,5', '14,5')).toBe(13);
  });

  it('needs the content of the battle', () => {
    const other = { ...ABILITY_CONTENT, contentHash: 'other' };

    expect(() => KERNEL.field(GRID_STATE, other)).toThrow('but the battle was started with');
    expect(() => KERNEL.checkAbility(READY, ARROW, other)).toThrow('but the battle was started with');
  });
});

const ARROW: AbilityRequest = { ability: 'demo:fire-arrow', targets: [PIKEMEN], user: ARCHERS };

const GRID_STATE: BattleState = {
  ...READY,
  field: { ...READY.field, hazards: [], params: { height: 11, width: 15 }, topology: 'acme:grid' },
  units: READY.units.map((unit) => (unit.id === 'pikemen-1' ? { ...unit, cell: '2,5' } : unit)),
};

const TOUCHING: ContentRegistry = (() => {
  const archer = ABILITY_CONTENT.creatures['demo:archer'];

  if (archer === undefined) throw new Error('No archer');

  const touch = ability('demo:touch', {
    target: {
      filter: node('kernel:compare', {
        left: node('kernel:distance', { from: 'self', to: 'target' }),
        operator: '<=',
        right: 1,
      }),
      kind: 'unit',
    },
  });

  return {
    ...ABILITY_CONTENT,
    abilities: { ...ABILITY_CONTENT.abilities, [touch.name]: touch },
    creatures: { ...ABILITY_CONTENT.creatures, 'demo:archer': { ...archer, abilities: [touch.name] } },
  };
})();
