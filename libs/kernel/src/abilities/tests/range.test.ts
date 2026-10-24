import { describe, expect, it } from 'vitest';
import { ContentError, type Ability, type ContentRegistry, type Creature } from '../../content/index.ts';
import type { BattleState } from '../../model/index.ts';
import { ABILITY_CONTENT, ability, execute, READY, reason, used, useAbility } from '../../tests/abilities.ts';
import { markOp, PIKEMEN, types } from '../../tests/battle.ts';
import { node, unitOf } from '../../tests/fixtures.ts';

describe('the range and the area of an ability', () => {
  it('lets a unit target only units and cells within the range from its cells', () => {
    const far = execute(onGrid('14,5'), useAbility('demo:snipe', [PIKEMEN]), CONTENT);
    const near = used(onGrid('5,5'), useAbility('demo:snipe', [PIKEMEN]), CONTENT);

    expect(reason(far))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:snipe', problem: 'range', target: 0 }]);

    expect(unitOf(near.state, 'pikemen-1').health).toBe(9);
  });

  it('runs the operations for the units in the area that pass the filter', () => {
    const blast = used(onGrid('5,5'), useAbility('demo:fireball', [{ cell: '5,4', kind: 'cell' }]), CONTENT);
    const selfish = used(onGrid('5,5'), useAbility('demo:fireball', [{ cell: '1,4', kind: 'cell' }]), CONTENT);

    expect(unitOf(blast.state, 'pikemen-1').health).toBe(9);
    expect(types(selfish)).toStrictEqual(['kernel:ability-used']);
  });

  it('starts a line from the cell of the user nearest to the chosen cell', () => {
    const big = withCreature({ size: 2 });
    const near = onGrid('4,5');
    const units = near.units.map((unit) => (unit.id === 'archers-1' ? { ...unit, cell: '0,5' } : unit));
    const left = { ...near, units };
    const breath = used(left, useAbility('demo:breath', [{ cell: '2,5', kind: 'cell' }]), big);
    const short = used(onGrid('5,5'), useAbility('demo:breath', [{ cell: '2,5', kind: 'cell' }]), CONTENT);

    expect(unitOf(breath.state, 'pikemen-1').health).toBe(9);
    expect(unitOf(breath.state, 'archers-1').health).toBe(7);
    expect(unitOf(short.state, 'pikemen-1').health).toBe(10);
  });

  it('rejects every target of a ranged ability of a unit that is not on the field', () => {
    const { cell, ...unplaced } = unitOf(READY, 'archers-1');
    const field = onGrid('5,5');
    const state = { ...field, units: field.units.map((unit) => (unit.id === 'archers-1' ? unplaced : unit)) };

    expect(cell).toBeDefined();

    expect(reason(execute(state, useAbility('demo:snipe', [PIKEMEN]), CONTENT)))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:snipe', problem: 'range', target: 0 }]);
  });

  it('rejects a cell off the field and a cell beyond the range', () => {
    expect(reason(execute(onGrid('5,5'), useAbility('demo:fireball', [{ cell: '20,20', kind: 'cell' }]), CONTENT)))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:fireball', problem: 'off-field', target: 0 }]);

    expect(reason(execute(onGrid('5,5'), useAbility('demo:fireball', [{ cell: '14,10', kind: 'cell' }]), CONTENT)))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:fireball', problem: 'range', target: 0 }]);
  });

  it('measures the distance between participants with kernel:distance', () => {
    expect(used(onGrid('2,5'), useAbility('demo:touch', [PIKEMEN]), CONTENT).events).toHaveLength(1);

    expect(reason(execute(onGrid('5,5'), useAbility('demo:touch', [PIKEMEN]), CONTENT)))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:touch', problem: 'filter', target: 0 }]);
  });

  it('runs no operations for a dead unit in the area', () => {
    const counted = used(onGrid('5,5'), useAbility('demo:census', [{ cell: '5,4', kind: 'cell' }]), CONTENT);
    const field = onGrid('5,5');
    const units = field.units.map((unit) => (unit.id === 'pikemen-1' ? { ...unit, count: 0, health: 0 } : unit));
    const dead = { ...field, units };
    const empty = used(dead, useAbility('demo:census', [{ cell: '5,4', kind: 'cell' }]), CONTENT);

    expect(counted.state.variables.counted).toBe(true);
    expect(empty.state.variables.counted).toBeUndefined();
  });

  it('rejects a command when kernel:distance measures from a unit that is not on the field', () => {
    const { cell, ...unplaced } = unitOf(READY, 'archers-1');
    const field = onGrid('2,5');
    const state = { ...field, units: field.units.map((unit) => (unit.id === 'archers-1' ? unplaced : unit)) };

    expect(cell).toBeDefined();

    expect(reason(execute(state, useAbility('demo:touch', [PIKEMEN]), CONTENT)))
      .toStrictEqual(['kernel:not-on-field', { unit: 'archers-1' }]);
  });

  it('lets a unit target only what it sees, past units but not past obstacles that block sight', () => {
    const rock = { cells: ['7,5'], id: 'rock-2', obstacle: 'demo:rock' };
    const open = { ...READY, field: { ...READY.field, hazards: [], obstacles: [] } };
    const hidden = { ...open, field: { ...open.field, obstacles: [rock] } };
    const blocker = { ...unitOf(open, 'pikemen-1'), cell: '7,5', id: 'pikemen-2' };
    const crowded = { ...open, units: [...open.units, blocker] };
    const aimed = useAbility('demo:aim', [PIKEMEN]);

    expect(reason(execute(hidden, aimed, CONTENT)))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:aim', problem: 'sight', target: 0 }]);

    expect(unitOf(used(open, aimed, CONTENT).state, 'pikemen-1').health).toBe(9);
    expect(unitOf(used(crowded, aimed, CONTENT).state, 'pikemen-1').health).toBe(9);
  });

  it('checks sight for a cell of an area and for an ability without a range, and the range before sight', () => {
    const rock = { cells: ['7,5'], id: 'rock-2', obstacle: 'demo:rock' };
    const open = { ...READY, field: { ...READY.field, hazards: [], obstacles: [] } };
    const hidden = { ...open, field: { ...open.field, obstacles: [rock] } };
    const behind = useAbility('demo:flare', [{ cell: '10,5', kind: 'cell' }]);
    const before = useAbility('demo:flare', [{ cell: '5,5', kind: 'cell' }]);
    const glance = useAbility('demo:glance', [PIKEMEN]);
    const peek = useAbility('demo:peek', [PIKEMEN]);

    expect(reason(execute(hidden, behind, CONTENT)))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:flare', problem: 'sight', target: 0 }]);

    expect(execute(hidden, before, CONTENT).ok).toBe(true);
    expect(used(open, glance, CONTENT).state.variables.glanced).toBe(true);

    expect(reason(execute(hidden, glance, CONTENT)))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:glance', problem: 'sight', target: 0 }]);

    expect(reason(execute(hidden, peek, CONTENT)))
      .toStrictEqual(['kernel:invalid-targets', { ability: 'demo:peek', problem: 'range', target: 0 }]);
  });

  it('treats a range of a side, an area target without an area and a distance to a side as errors of content', () => {
    const defender = { kind: 'side', side: 'defender' } as const;
    const ranged = withAbility({ ...ability('demo:rally', { target: { kind: 'side', range: 3 } }) });
    const shapeless = withAbility(ability('demo:fireball', { target: { kind: 'area', range: 10 } }));
    const measured = withAbility(ability('demo:rally', { target: { filter: ADJACENT, kind: 'side' } }));
    const seeing = withAbility(ability('demo:rally', { target: { kind: 'side', sight: true } }));

    expect(() => execute(onGrid('5,5'), useAbility('demo:rally', [defender], { side: 'attacker' }), ranged))
      .toThrow('belongs to a side, which has no cells');

    expect(() => execute(onGrid('5,5'), useAbility('demo:fireball', [{ cell: '5,5', kind: 'cell' }]), shapeless))
      .toThrow(ContentError);

    expect(() => execute(onGrid('5,5'), useAbility('demo:rally', [defender], { side: 'attacker' }), seeing))
      .toThrow('belongs to a side, which has no cells');

    expect(() => execute(onGrid('5,5'), useAbility('demo:rally', [defender], { side: 'attacker' }), measured))
      .toThrow('neither a unit nor a cell');
  });
});

