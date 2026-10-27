import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { creatureDefinition, itemDefinition, type Ability, type ContentRegistry } from '../../content/index.ts';
import { canonicalJson } from '../../json/index.ts';
import type { BattleState, GameCommand, Target, Unit } from '../../model/index.ts';
import {
  act,
  acted,
  at,
  begin,
  defend,
  endTurn,
  finish,
  place,
  unitOf,
  useOfSide,
  type Drive,
} from '../../tests/scenarios/driver.ts';
import { arena, created, node, WORLD, WORLD_KERNEL } from '../../tests/scenarios/world.ts';

describe('the available actions', () => {
  it('list placing the units of the side that deploys now and the end of its deployment', () => {
    const state = created();
    const actions = WORLD_KERNEL.availableActions(state, WORLD);
    const placed = new Set(actions.flatMap((command) => (command.type === 'place-unit' ? [command.unit] : [])));

    const ready = acted(state, [place('knight-1', '1,2'), place('archers-1', '0,1'), place('mage-1', '0,3')]);

    expect(placed).toStrictEqual(new Set(['archers-1', 'knight-1', 'mage-1']));
    expect(actions.some(({ type }) => type === 'finish-deployment')).toBe(false);

    expect(WORLD_KERNEL.availableActions(ready, WORLD))
      .toContainEqual({ kind: 'game', side: 'attacker', type: 'finish-deployment' });

    expect(actions.every((command) => WORLD_KERNEL.execute(state, command, WORLD).ok)).toBe(true);
  });

  it('list what the holder of the turn can do, and every listed command runs', () => {
    const { drive, state } = begin(CROWD);
    const actions = WORLD_KERNEL.availableActions(state, drive.content);
    const holder = state.phase.kind === 'turn' ? state.phase.unit : undefined;

    expect(new Set(actions.map(({ type }) => type))).toStrictEqual(new Set([
      'defend',
      'end-turn',
      'move',
      'retreat',
      'surrender',
      'use-ability',
      'wait',
    ]));

    expect(actions.every((command) => !('unit' in command) || command.unit === holder)).toBe(true);
    expect(actions.filter((command) => !WORLD_KERNEL.execute(state, command, drive.content).ok)).toStrictEqual([]);
  });

  it('are none while an input request is open or after the battle', () => {
    const { drive, state } = begin(CROWD, { ruleset: { randomSources: { 'demo:damage': 'external' } } });
    const asked = askedFor(state, drive);
    const ended = act(state, { kind: 'game', side: 'attacker', type: 'surrender' }, drive).state;

    expect(asked.inputRequest).toBeDefined();
    expect(WORLD_KERNEL.availableActions(asked, drive.content)).toStrictEqual([]);
    expect(WORLD_KERNEL.availableActions(ended, drive.content)).toStrictEqual([]);
  });

  it('list placing only in the cells of the deployment zone of the side', () => {
    const state = created();
    const zone = new Set(WORLD.scenarios['demo:pass']?.sides.find(({ id }) => id === 'attacker')?.deploymentZone);
    const cells = WORLD_KERNEL.availableActions(state, WORLD)
      .flatMap((command) => (command.type === 'place-unit' ? [command.cell] : []));

    expect(cells.length).toBeGreaterThan(0);
    expect(cells.filter((cell) => !zone.has(cell))).toStrictEqual([]);
  });

  it('list the abilities of the side in a turn of its unit, with and without a target, while they can be used', () => {
    const { drive, state } = begin(CHEERS);
    const turn = attackerTurn(state, drive);
    const actions = WORLD_KERNEL.availableActions(turn, drive.content);
    const rally = { ability: 'demo:rally', kind: 'game', side: 'attacker', type: 'use-ability' } as const;
    const rallied = act(turn, { ...rally, targets: [{ kind: 'unit', unit: 'knight-1' }] }, drive).state;

    expect(actions).toContainEqual({ ...rally, targets: [{ kind: 'unit', unit: 'knight-1' }] });
    expect(actions).toContainEqual({ ...rally, ability: 'demo:cheer', targets: [] });
    expect(actions.filter((command) => 'side' in command && command.side === 'defender')).toStrictEqual([]);

    expect(WORLD_KERNEL.availableActions(rallied, drive.content)
      .filter((command) => command.type === 'use-ability' && command.ability === 'demo:rally')).toStrictEqual([]);
  });

  it('list the abilities and the end of the turn of a side in its turn, with the commands of each of its units', () => {
    const { drive, state } = begin(SIDE_TURNS);
    const actions = WORLD_KERNEL.availableActions(state, drive.content);
    const side = state.phase.kind === 'turn' ? state.phase.side : '';
    const units = new Set(actions.flatMap(unitsOf));

    expect(actions).toContainEqual({ kind: 'game', side, type: 'end-turn' });
    expect(units).toStrictEqual(new Set(state.units.filter((unit) => unit.side === side).map(({ id }) => id)));
    expect(actions.filter((command) => !WORLD_KERNEL.execute(state, command, drive.content).ok)).toStrictEqual([]);

    if (side === 'attacker') {
      expect(actions.some((command) => command.type === 'use-ability' && command.side === 'attacker')).toBe(true);
    }
  });

  it('let no other unit act in the turn of a unit the projection does not show, but the side use its abilities', () => {
    const { drive, state } = begin(HIDDEN_KNIGHT);
    const turn = holderTurn(state, drive, 'knight-1');
    const projection = WORLD_KERNEL.project(turn, drive.content, { kind: 'sides', sides: ['defender'] });
    const actions = WORLD_KERNEL.availableActions(projection, drive.content);
    const step = { kind: 'game', to: '2,1', type: 'move', unit: 'archers-1' } as const;
    const moved = WORLD_KERNEL.simulate(projection, step, drive.content, 'lowest');

    expect(projection.phase).toStrictEqual({ kind: 'turn', side: 'attacker' });
    expect(actions.flatMap(unitsOf)).toStrictEqual([]);
    expect(actions.filter((command) => command.type === 'end-turn')).toStrictEqual([]);
    expect(actions.some((command) => command.type === 'use-ability' && command.side === 'attacker')).toBe(true);
    expect(moved.ok ? 'accepted' : moved.rejection.reason).toBe('kernel:not-your-turn');
  });

  it('hold every command the kernel accepts without a direction and with at most one target, attacks aside', () => {
    fc.assert(fc.property(fc.array(fc.nat({ max: 1_000_000 }), { maxLength: 24, minLength: 8 }), (choices) => {
      const { drive } = begin(CHEERS);
      let state = begin(CHEERS).state;

      for (const [step, choice] of choices.entries()) {
        if (state.phase.kind === 'ended' || state.inputRequest !== undefined) break;

        const listed = WORLD_KERNEL.availableActions(state, drive.content);

        if (step % 6 === 0) {
          expect(missingFrom(state, drive.content, executes(state, drive.content))).toStrictEqual([]);
        }

        const command = listed[choice % listed.length];

        if (command === undefined) break;

        state = act(state, command, drive).state;
      }
    }), { numRuns: 6, seed: 1501 });
  });

  it('hold every command the kernel accepts in deployment, and only the start of the battle if nobody deploys', () => {
    const state = created();
    const defending = acted(state, [place('knight-1', '1,2'), place('archers-1', '0,1'), place('mage-1', '0,3')]);
    const waiting = acted(defending, [finish('attacker')]);

    for (const current of [state, defending, waiting]) {
      expect(missingFrom(current, WORLD, executes(current, WORLD))).toStrictEqual([]);
    }

    expect(WORLD_KERNEL.availableActions(created(CROWD), CROWD)).toStrictEqual([START]);
  });

  it('hold every command the kernel accepts in a turn of a side, on the full state and on its projection', () => {
    const { drive, state } = begin(SIDE_TURNS);
    const side = state.phase.kind === 'turn' ? state.phase.side : '';
    const projection = WORLD_KERNEL.project(state, drive.content, { kind: 'sides', sides: [side] });

    expect(missingFrom(state, drive.content, executes(state, drive.content))).toStrictEqual([]);
    expect(missingFrom(projection, drive.content, simulates(projection, drive.content))).toStrictEqual([]);
  });

  it('list a dead unit with a cell for an ability that takes dead targets, and every side for one taking sides', () => {
    const { drive, state } = begin(SPELLS);
    const smitten = act(attackerTurn(state, drive), useOfSide('attacker', 'acme:smite', at('golem-1')), drive).state;
    const actions = WORLD_KERNEL.availableActions(smitten, drive.content);
    const own = { kind: 'game', side: 'attacker', type: 'use-ability' } as const;

    expect(unitOf(smitten, 'golem-1')).toMatchObject({ cell: '6,2', count: 0 });
    expect(actions).toContainEqual({ ...own, ability: 'acme:raise', targets: [at('golem-1')] });
    expect(actions).not.toContainEqual({ ...own, ability: 'acme:smite', targets: [at('golem-1')] });
    expect(actions).toContainEqual({ ...own, ability: 'acme:inspire', targets: [{ kind: 'side', side: 'attacker' }] });
    expect(actions).toContainEqual({ ...own, ability: 'acme:inspire', targets: [{ kind: 'side', side: 'defender' }] });
    expect(missingFrom(smitten, drive.content, executes(smitten, drive.content))).toStrictEqual([]);
  });

  it('name as targets only the units the side of the holder sees', () => {
    const { drive, state } = begin(HIDDEN_KNIGHT);
    const turn = holderTurn(state, drive, 'griffins-1');
    const named = WORLD_KERNEL.availableActions(turn, drive.content)
      .filter((command) => canonicalJson(command).includes('knight-1'));

    expect(named).toStrictEqual([]);
  });
});

