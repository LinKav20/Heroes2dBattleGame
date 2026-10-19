import { describe, expect, it } from 'vitest';
import { ContentError, type ScenarioSide, type ScenarioUnit, type TurnRule } from '../../content/index.ts';
import { createKernel } from '../../kernel/index.ts';
import { DONE } from '../../operations/index.ts';
import { effect, node, unitOf } from '../../tests/fixtures.ts';
import { CONTENT, CREATED, EXTENSIONS, KERNEL, ORDER, RULESET, SCENARIO, withScenario } from './helpers.ts';

describe('creating a battle', () => {
  it('builds the state of the scenario: deployment, starting values, effects, stacks of items and the format', () => {
    const archers = unitOf(CREATED, 'archers-1');
    const pikemen = unitOf(CREATED, 'pikemen-1');

    expect(CREATED.phase).toStrictEqual({ kind: 'deployment', pending: ['attacker'] });
    expect(CREATED.round).toBe(0);
    expect(CREATED.turns).toStrictEqual([]);
    expect(CREATED.scenario).toBe('demo:duel');
    expect(CREATED.contentHash).toBe(CONTENT.contentHash);
    expect(CREATED.format.kernel).toBe(1);
    expect(CREATED.format.steps['kernel:turn-start']).toBe(1);
    expect(CREATED.format.steps['acme:mark']).toBe(1);
    expect(CREATED.rng).toBeUndefined();
    expect(CREATED.variables).toStrictEqual({ moved: false });

    expect(CREATED.field.hazards.flatMap(({ effects }) => effects.map(({ effect, id }) => [effect, id])))
      .toStrictEqual([['demo:burn', 5]]);

    expect(CREATED.sides.map(({ effects }) => effects.map(({ effect, id }) => [effect, id])))
      .toStrictEqual([[['demo:blessing', 4]], []]);

    expect(archers).toMatchObject({ count: 10, health: 10, resources: { 'demo:fury': 5, 'demo:mana': 5 } });
    expect(archers.cell).toBeUndefined();
    expect(pikemen).toMatchObject({ cell: '4,1', count: 20, health: 10 });

    expect(pikemen.effects.map(({ effect, id, remaining }) => [effect, id, remaining]))
      .toStrictEqual([['demo:poison', 6, 2]]);

    expect(archers.inventory).toStrictEqual([
      { count: 5, id: 1, item: 'demo:arrow' },
      { count: 2, id: 2, item: 'demo:arrow' },
      { charges: 1, count: 1, id: 3, item: 'demo:wand', slot: 'hands' },
    ]);

    expect(CREATED.nextId).toBe(7);
  });

  it('applies the changes of the consumer to units, the ruleset and the generator', () => {
    const changed = KERNEL.createState({
      ruleset: { randomSources: { 'core:damage-roll': 'external' } },
      scenario: 'demo:duel',
      seed: '1'.repeat(64),
      units: { 'archers-1': { count: 4, health: 3, resources: { 'demo:mana': 1 } } },
    }, CONTENT);

    expect(unitOf(changed, 'archers-1')).toMatchObject({ count: 4, health: 3, resources: { 'demo:mana': 1 } });
    expect(changed.ruleset.randomSources).toStrictEqual({ 'core:damage-roll': 'external' });
    expect(changed.rng).toStrictEqual({ counter: 0, seed: '1'.repeat(64) });
  });

  it('counts the starting values with the effects of the scenario, and the options win over them', () => {
    const strong = withScenario({ sides: withArchers({ effects: ['demo:vitality'] }) });
    const archers = unitOf(KERNEL.createState({ scenario: 'demo:duel' }, strong), 'archers-1');
    const changed = KERNEL.createState({
      scenario: 'demo:duel',
      units: { 'archers-1': { health: 12, resources: { 'demo:fury': 1 } } },
    }, strong);

    expect(archers).toMatchObject({ health: 15, resources: { 'demo:fury': 10, 'demo:mana': 10 } });
    expect(unitOf(changed, 'archers-1')).toMatchObject({ health: 12, resources: { 'demo:fury': 1, 'demo:mana': 10 } });
  });

  it('starts without deployment when every unit has a cell', () => {
    const sides = SCENARIO.sides.map((side) => ({
      ...side,
      units: side.units.map((unit) => ({ ...unit, cell: unit.cell ?? '0,1' })),
    }));

    expect(KERNEL.createState({ scenario: 'demo:duel' }, withScenario({ sides })).phase)
      .toStrictEqual({ kind: 'deployment', pending: [] });
  });

  it('rejects wrong options', () => {
    expect(() => create({ units: { 'ghosts-1': {} } })).toThrow('The scenario has no unit "ghosts-1" to change.');
    expect(() => create({ units: { 'archers-1': { count: 0 } } })).toThrow('needs a count from 1');
    expect(() => create({ units: { 'archers-1': { health: 11 } } })).toThrow('needs a health from 1 to 10');
    expect(() => create({ units: { 'pikemen-1': { resources: { 'demo:mana': 1 } } } })).toThrow('has no resource');
    expect(() => create({ seed: 'abc' })).toThrow('The seed needs 64 lowercase hexadecimal digits.');
    expect(() => create({ seed: 'A'.repeat(64) })).toThrow('The seed needs 64 lowercase hexadecimal digits.');

    expect(() => create({ units: { 'archers-1': { resources: { 'demo:mana': -1 } } } }))
      .toThrow('needs a value of 0+');

    expect(() => create({ ruleset: { randomSources: { 'core:morale': 'dice' } } }))
      .toThrow('The options give "core:morale" an unknown source.');

    expect(() => create({ ruleset: { mechanics: { 'kernel:turn-order': { variant: 'acme:missing' } } } }))
      .toThrow(TypeError);
  });

  it('treats a wrong scenario or ruleset as an error of content', () => {
    const summoned = SCENARIO.sides.map((side, index) => (index === 0
      ? { ...side, units: side.units.map((unit) => ({ ...unit, id: '#3' })) }
      : side));
    const crowded = SCENARIO.sides.map((side) => ({
      ...side,
      units: side.units.map((unit) => ({ ...unit, cell: '4,1' })),
    }));
    const twice = { id: 'turn', on: 'kernel:turn-end', ops: [], priority: 0 };

    expect(() => KERNEL.createState({ scenario: 'demo:none' }, CONTENT)).toThrow(ContentError);

    expect(() => KERNEL.createState({ scenario: 'demo:duel' }, withScenario({ sides: summoned })))
      .toThrow('named like a summoned unit');

    expect(() => KERNEL.createState({ scenario: 'demo:duel' }, withScenario({ sides: crowded })))
      .toThrow('does not fit where it stands');

    const repeated = withScenario({ triggers: [...SCENARIO.triggers, twice] });

    expect(() => KERNEL.createState({ scenario: 'demo:duel' }, repeated))
      .toThrow('The scenario has two of the trigger "turn".');

    expect(() => KERNEL.createState({ scenario: 'demo:duel' }, withScenario({}, { mechanics: {} })))
      .toThrow('chooses no order of turns');

    expect(() => KERNEL.createState({ scenario: 'demo:duel' }, withScenario({}, {
      mechanics: { ...RULESET.mechanics, 'kernel:defense': { variant: 'acme:in-order' } },
    }))).toThrow('but it belongs to "kernel:turn-order"');

    expect(() => KERNEL.createState({ scenario: 'demo:duel' }, withScenario({}, {
      mechanics: { 'kernel:turn-order': { variant: 'acme:missing' } },
    }))).toThrow('which no package declares');

    expect(() => KERNEL.createState({ scenario: 'demo:duel' }, withScenario({}, {
      mechanics: { 'kernel:turn-order': { variant: 'acme:sides-in-turn' } },
    }))).toThrow('"acme:sides-in-turn" gives turns to every side, but the ruleset "demo:duel" gives them to every');

    expect(() => KERNEL.createState(
      { scenario: 'demo:duel' },
      withScenario({ field: { ...SCENARIO.field, topology: 'acme:hex' } }),
    )).toThrow('No package declares the topology "acme:hex".');
  });

  it('checks the outcomes, triggers, zones and items of the scenario', () => {
    const [attacker, defender] = SCENARIO.sides;

    if (attacker === undefined || defender === undefined) throw new Error('No sides');

    const sideless = { condition: true, id: 'lost', outcome: 'victory', side: 'nobody' } as const;
    const placed = { id: 'placed', on: 'kernel:unit-placed', ops: [], priority: 0 };
    const unknown = { id: 'odd', on: 'acme:nothing', ops: [], priority: 0 };
    const shared = [attacker, { ...defender, deploymentZone: ['0,1'] }];
    const walled = [{ ...attacker, deploymentZone: ['2,0'] }, defender];

    expect(() => KERNEL.createState({ scenario: 'demo:duel' }, withScenario({ outcomes: [sideless] })))
      .toThrow('The outcome "lost" needs a side of the scenario');

    expect(() => KERNEL.createState({ scenario: 'demo:duel' }, withScenario({ triggers: [placed] })))
      .toThrow('The trigger "placed" waits for "kernel:unit-placed" in vain.');

    expect(() => KERNEL.createState({ scenario: 'demo:duel' }, withScenario({ triggers: [unknown] })))
      .toThrow('waits for "acme:nothing" in vain');

    expect(() => KERNEL.createState({ scenario: 'demo:duel' }, withScenario({ sides: shared })))
      .toThrow('The scenario has two of the cell of deployment "0,1".');

    expect(() => KERNEL.createState({ scenario: 'demo:duel' }, withScenario({ sides: walled })))
      .toThrow('The units of the side "attacker" do not all fit in its deployment zone.');

    expect(() => created(withArchers({ items: [{ charges: 4, count: 1, item: 'demo:wand' }] })))
      .toThrow('has charges it cannot have');

    expect(() => created(withArchers({ items: [{ charges: 1, count: 1, item: 'demo:arrow' }] })))
      .toThrow('has charges it cannot have');

    expect(() => created(withArchers({ items: [{ count: 1, item: 'demo:wand', slot: 'feet' }] })))
      .toThrow('takes another slot');
  });

  it('checks the rule of the turn of the ruleset', () => {
    const movement = RULESET.turn.movement ?? { actions: {}, points: 'core:speed' };

    expect(() => withTurn({ ...RULESET.turn, actions: ['core:nothing'] }))
      .toThrow('The rule of the turn names "core:nothing", not an attribute.');

    expect(() => withTurn({ ...RULESET.turn, actions: ['core:action', 'core:action'] }))
      .toThrow('The rule of the turn repeats a kind of action.');

    expect(() => withTurn({ ...RULESET.turn, movement: { ...movement, actions: { 'core:speed': 1 } } }))
      .toThrow('counts the cost of a path with an action it also spends on every move');

    expect(() => withTurn({ ...RULESET.turn, movement: { ...movement, actions: { 'core:action': 0.5 } } }))
      .toThrow('A move costs 0.5 of "core:action", not a whole number from 0.');
  });
});

