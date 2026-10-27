import { describe, expect, it } from 'vitest';
import {
  CONTENT as DUEL,
  KERNEL as DUEL_KERNEL,
  BRACE,
  finish,
  kernelWith,
  move,
  ORDER,
  place,
  play,
  SCENARIO,
  SIDES,
  startWith,
  withScenario,
} from '../../battle/tests/helpers.ts';
import type { ContentRegistry } from '../../content/index.ts';
import type { ExtensionEventKind } from '../../extensions/index.ts';
import { hashJson, type JsonValue } from '../../json/index.ts';
import { createKernel } from '../../kernel/index.ts';
import type { BattleState, Unit } from '../../model/index.ts';
import type { DataView } from '../../names/index.ts';
import { withoutKey } from '../../shared/index.ts';
import { ARCHERS, KERNEL } from '../../tests/battle.ts';
import { applied, CONTENT, effect, FACING_GRID, GRID, STATE, unitOf } from '../../tests/fixtures.ts';
import { ATTACKER, BOTH, DEFENDER, FULL, NOBODY, packageEventKind, placeOf, replayed } from './helpers.ts';

describe('the projection of a state', () => {
  it('shows an actor with full visibility everything but the generator, with the mark of the visibility', () => {
    expect(KERNEL.project(STATE, CONTENT, FULL)).toStrictEqual({ ...withoutKey(STATE, 'rng'), visibility: FULL });
  });

  it('shows the sides only their units, no unseen unit as a source, no saved steps, triggers or data', () => {
    const projection = KERNEL.project(STATE, CONTENT, ATTACKER);

    expect(projection).toStrictEqual({
      ...withoutKey(STATE, 'rng'),
      extensions: {},
      field: { ...STATE.field, hazards: [] },
      steps: [],
      triggers: {},
      units: STATE.units.filter(({ id }) => id === 'archers-1').map((unit) => ({
        ...unit,
        effects: unit.effects.map((effect) => withoutKey(effect, 'sourceUnit')),
      })),
      visibility: ATTACKER,
    });

    expect(STATE.units.find(({ id }) => id === 'archers-1')?.effects.map(({ sourceUnit }) => sourceUnit))
      .toContain('pikemen-1');
  });

  it('shows a request the sides do not see as a hidden request of its side, and no unit they do not see in one', () => {
    const request = { count: 1, id: 7, kind: 'roll', name: 'core:morale', sides: 20, unit: 'pikemen-1' } as const;
    const seenRequest: BattleState = { ...STATE, inputRequest: request };

    expect(KERNEL.project(STATE, CONTENT, DEFENDER).inputRequest)
      .toStrictEqual({ id: 7, kind: 'hidden', side: 'attacker' });

    expect(KERNEL.project(STATE, CONTENT, NOBODY).inputRequest)
      .toStrictEqual({ id: 7, kind: 'hidden', side: 'attacker' });

    expect(KERNEL.project(STATE, CONTENT, ATTACKER).inputRequest).toStrictEqual(STATE.inputRequest);

    expect(KERNEL.project(seenRequest, CONTENT, ATTACKER).inputRequest)
      .toStrictEqual({ count: 1, id: 7, kind: 'roll', name: 'core:morale', sides: 20 });
  });

  it('leaves out the effects, the auras and the zones the sides do not see on what they see', () => {
    const state = shaded();
    const attacker = KERNEL.project(state, SHADED, ATTACKER);
    const defender = KERNEL.project(state, SHADED, DEFENDER);

    expect(archersOf(attacker)).toMatchObject({
      auras: ['acme:dread', 'core:poison'],
      effects: [applied(3, 'core:poison', { remaining: 2 }), MINE],
      zones: ['open'],
    });

    expect(archersOf(defender)).toMatchObject({
      auras: ['core:poison'],
      effects: [applied(3, 'core:poison', { remaining: 2, sourceUnit: 'pikemen-1' })],
      zones: ['open', 'swamp'],
    });

    expect(attacker.sides.map(({ effects }) => effects)).toStrictEqual([[MINE], []]);
    expect(defender.sides.map(({ effects }) => effects)).toStrictEqual([[], []]);
    expect(attacker.field.effects).toStrictEqual([]);
    expect(defender.field.effects).toStrictEqual([THEIRS]);
    expect(attacker.field.hazards).toStrictEqual([{ ...OPEN, effects: [] }]);

    expect(defender.field.hazards.map(({ effects, id }) => [id, effects])).toStrictEqual([
      ['swamp', STATE.field.hazards[0]?.effects],
      ['open', [THEIRS]],
    ]);
  });

  it('shows the side of the turn of a unit the sides do not see, and none of its turns', () => {
    const state: BattleState = {
      ...STATE,
      phase: { kind: 'turn', side: 'defender', unit: 'pikemen-1' },
      turns: [
        { holder: { kind: 'unit', unit: 'pikemen-1' }, skipped: false, waited: true },
        { holder: { kind: 'side', side: 'defender' }, skipped: false, waited: false },
        { holder: ARCHERS, skipped: true, waited: false },
      ],
    };
    const projection = KERNEL.project(state, CONTENT, ATTACKER);

    expect(projection.phase).toStrictEqual({ kind: 'turn', side: 'defender' });
    expect(projection.turns).toStrictEqual(state.turns.slice(1));
    expect(KERNEL.project(state, CONTENT, DEFENDER).phase).toStrictEqual(state.phase);
  });

  it('shows the data of an extension as the extension projects it for the sides, and none without a projection', () => {
    const state = { ...STATE, extensions: { ...STATE.extensions, 'acme:log': ['x'], 'acme:tally': TALLIED } };

    expect(DATA_KERNEL.project(state, CONTENT, ATTACKER).extensions)
      .toStrictEqual({ 'acme:tally': { sides: ['attacker'], units: ['archers-1'] } });

    expect(DATA_KERNEL.project(state, CONTENT, NOBODY).extensions)
      .toStrictEqual({ 'acme:tally': { sides: [], units: ['archers-1'] } });

    expect(DATA_KERNEL.project(state, CONTENT, BOTH).extensions)
      .toStrictEqual({ 'acme:tally': { sides: ['attacker', 'defender'], units: ['archers-1', 'pikemen-1'] } });

    expect(DATA_KERNEL.project(state, CONTENT, FULL).extensions).toStrictEqual(state.extensions);
  });

  it('puts the sides of the visibility in the order of the battle and refuses repeated and unknown sides', () => {
    const state = { ...STATE, extensions: { ...STATE.extensions, 'acme:tally': TALLIED } };
    const reversed = DATA_KERNEL.project(state, CONTENT, { kind: 'sides', sides: ['defender', 'attacker'] });

    expect(reversed.visibility).toStrictEqual(BOTH);
    expect(hashJson(reversed)).toBe(hashJson(DATA_KERNEL.project(state, CONTENT, BOTH)));

    expect(() => KERNEL.project(STATE, CONTENT, { kind: 'sides', sides: ['attacker', 'attacker'] }))
      .toThrow('The visibility names the side "attacker" twice.');

    expect(() => KERNEL.projectEvents(STATE, [], CONTENT, { kind: 'sides', sides: ['raiders'] }))
      .toThrow('The battle has no side "raiders" to see as.');
  });

  it('refuses a projection and the content of another battle', () => {
    const projection = KERNEL.project(STATE, CONTENT, ATTACKER);

    expect(() => KERNEL.project(projection, CONTENT, ATTACKER)).toThrow('The state is a projection already.');
    expect(() => KERNEL.projectEvents(projection, [], CONTENT, ATTACKER)).toThrow('The state is a projection already.');
    expect(() => KERNEL.project(STATE, { ...CONTENT, contentHash: 'b'.repeat(64) }, ATTACKER)).toThrow(TypeError);
  });
});