describe('the values of attributes', () => {
  it('give every attribute of the content for a unit, with its zone, its side and its defense', () => {
    const { drive, state } = begin(CROWD);
    const holder = state.phase.kind === 'turn' ? state.phase.unit ?? '' : '';
    const before = WORLD_KERNEL.attributes(state, drive.content, { kind: 'unit', unit: holder });
    const after = WORLD_KERNEL.attributes(act(state, defend(holder), drive).state, drive.content, {
      kind: 'unit',
      unit: holder,
    });

    expect(holder).toBe('griffins-1');

    expect(before).toStrictEqual({
      'core:action': 1,
      'core:health': 20,
      'core:move': 6,
      'core:speed': 5,
      'demo:armor': 1,
      'demo:mana': 0,
    });

    expect(after).toStrictEqual({ ...before, 'demo:armor': 5 });
  });

  it('give every attribute of the content for a side, with the modifiers of the effects of the side', () => {
    const { drive, state } = begin(CROWD);
    const bare = { 'core:action': 0, 'core:health': 1, 'core:move': 0, 'core:speed': 0, 'demo:mana': 0 };

    expect(WORLD_KERNEL.attributes(state, drive.content, { kind: 'side', side: 'defender' }))
      .toStrictEqual({ ...bare, 'demo:armor': 1 });

    expect(WORLD_KERNEL.attributes(state, drive.content, { kind: 'side', side: 'attacker' }))
      .toStrictEqual({ ...bare, 'demo:armor': 0 });
  });

  it('leave out an attribute whose formula rejects', () => {
    const { drive, state } = begin(OVERLOADED);
    const values = WORLD_KERNEL.attributes(state, drive.content, { kind: 'unit', unit: 'knight-1' });

    expect(Object.hasOwn(values, 'demo:mana')).toBe(false);
    expect(values['core:health']).toBe(30);
  });

  it('refuse a unit or a side that is not in the battle', () => {
    const { drive, state } = begin(CROWD);

    expect(() => WORLD_KERNEL.attributes(state, drive.content, { kind: 'unit', unit: 'nobody-1' })).toThrow(TypeError);
    expect(() => WORLD_KERNEL.attributes(state, drive.content, { kind: 'side', side: 'nobody' })).toThrow(TypeError);
  });
});

