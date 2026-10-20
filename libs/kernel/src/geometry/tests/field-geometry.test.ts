import { describe, expect, it } from 'vitest';
import { ContentError, type ContentRegistry, type Creature } from '../../content/index.ts';
import type { FieldGeometry, TopologyExtension } from '../../extensions/index.ts';
import { createKernel } from '../../kernel/index.ts';
import type { BattleState, Unit } from '../../model/index.ts';
import { BARE_STATE } from '../../tests/battle.ts';
import { CONTENT, counting, GRID, gridCell, gridCells, gridPoint, type GridParams } from '../../tests/fixtures.ts';
import { createFieldGeometry, FieldCache } from '../index.ts';

interface Setup {
  readonly archers?: Partial<Unit>;
  readonly pikemen?: Partial<Unit>;
  readonly unplaced?: boolean;
  readonly archer?: Partial<Creature>;
  readonly pikeman?: Partial<Creature>;
  readonly hills?: readonly string[];
}

describe('the field of a state', () => {
  it('asks the topology about cells, neighbors, distances and areas', () => {
    const field = geometry();

    expect(field.cells).toHaveLength(15);
    expect(field.hasCell('4,2')).toBe(true);
    expect(field.hasCell('5,0')).toBe(false);
    expect(field.neighbors('0,0')).toStrictEqual(['1,0', '0,1']);
    expect(field.distance('0,0', '4,2')).toBe(6);
    expect(field.distanceBetween(['0,0'], ['2,2', '3,2'])).toBe(4);
    expect(field.distanceBetween([], ['2,2'])).toBeUndefined();
    expect(field.nearestCell(['1,0', '0,1'], '1,1')).toBe('1,0');
    expect(field.nearestCell(['0,1', '1,0'], '1,1')).toBe('0,1');
    expect(field.nearestCell([], '1,1')).toBeUndefined();
    expect(field.area({ shape: 'radius', size: 1 }, '1,1')).toStrictEqual(['1,0', '0,1', '1,1', '2,1', '1,2']);
  });

  it('gives the cells of a unit by the size of its creature, and none to a unit that is not placed', () => {
    const big = geometry({ pikeman: { size: 2 } });
    const unplaced = geometry({ unplaced: true });

    expect(big.cellsOf('pikemen-1')).toStrictEqual(['2,2', '3,2']);
    expect(big.cellsAt('pikemen-1', '4,0')).toBeUndefined();
    expect(big.cellsAt('archers-1', '4,0')).toStrictEqual(['4,0']);
    expect(big.canStand('archers-1', '4,0')).toBe(true);
    expect(big.canStand('archers-1', '2,0')).toBe(false);
    expect(big.canStand('archers-1', '3,2')).toBe(false);
    expect(big.canStand('pikemen-1', '0,0')).toBe(false);
    expect(big.canStand('pikemen-1', '3,1')).toBe(true);
    expect(big.canStand('pikemen-1', '9,9')).toBe(false);
    expect(unplaced.cellsOf('archers-1')).toStrictEqual([]);
    expect(unplaced.reachable('archers-1', 5)).toStrictEqual([]);
    expect(unplaced.path('archers-1', '1,0')).toBeUndefined();
    expect(() => big.cellsOf('ghosts-1')).toThrow('The battle has no unit "ghosts-1".');
  });

  it('finds the cells a walking unit reaches around obstacles and other units, nearest first', () => {
    expect(geometry().reachable('archers-1', 2)).toStrictEqual([
      { cell: '1,0', cost: 1 },
      { cell: '0,1', cost: 1 },
      { cell: '1,1', cost: 2 },
      { cell: '0,2', cost: 2 },
    ]);

    expect(geometry({ hills: ['1,0'] }).reachable('archers-1', 2).map(({ cell }) => cell))
      .toStrictEqual(['0,1', '1,1', '0,2']);
  });

  it('finds the cheapest path through the earlier neighbors, and none to a taken cell', () => {
    const field = geometry();
    const path = field.path('archers-1', '4,0');

    expect(path).toStrictEqual({ cells: ['1,0', '1,1', '2,1', '3,1', '4,1', '4,0'], cost: 6 });
    expect(field.path('archers-1', '0,0')).toStrictEqual({ cells: [], cost: 0 });
    expect(field.path('archers-1', '2,2')).toBeUndefined();
    expect(field.path('archers-1', '2,0')).toBeUndefined();
    expect(geometry({ pikemen: { count: 0 } }).path('archers-1', '2,2')?.cost).toBe(4);
  });

  it('takes a longer path when it is cheaper, at the cost the search of reachable cells gives', () => {
    const hilly = geometry({ hills: ['1,1', '2,1'], pikemen: { count: 0 } });
    const reached = hilly.reachable('archers-1', 20).find(({ cell }) => cell === '3,1');

    expect(hilly.path('archers-1', '3,1'))
      .toStrictEqual({ cells: ['0,1', '0,2', '1,2', '2,2', '3,2', '3,1'], cost: 6 });

    expect(reached?.cost).toBe(6);
  });

  it('lets a flying unit pass over obstacles but not stop on them, and a teleporting one jump straight', () => {
    const flying = geometry({ archer: { movement: 'fly' } });
    const teleporting = geometry({ archer: { movement: 'teleport' } });

    expect(flying.path('archers-1', '4,0')).toStrictEqual({ cells: ['1,0', '2,0', '3,0', '4,0'], cost: 4 });
    expect(flying.reachable('archers-1', 2).map(({ cell }) => cell)).not.toContain('2,0');
    expect(teleporting.path('archers-1', '4,2')).toStrictEqual({ cells: ['4,2'], cost: 6 });
    expect(teleporting.reachable('archers-1', 1)).toStrictEqual([{ cell: '1,0', cost: 1 }, { cell: '0,1', cost: 1 }]);
  });

  it('keeps a big unit where all its cells are free', () => {
    const big = geometry({ archer: { size: 2 }, archers: { cell: '0,1' }, pikeman: { size: 2 } });

    expect(big.path('archers-1', '3,1')?.cost).toBe(3);
    expect(big.path('archers-1', '1,2')).toBeUndefined();
    expect(big.reachable('archers-1', 1).map(({ cell }) => cell)).toStrictEqual(['1,1', '0,2', '0,0']);
  });

  it('fails when it is used without its topology or with a topology that breaks the contract', () => {
    const flat: TopologyExtension<GridParams> = { ...GRID, moveCost: () => 0, name: 'acme:flat' };
    const unknown = createFieldGeometry(BARE_STATE, CONTENT, TOPOLOGIES);
    const broken = createFieldGeometry(
      stateOn('acme:flat', {}),
      contentWith({}),
      createKernel({ extensions: [flat] }).registries.topologies,
    );

    expect(() => unknown.cells).toThrow('No package declares the topology "acme:facing-grid".');
    expect(() => broken.reachable('archers-1', 3)).toThrow('gives a cost of a step below 1');
  });

  it('checks the distances and footprints of the topology and the budget of movement', () => {
    const fractional: TopologyExtension<GridParams> = { ...GRID, distance: () => 1.5, name: 'acme:fractional' };
    const backwards: TopologyExtension<GridParams> = {
      ...GRID,
      footprint: (params, cell, body) => GRID.footprint(params, cell, body)?.toReversed(),
      name: 'acme:backwards',
    };
    const registry = createKernel({ extensions: [fractional, backwards] }).registries.topologies;
    const big = contentWith({ archer: { size: 2 } });

    expect(() => createFieldGeometry(stateOn('acme:fractional', {}), contentWith({}), registry).distance('0,0', '1,0'))
      .toThrow('gives a distance that is not whole');

    expect(() => createFieldGeometry(stateOn('acme:backwards', {}), big, registry).cellsOf('archers-1'))
      .toThrow('without the cell first');

    expect(() => geometry().reachable('archers-1', Number.NaN)).toThrow('needs a whole number');
  });

  it('of cells of the same estimated cost takes first the one nearer to the goal, then the one reached first', () => {
    const open = geometry({ pikemen: { count: 0 } });

    expect(open.path('archers-1', '2,2')).toStrictEqual({ cells: ['1,0', '1,1', '2,1', '2,2'], cost: 4 });
    expect(open.path('archers-1', '0,2')).toStrictEqual({ cells: ['0,1', '0,2'], cost: 2 });
    expect(open.path('archers-1', '3,1', { budget: 3 })).toBeUndefined();
    expect(open.path('archers-1', '3,1', { budget: 4 })?.cost).toBe(4);
  });

  it('finds a path that ends in a new direction where the unit fits only that way', () => {
    const field = facingField();

    expect(field.cellsOf('archers-1')).toStrictEqual(['0,1', '1,1']);
    expect(field.path('archers-1', '4,1')).toBeUndefined();

    expect(field.path('archers-1', '4,1', { facing: 'west' }))
      .toStrictEqual({ cells: ['1,1', '2,1', '3,1', '4,1'], cost: 4 });

    expect(field.cellsAt('archers-1', '4,1', 'west')).toStrictEqual(['4,1', '3,1']);
    expect(field.cellsAlong('archers-1', ['1,1', '2,1', '3,1'], 'west')).toStrictEqual(['1,1', '2,1', '3,1']);
    expect(field.cellsAlong('archers-1', ['1,1', '2,1', '3,1'])).toContain('4,1');
    expect(field.canStand('archers-1', '4,1')).toBe(false);
    expect(field.canStand('archers-1', '4,1', 'west')).toBe(true);
  });

  it('lists the directions of the topology, or none when it has no directions', () => {
    expect(facingField().directions).toStrictEqual(['east', 'west']);
    expect(geometry().directions).toStrictEqual([]);
  });

  it('gives the cells a unit touches on its way, only where it stops for a flying one', () => {
    const big = geometry({ archer: { size: 2 }, archers: { cell: '0,1' } });
    const flying = geometry({ archer: { movement: 'fly', size: 2 }, archers: { cell: '0,1' } });

    expect(big.cellsAlong('archers-1', ['0,2', '1,2'])).toStrictEqual(['0,2', '1,2', '2,2']);
    expect(flying.cellsAlong('archers-1', ['0,2', '1,2'])).toStrictEqual(['1,2', '2,2']);
    expect(big.cellsAlong('archers-1', [])).toStrictEqual([]);
  });

  it('does not ask the topology about the cells of a big creature in a cell off the field', () => {
    const strict: TopologyExtension<GridParams> = {
      ...GRID,
      footprint: (params, cell, body) => {
        if (!gridCells(params).includes(cell)) throw new Error('Asked about a cell off the field.');

        return GRID.footprint(params, cell, body);
      },
      name: 'acme:strict',
    };
    const registry = createKernel({ extensions: [strict] }).registries.topologies;
    const field = createFieldGeometry(stateOn('acme:strict', {}), contentWith({ pikeman: { size: 2 } }), registry);

    expect(field.cellsAt('pikemen-1', '9,9')).toBeUndefined();
    expect(field.cellsAlong('pikemen-1', ['9,9'])).toStrictEqual([]);
  });

  it('asks the topology for the cells of a field once for the same parameters and the same topology', () => {
    let asked = 0;
    const counted: TopologyExtension<GridParams> = {
      ...GRID,
      cells: (params) => {
        asked += 1;

        return GRID.cells(params);
      },
      name: 'acme:counted',
    };
    const other: TopologyExtension<GridParams> = { ...counted, name: 'acme:other' };
    const registry = createKernel({ extensions: [counted, other] }).registries.topologies;
    const cache = new FieldCache();
    const state = stateOn('acme:counted', {});
    const moved = { ...state, units: state.units.map((unit) => ({ ...unit, cell: '4,2' })) };
    const elsewhere = { ...state, field: { ...state.field, topology: 'acme:other' } };

    expect(createFieldGeometry(state, CONTENT, registry, cache).cells).toHaveLength(15);
    expect(createFieldGeometry(moved, CONTENT, registry, cache).hasCell('4,2')).toBe(true);
    expect(asked).toBe(1);
    expect(createFieldGeometry(elsewhere, CONTENT, registry, cache).cells).toHaveLength(15);
    expect(asked).toBe(2);
  });

  it('keeps the neighbors of a cell for a body apart from those of a cell without one, whatever the names', () => {
    const tricky = 'a\u00001\u0000walk\u0000';
    const params = { height: 1, width: 1 };
    const odd: TopologyExtension<GridParams> = {
      ...GRID,
      cells: () => ['a', tricky, 'b'],
      name: 'acme:odd',
      neighbors: (unused, cell, body) => (body === undefined ? [cell === 'a' ? 'b' : 'a'] : [tricky]),
    };
    const body = { movement: 'walk', size: 1 } as const;
    const first = new FieldCache();
    const second = new FieldCache();

    expect(first.neighborsOf(odd, params, tricky)).toStrictEqual(['a']);
    expect(first.neighborsOf(odd, params, 'a', body)).toStrictEqual([tricky]);
    expect(second.neighborsOf(odd, params, 'a', body)).toStrictEqual([tricky]);
    expect(second.neighborsOf(odd, params, tricky)).toStrictEqual(['a']);
    expect(second.neighborsOf(odd, params, 'a', { ...body, facing: 'east' })).toStrictEqual([tricky]);
    expect(second.neighborsOf(odd, params, 'a')).toStrictEqual(['b']);
  });

  it('treats a creature with a size below 1 or an unknown movement as an error of content', () => {
    expect(() => geometry({ archer: { size: 0 } }).cellsOf('archers-1')).toThrow(ContentError);

    expect(() => geometry({ archer: { movement: 'swim' as 'walk' } }).path('archers-1', '1,0'))
      .toThrow('walk, fly or teleport');
  });
});