describe('the projection of deployment', () => {
  it('hides the cells of the units another side places until the battle starts, and shows fixed units', () => {
    const created = DUEL_KERNEL.createState({ scenario: 'demo:duel' }, DUEL);
    const placed = play(created, place('archers-1', '0,1', 'east'));
    const started = play(placed.state, finish());

    expect(placesOf(DUEL_KERNEL.project(placed.state, DUEL, DEFENDER))).toStrictEqual([
      ['archers-1', undefined, undefined],
      ['pikemen-1', '4,1', undefined],
    ]);

    expect(placesOf(DUEL_KERNEL.project(placed.state, DUEL, ATTACKER))).toStrictEqual([
      ['archers-1', '0,1', 'east'],
      ['pikemen-1', '4,1', undefined],
    ]);

    expect(DUEL_KERNEL.projectEvents(created, placed.events, DUEL, DEFENDER).map(({ type }) => type))
      .toStrictEqual(['kernel:hidden']);

    expect(placesOf(replayed(DUEL_KERNEL, DUEL, placed.state, started.events, DEFENDER)))
      .toStrictEqual([['archers-1', '0,1', 'east'], ['pikemen-1', '4,1', undefined]]);
  });

  it('tells the projection of data which cells of units the actor sees', () => {
    const kernel = kernelWith(BRACE, ORDER, SIDES, CELLS);
    const placed = play(kernel.createState({ scenario: 'demo:duel' }, DUEL), place('archers-1', '0,1'), DUEL, kernel);
    const marked = { ...placed.state, extensions: { 'acme:cells': { 'archers-1': '0,1', 'pikemen-1': '4,1' } } };

    expect(kernel.project(marked, DUEL, DEFENDER).extensions).toStrictEqual({ 'acme:cells': { 'pikemen-1': '4,1' } });

    expect(kernel.project(marked, DUEL, ATTACKER).extensions)
      .toStrictEqual({ 'acme:cells': { 'archers-1': '0,1', 'pikemen-1': '4,1' } });
  });

  it('gives an added unit no zones and auras by its cell until the battle starts', () => {
    const created = DUEL_KERNEL.createState({ added: { attacker: [SCOUT] }, scenario: 'demo:duel' }, DUEL);
    const placed = play(created, place('archers-1', '0,1'));
    const started = play(placed.state, finish());

    expect(unitOf(created, 'scouts-1')).toMatchObject({ cell: '2,2', zones: [] });
    expect(unitOf(DUEL_KERNEL.project(created, DUEL, DEFENDER), 'scouts-1')).toMatchObject({ auras: [], zones: [] });
    expect(placeOf(DUEL_KERNEL.project(created, DUEL, DEFENDER), 'scouts-1')).toStrictEqual([undefined, undefined]);
    expect(unitOf(started.state, 'scouts-1').zones).toStrictEqual(['embers']);
  });
});