const GAMBLE: GameCommand = { kind: 'game', name: 'acme:gamble', payload: {}, type: 'extension' };

const START: GameCommand = { kind: 'game', type: 'start-battle' };

const CROWD: ContentRegistry = arena({ 'archers-1': '1,1', 'golem-1': '6,2', 'griffins-1': '5,3', 'knight-1': '1,2' });

const CHEERS: ContentRegistry = withCheer(CROWD, ['demo:rally', 'demo:cheer']);

const SIDE_TURNS: ContentRegistry = withRuleset(CHEERS, { turnOwner: 'side', variant: 'acme:sides' });

const HIDDEN_KNIGHT: ContentRegistry = withCheer(
  arena({ 'archers-1': '1,1', 'golem-1': '6,2', 'griffins-1': '5,3', 'knight-1': '1,2' }, {
    'knight-1': { visibleTo: ['attacker'] },
  }),
  ['demo:rally', 'demo:cheer'],
);

const SPELLS: ContentRegistry = withSideAbilities(CROWD, {
  'acme:inspire': { target: { kind: 'side' } },
  'acme:raise': { target: { dead: true, kind: 'unit' } },
  'acme:smite': { ops: [node('kernel:damage', { amount: 1000, to: 'target' })], target: { kind: 'unit' } },
});