const FACING: TopologyExtension<GridParams> = {
  ...GRID,
  directions: () => ['east', 'west'],
  footprint: (params, cell, { facing, size }) => {
    const [x, y] = gridPoint(cell);
    const step = facing === 'west' ? -1 : 1;
    const cells = counting(size).map((index) => gridCell(x + step * index, y));

    return cells.every((taken) => gridCells(params).includes(taken)) ? cells : undefined;
  },
  name: 'acme:facing',
};

const TOPOLOGIES = createKernel({ extensions: [GRID, FACING] }).registries.topologies;

function geometry(setup: Setup = {}): FieldGeometry {
  return createFieldGeometry(stateOn('acme:grid', setup), contentWith(setup), TOPOLOGIES);
}

function stateOn(topology: string, setup: Setup): BattleState {
  const hills = setup.hills === undefined ? {} : { hills: setup.hills };

  return {
    ...BARE_STATE,
    field: {
      ...BARE_STATE.field,
      hazards: [],
      obstacles: [{ cells: ['2,0'], id: 'rock-1', obstacle: 'demo:rock' }],
      params: { height: 3, width: 5, ...hills },
      topology,
    },
    units: BARE_STATE.units.map((unit) => {
      if (unit.id !== 'archers-1') return { ...unit, cell: '2,2', ...setup.pikemen };

      const { cell, ...unplaced } = { ...unit, cell: '0,0', ...setup.archers };

      return setup.unplaced === true ? unplaced : { ...unplaced, cell };
    }),
  };
}

function contentWith(setup: Setup): ContentRegistry {
  const archer = CONTENT.creatures['demo:archer'];
  const pikeman = CONTENT.creatures['demo:pikeman'];

  if (archer === undefined || pikeman === undefined) throw new Error('No creatures');

  return {
    ...CONTENT,
    creatures: {
      'demo:archer': { ...archer, ...setup.archer },
      'demo:pikeman': { ...pikeman, ...setup.pikeman },
    },
  };
}

function facingField(): FieldGeometry {
  const setup: Setup = { archer: { size: 2 }, archers: { cell: '0,1', facing: 'east' }, pikemen: { count: 0 } };

  return createFieldGeometry(stateOn('acme:facing', setup), contentWith(setup), TOPOLOGIES);
}