describe('the starting values of a new battle', () => {
  it('keep what operations of the effects of the scenario did and move with the bounds their modifiers change', () => {
    const wound = effect('demo:wound', {
      duration: { kind: 'instant' },
      onApply: [
        node('kernel:damage', { amount: 15, to: 'self' }),
        node('kernel:change-resource', { amount: -2, resource: 'demo:mana', to: 'self' }),
      ],
    });
    const content = {
      ...withScenario({ sides: withArchers({ effects: ['demo:wound', 'demo:vitality'] }) }),
      effects: { ...CONTENT.effects, 'demo:wound': wound },
    };
    const archers = unitOf(KERNEL.createState({ scenario: 'demo:duel' }, content), 'archers-1');

    expect(archers).toMatchObject({ count: 9, health: 10, resources: { 'demo:fury': 10, 'demo:mana': 8 } });
  });

  it('take the version of the format from the kernel, with the data the extensions declare', () => {
    const data = {
      data: { schema: { type: 'object' }, version: 3 },
      kind: 'step',
      migrations: [],
      name: 'acme:store',
      run: () => DONE,
      version: 1,
    } as const;
    const kernel = createKernel({ extensions: [...EXTENSIONS, ORDER, data] });
    const state = kernel.createState({ scenario: 'demo:duel' }, CONTENT);

    expect(CREATED.format).toStrictEqual(KERNEL.stateFormat);
    expect(state.format.extensions).toStrictEqual({ 'acme:store': 3 });
    expect(state.format.steps['acme:store']).toBe(1);
  });
});