const OVERLOADED: ContentRegistry = withOverload(CROWD);

function executes(state: BattleState, content: ContentRegistry): (command: GameCommand) => boolean {
  return (command) => WORLD_KERNEL.execute(state, command, content).ok;
}

function simulates(state: BattleState, content: ContentRegistry): (command: GameCommand) => boolean {
  return (command) => WORLD_KERNEL.simulate(state, command, content, 'lowest').ok;
}

function missingFrom(
  state: BattleState,
  content: ContentRegistry,
  accepts: (command: GameCommand) => boolean,
): readonly GameCommand[] {
  const known = new Set(WORLD_KERNEL.availableActions(state, content).map((one) => canonicalJson(one)));

  return superset(state, content).filter(accepts).filter((command) => !known.has(canonicalJson(command)));
}

function askedFor(state: BattleState, drive: Drive): BattleState {
  let current = state;

  for (let turn = 0; turn < 8 && current.inputRequest === undefined; turn += 1) {
    const holder = current.phase.kind === 'turn' ? current.phase.unit ?? '' : '';
    const gamble = WORLD_KERNEL.execute(current, GAMBLE, drive.content);

    current = gamble.ok ? gamble.state : act(current, endTurn(holder), drive).state;
  }

  return current;
}

function superset(state: BattleState, content: ContentRegistry): readonly GameCommand[] {
  const cells = WORLD_KERNEL.field(state, content).cells;

  if (state.phase.kind === 'deployment') return deploymentSuperset(state, state.phase.pending[0], cells);
  const targets: ReadonlyArray<readonly Target[]> = [
    [],
    ...state.units.map((unit): readonly Target[] => [{ kind: 'unit', unit: unit.id }]),
    ...state.sides.map(({ id }): readonly Target[] => [{ kind: 'side', side: id }]),
    ...cells.map((cell): readonly Target[] => [{ cell, kind: 'cell' }]),
  ];
  const abilities = Object.keys(content.abilities);
  const sides = state.phase.kind === 'turn' ? [state.phase.side] : [];
  const sideCommands = sides.flatMap((id): readonly GameCommand[] => [
    ...abilities.flatMap((ability) => targets
      .map((chosen): GameCommand => ({ ability, kind: 'game', side: id, targets: chosen, type: 'use-ability' }))),
    { kind: 'game', side: id, type: 'end-turn' },
    { kind: 'game', side: id, type: 'retreat' },
    { kind: 'game', side: id, type: 'surrender' },
  ]);

  const units = state.units.filter((unit) => sides.includes(unit.side));

  return [...units.flatMap((unit) => unitCommands(state, unit, cells, targets, content)), ...sideCommands];
}

function deploymentSuperset(
  state: BattleState,
  side: string | undefined,
  cells: readonly string[],
): readonly GameCommand[] {
  if (side === undefined) return [{ kind: 'game', type: 'start-battle' }];

  return [
    ...state.units.filter((unit) => unit.side === side)
      .flatMap(({ id }) => cells.map((cell): GameCommand => ({ cell, kind: 'game', type: 'place-unit', unit: id }))),
    { kind: 'game', side, type: 'finish-deployment' },
  ];
}

function unitCommands(
  state: BattleState,
  unit: Unit,
  cells: readonly string[],
  targets: ReadonlyArray<readonly Target[]>,
  content: ContentRegistry,
): readonly GameCommand[] {
  const own = { kind: 'game', unit: unit.id } as const;
  const { abilities } = creatureDefinition(content, unit.creature);
  const others = state.units.filter(({ id }) => id !== unit.id).map(({ id }) => id);

  return [
    ...cells.map((to): GameCommand => ({ ...own, to, type: 'move' })),
    ...others.flatMap((target): readonly GameCommand[] => [
      { ...own, target, type: 'attack' },
      { ...own, target, type: 'shoot' },
      ...cells.map((from): GameCommand => ({ ...own, from, target, type: 'attack' })),
    ]),
    ...abilities.flatMap((ability) => targets
      .map((chosen): GameCommand => ({ ...own, ability, targets: chosen, type: 'use-ability' }))),
    ...unit.inventory.flatMap(({ id, item }) => itemDefinition(content, item).abilities
      .flatMap((ability) => targets
        .map((chosen): GameCommand => ({ ...own, ability, item: id, targets: chosen, type: 'use-item' })))),
    { ...own, type: 'wait' },
    { ...own, type: 'defend' },
    { ...own, type: 'end-turn' },
  ];
}

