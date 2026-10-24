import { describe, expect, it } from 'vitest';
import { ContentError, type Ability, type ContentRegistry, type TargetRule } from '../../content/index.ts';
import type { BattleState, Unit } from '../../model/index.ts';
import {
  ABILITY_CONTENT,
  ability,
  execute,
  READY,
  reason,
  used,
  useAbility,
  withArchers,
} from '../../tests/abilities.ts';
import { PIKEMEN } from '../../tests/battle.ts';
import { node, unitOf } from '../../tests/fixtures.ts';

describe('an ability that takes dead targets', () => {
  it('brings a dead unit back with healing that revives, and still heals a living one', () => {
    const raised = used(DEAD, useAbility('demo:raise', [PIKEMEN]), CONTENT);
    const wounded = withPikemen(READY, { health: 4 });
    const healed = used(wounded, useAbility('demo:raise', [PIKEMEN]), CONTENT);

    expect(unitOf(raised.state, 'pikemen-1')).toMatchObject({ count: 2, health: 5 });
    expect(unitOf(healed.state, 'pikemen-1')).toMatchObject({ count: 20, health: 10 });
  });

  it('measures the range to a dead unit from the cells its creature would take in its cell', () => {
    const near = withArchers(DEAD, { cell: '8,5' });
    const big = withArchers(withPikemen(DEAD, { facing: 'west' }), { cell: '7,5' });

    expect(unitOf(used(near, useAbility('demo:raise-near', [PIKEMEN]), CONTENT).state, 'pikemen-1').count).toBe(2);

    expect(reason(execute(withArchers(DEAD, { cell: '7,5' }), useAbility('demo:raise-near', [PIKEMEN]), CONTENT)))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:raise-near', problem: 'range', target: 0 }]);

    expect(reason(execute(big, useAbility('demo:raise-near', [PIKEMEN]), LARGE))).toBeUndefined();
  });

  it('leaves a dead target to abilities that take dead targets, and needs its cell and its range', () => {
    const { cell, ...unplaced } = unitOf(DEAD, 'pikemen-1');
    const buried = { ...DEAD, units: DEAD.units.map((unit) => (unit.id === 'pikemen-1' ? unplaced : unit)) };

    expect(cell).toBe('14,5');

    expect(reason(execute(DEAD, useAbility('demo:mend', [PIKEMEN]), CONTENT)))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:mend', problem: 'dead', target: 0 }]);

    expect(reason(execute(DEAD, useAbility('demo:mend-alive', [PIKEMEN]), CONTENT)))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:mend-alive', problem: 'dead', target: 0 }]);

    expect(reason(execute(buried, useAbility('demo:raise', [PIKEMEN]), CONTENT)))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:raise', problem: 'off-field', target: 0 }]);

    expect(reason(execute(DEAD, useAbility('demo:raise-near', [PIKEMEN]), CONTENT)))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:raise-near', problem: 'range', target: 0 }]);
  });

  it('treats dead targets that are not units, or a flag that is not true or false, as errors of content', () => {
    const cells = withAbility(raise('demo:raise', { dead: true, kind: 'cell' }));
    const command = useAbility('demo:raise', [{ cell: '14,5', kind: 'cell' }]);

    expect(() => execute(DEAD, command, cells)).toThrow(ContentError);
    expect(() => execute(DEAD, command, cells)).toThrow('takes dead targets, but its target is not a unit');

    for (const [target, message] of WRONG_TARGETS) {
      expect(() => execute(DEAD, useAbility('demo:raise', [PIKEMEN]), withAbility(raise('demo:raise', target))))
        .toThrow(message);
    }
  });
});

const DEAD: BattleState = withPikemen(READY, { count: 0, health: 0 });

const CONTENT: ContentRegistry = withAbility(
  raise('demo:raise', { dead: true, kind: 'unit' }),
  raise('demo:raise-near', { dead: true, kind: 'unit', range: 6 }),
  raise('demo:mend', { kind: 'unit' }),
  raise('demo:mend-alive', { dead: false, kind: 'unit' }),
);

const LARGE: ContentRegistry = {
  ...CONTENT,
  creatures: Object.fromEntries(Object.entries(CONTENT.creatures)
    .map(([name, creature]) => [name, name === 'demo:pikeman' ? { ...creature, size: 2 } : creature])),
};

const WRONG_TARGETS: ReadonlyArray<readonly [TargetRule, string]> = [
  [{ dead: 'yes' as unknown as boolean, kind: 'unit' }, 'needs true or false in dead'],
  [{ kind: 'unit', sight: 'yes' as unknown as boolean }, 'needs true or false in sight'],
  [{ kind: 'none', sight: true }, 'has no targets, but has sight in target'],
  [{ dead: true, kind: 'self' }, 'has no targets, but has dead in target'],
];

function raise(name: string, target: TargetRule): Ability {
  return ability(name, { ops: [node('kernel:heal', { amount: 15, revive: true, to: 'target' })], target });
}

function withAbility(...added: readonly Ability[]): ContentRegistry {
  const archer = ABILITY_CONTENT.creatures['demo:archer'];

  if (archer === undefined) throw new Error('No archer');

  return {
    ...ABILITY_CONTENT,
    abilities: { ...ABILITY_CONTENT.abilities, ...Object.fromEntries(added.map((one) => [one.name, one])) },
    creatures: {
      ...ABILITY_CONTENT.creatures,
      'demo:archer': { ...archer, abilities: [...archer.abilities, ...added.map(({ name }) => name)] },
    },
  };
}

function withPikemen(state: BattleState, change: Partial<Unit>): BattleState {
  return { ...state, units: state.units.map((unit) => (unit.id === 'pikemen-1' ? { ...unit, ...change } : unit)) };
}