describe('the zones of a unit in a projection', () => {
  it('shows a zone only to the sides that see both the unit and the zone, as the events of the zone', () => {
    const content = withScenario({
      field: { ...SCENARIO.field, hazards: [{ cells: ['1,1'], effects: [], id: 'fog', visibleTo: ['defender'] }] },
      sides: SCENARIO.sides.map((side) => ({
        ...side,
        units: side.units.map((unit) => (unit.id === 'archers-1' ? { ...unit, visibleTo: ['attacker'] } : unit)),
      })),
    });
    const started = startWith(DUEL_KERNEL, content);
    const moved = play(started, move('archers-1', '1,1'), content);

    expect(unitOf(moved.state, 'archers-1').zones).toStrictEqual(['fog']);
    expect(unitOf(DUEL_KERNEL.project(moved.state, content, BOTH), 'archers-1').zones).toStrictEqual([]);
    expect(unitOf(DUEL_KERNEL.project(moved.state, content, FULL), 'archers-1').zones).toStrictEqual(['fog']);

    for (const visibility of [BOTH, ATTACKER, DEFENDER]) {
      expect(replayed(DUEL_KERNEL, content, started, moved.events, visibility))
        .toStrictEqual(DUEL_KERNEL.project(moved.state, content, visibility));
    }
  });
});

const SCOUT = {
  cell: '2,2',
  count: 1,
  creature: 'demo:pikeman',
  effects: [],
  id: 'scouts-1',
  items: [],
  visibleTo: 'all',
} as const;

const TALLIED = { units: ['archers-1', 'pikemen-1'] };

const MINE = applied(9, 'acme:dread', { visibleTo: ['attacker'] });

const THEIRS = applied(10, 'core:poison', { visibleTo: ['defender'] });

const OPEN = { cells: ['1,5'], effects: [THEIRS], id: 'open', visibleTo: 'all' } as const;

const SHADED: ContentRegistry = {
  ...CONTENT,
  effects: { ...CONTENT.effects, 'acme:dread': effect('acme:dread', { visibility: 'owner' }) },
};

const TALLY: ExtensionEventKind<JsonValue> = dataEvent('acme:tally', (data, view) => {
  const units = (data as { readonly units: readonly string[] }).units.filter((unit) => view.seesUnit(unit));

  return units.length === 0 ? undefined : { sides: [...view.sides], units };
});

const LOG: ExtensionEventKind<JsonValue> = dataEvent('acme:log');

const CELLS: ExtensionEventKind<JsonValue> = dataEvent('acme:cells', (data, view) =>
  Object.fromEntries(Object.entries(data as Readonly<Record<string, string>>).filter(([unit]) => view.seesCell(unit))));

const DATA_KERNEL = createKernel({ extensions: [TALLY, LOG, GRID, FACING_GRID] });

function dataEvent(
  name: string,
  project?: (data: JsonValue, view: DataView) => JsonValue | undefined,
): ExtensionEventKind<JsonValue> {
  const apply: ExtensionEventKind<JsonValue>['apply'] = (state, payload) => ({
    ...state,
    extensions: { ...state.extensions, [name]: payload },
  });

  return packageEventKind(name, apply, {
    schema: { type: 'object' },
    version: 1,
    ...(project === undefined ? {} : { project }),
  });
}

function archersOf(projection: BattleState): Unit | undefined {
  return projection.units.find(({ id }) => id === 'archers-1');
}

function placesOf(state: BattleState): readonly unknown[] {
  return state.units.map(({ cell, facing, id }) => [id, cell, facing]);
}

function shaded(): BattleState {
  const archers = STATE.units.find(({ id }) => id === 'archers-1');

  if (archers === undefined) throw new Error('No archers');

  return {
    ...STATE,
    field: { ...STATE.field, effects: [THEIRS], hazards: [...STATE.field.hazards, OPEN] },
    sides: STATE.sides.map((side) => (side.id === 'attacker' ? { ...side, effects: [MINE] } : side)),
    units: STATE.units.map((unit) => (unit.id === 'archers-1'
      ? { ...unit, auras: ['acme:dread', 'core:poison'], effects: [...unit.effects, MINE], zones: ['open', 'swamp'] }
      : unit)),
  };
}