function withCheer(content: ContentRegistry, abilities: readonly string[]): ContentRegistry {
  const rally = content.abilities['demo:rally'];
  const scenario = content.scenarios['demo:pass'];

  if (rally === undefined || scenario === undefined) throw new Error('No rally or scenario');

  const cheer = { ...rally, name: 'demo:cheer', ops: [], target: { kind: 'none' } } as const;
  const sides = scenario.sides.map((side) => (side.id === 'attacker' ? { ...side, abilities } : side));

  return {
    ...content,
    abilities: { ...content.abilities, 'demo:cheer': cheer },
    scenarios: { ...content.scenarios, 'demo:pass': { ...scenario, sides } },
  };
}

function withSideAbilities(
  content: ContentRegistry,
  abilities: Readonly<Record<string, Partial<Ability>>>,
): ContentRegistry {
  const rally = content.abilities['demo:rally'];
  const scenario = content.scenarios['demo:pass'];

  if (rally === undefined || scenario === undefined) throw new Error('No rally or scenario');

  const added = Object.entries(abilities)
    .map(([name, change]): readonly [string, Ability] => [name, { ...rally, limits: {}, name, ops: [], ...change }]);
  const names = added.map(([name]) => name);
  const sides = scenario.sides.map((side) => (side.id === 'attacker' ? { ...side, abilities: names } : side));

  return {
    ...content,
    abilities: { ...content.abilities, ...Object.fromEntries(added) },
    scenarios: { ...content.scenarios, 'demo:pass': { ...scenario, sides } },
  };
}

function withOverload(content: ContentRegistry): ContentRegistry {
  const haste = content.effects['demo:haste'];
  const scenario = content.scenarios['demo:pass'];

  if (haste === undefined || scenario === undefined) throw new Error('No haste or scenario');

  const value = node('kernel:multiply', { values: [Number.MAX_SAFE_INTEGER, 2] });
  const modifiers = [{ attribute: 'demo:mana', operation: 'add', value }] as const;
  const overload = { ...haste, modifiers, name: 'acme:overload' };
  const sides = scenario.sides.map((side) => ({
    ...side,
    units: side.units.map((one) => (one.id === 'knight-1' ? { ...one, effects: ['acme:overload'] } : one)),
  }));

  return {
    ...content,
    effects: { ...content.effects, 'acme:overload': overload },
    scenarios: { ...content.scenarios, 'demo:pass': { ...scenario, sides } },
  };
}

function withRuleset(
  content: ContentRegistry,
  change: { readonly turnOwner: 'side'; readonly variant: string },
): ContentRegistry {
  const ruleset = content.rulesets['demo:skirmish'];

  if (ruleset === undefined) throw new Error('No ruleset');

  const mechanics = { ...ruleset.mechanics, 'kernel:turn-order': { variant: change.variant } };

  const changed = { ...ruleset, mechanics, turnOwner: change.turnOwner };

  return { ...content, rulesets: { ...content.rulesets, 'demo:skirmish': changed } };
}

function attackerTurn(state: BattleState, drive: Drive): BattleState {
  let current = state;

  for (let turn = 0; turn < 8; turn += 1) {
    const { phase } = current;

    if (phase.kind === 'turn' && phase.side === 'attacker' && phase.unit !== undefined) return current;

    current = act(current, endTurn(phase.kind === 'turn' ? phase.unit ?? '' : ''), drive).state;
  }

  throw new Error('No turn of the attacker');
}

function holderTurn(state: BattleState, drive: Drive, unit: string): BattleState {
  let current = state;

  for (let turn = 0; turn < 8; turn += 1) {
    const { phase } = current;

    if (phase.kind === 'turn' && phase.unit === unit) return current;

    current = act(current, endTurn(phase.kind === 'turn' ? phase.unit ?? '' : ''), drive).state;
  }

  throw new Error(`No turn of ${unit}`);
}

function unitsOf(command: GameCommand): readonly string[] {
  const unit: unknown = 'unit' in command ? command.unit : undefined;

  return typeof unit === 'string' ? [unit] : [];
}