const ADJACENT = node('kernel:compare', {
  left: node('kernel:distance', { from: 'self', to: 'target' }),
  operator: '<=',
  right: 1,
});

const CONTENT: ContentRegistry = withAbility(
  ability('demo:snipe', {
    ops: [node('kernel:damage', { amount: 1, to: 'target' })],
    target: { kind: 'unit', range: 6 },
  }),
  ability('demo:fireball', {
    ops: [node('kernel:damage', { amount: 1, to: 'target' })],
    target: {
      area: { shape: 'radius', size: 1 },
      filter: node('kernel:not', { condition: node('kernel:same', { left: 'self', right: 'target' }) }),
      kind: 'area',
      range: 10,
    },
  }),
  ability('demo:touch', { target: { filter: ADJACENT, kind: 'unit' } }),
  ability('demo:aim', {
    ops: [node('kernel:damage', { amount: 1, to: 'target' })],
    target: { kind: 'unit', range: 20, sight: true },
  }),
  ability('demo:flare', {
    target: { area: { shape: 'radius', size: 0 }, kind: 'area', range: 20, sight: true },
  }),
  ability('demo:glance', { ops: [markOp('glanced')], target: { kind: 'unit', sight: true } }),
  ability('demo:peek', { ops: [markOp('peeked')], target: { kind: 'unit', range: 6, sight: true } }),
  ability('demo:census', {
    ops: [markOp('counted')],
    target: { area: { shape: 'radius', size: 1 }, kind: 'area', range: 10 },
  }),
  ability('demo:breath', {
    ops: [node('kernel:damage', { amount: 1, to: 'target' })],
    target: { area: { shape: 'line', size: 3 }, kind: 'area', range: 1 },
  }),
);

function withAbility(...added: readonly Ability[]): ContentRegistry {
  const archer = ABILITY_CONTENT.creatures['demo:archer'];

  if (archer === undefined) throw new Error('No archer');

  return {
    ...ABILITY_CONTENT,
    abilities: { ...ABILITY_CONTENT.abilities, ...Object.fromEntries(added.map((one) => [one.name, one])) },
    creatures: {
      ...ABILITY_CONTENT.creatures,
      'demo:archer': {
        ...archer,
        abilities: [
          ...archer.abilities,
          'demo:snipe',
          'demo:fireball',
          'demo:touch',
          'demo:breath',
          'demo:census',
          'demo:aim',
          'demo:flare',
          'demo:glance',
          'demo:peek',
        ],
      },
    },
  };
}

function withCreature(change: Partial<Creature>): ContentRegistry {
  const archer = CONTENT.creatures['demo:archer'];

  if (archer === undefined) throw new Error('No archer');

  return { ...CONTENT, creatures: { ...CONTENT.creatures, 'demo:archer': { ...archer, ...change } } };
}

function onGrid(pikemen: string): BattleState {
  return {
    ...READY,
    field: { ...READY.field, hazards: [], params: { height: 11, width: 15 }, topology: 'acme:grid' },
    units: READY.units.map((unit) => (unit.id === 'pikemen-1' ? { ...unit, cell: pikemen } : unit)),
  };
}