describe('the checks of a new battle', () => {
  it('refuse units that do not fit in their zone together, a turn that never ends and self-firing triggers', () => {
    const narrow = SCENARIO.sides.map((side) => (side.id === 'attacker'
      ? {
          ...side,
          deploymentZone: ['0,0', '0,1'],
          units: [0, 1, 2].map((index) => ({ ...side.units[0], id: `archers-${String(index + 1)}`, items: [] })),
        }
      : side));
    const set = node('kernel:set-variable', { value: true, variable: 'x' });
    const loop = { id: 'loop', on: 'kernel:variable-set', ops: [set], priority: 0 };
    const echo = { id: 'echo', on: 'kernel:trigger-fired', ops: [], priority: 0 };

    expect(() => created(narrow as readonly ScenarioSide[])).toThrow('The units of the side "attacker" do not all fit');
    expect(() => withTurn({ actions: [], endTurn: false })).toThrow('so a turn never ends');

    expect(() => KERNEL.createState({ scenario: 'demo:duel' }, withScenario({ triggers: [loop] })))
      .toThrow('The trigger "loop" fires itself again without end; give it a limit.');

    expect(() => KERNEL.createState({ scenario: 'demo:duel' }, withScenario({ triggers: [echo] })))
      .toThrow('The trigger "echo" fires itself again without end');

    const limited = withScenario({ triggers: [{ ...loop, limit: 3 }] });

    expect(KERNEL.createState({ scenario: 'demo:duel' }, limited).round).toBe(0);
  });

  it('blame the options, not the ruleset, for an order of turns that gives turns to others', () => {
    const options = { ruleset: { mechanics: { 'kernel:turn-order': { variant: 'acme:sides-in-turn' } } } };

    expect(() => create(options)).toThrow(TypeError);
    expect(() => create(options)).not.toThrow(ContentError);
    expect(() => create(options)).toThrow('The options: "acme:sides-in-turn" gives turns to every side');
  });
});

function create(options: object): unknown {
  return KERNEL.createState({ scenario: 'demo:duel', ...options }, CONTENT);
}

function withArchers(change: Partial<ScenarioUnit>): readonly ScenarioSide[] {
  return SCENARIO.sides.map((side, index) => (index === 0
    ? { ...side, units: side.units.map((unit) => ({ ...unit, ...change })) }
    : side));
}

function created(sides: readonly ScenarioSide[]): unknown {
  return KERNEL.createState({ scenario: 'demo:duel' }, withScenario({ sides }));
}

function withTurn(turn: TurnRule): unknown {
  return KERNEL.createState({ scenario: 'demo:duel' }, withScenario({}, { turn }));
}
