import { describe, expect, it } from 'vitest';
import type { ExtensionEventKind } from '../../extensions/index.ts';
import type { Visibility } from '../../ids/index.ts';
import type { JsonValue } from '../../json/index.ts';
import { createKernel, type Kernel } from '../../kernel/index.ts';
import type { BattleEvent, BattleState, Unit } from '../../model/index.ts';
import { CONTENT, FACING_GRID, GRID, SPEED_ORDER, STATE } from '../../tests/fixtures.ts';
import {
  ATTACKER,
  dataChanged,
  DEFENDER,
  event,
  FULL,
  hiddenEvent,
  NOBODY,
  packageEventKind,
  replayed,
  summoned,
} from './helpers.ts';

describe('events of packages in a projection', () => {
  it('passes a package event that gives the data the sides see, and turns others into that data or hidden', () => {
    const events: readonly BattleEvent[] = [
      event(0, 'acme:tally', TALLIED),
      event(1, 'acme:tally', { units: ['archers-1'] }),
      event(2, 'acme:log', ['x']),
      event(3, 'acme:tally', { units: ['pikemen-1'] }),
    ];

    expect(DATA_KERNEL.projectEvents(STATE, events, CONTENT, ATTACKER)).toStrictEqual([
      dataChanged(0, { 'acme:tally': { units: ['archers-1'] } }, []),
      events[1],
      hiddenEvent(2, {}),
      dataChanged(3, {}, ['acme:tally']),
    ]);

    expect(replayed(DATA_KERNEL, CONTENT, STATE, events, ATTACKER))
      .toStrictEqual(DATA_KERNEL.project(events.reduce(DATA_KERNEL.applyEvent, STATE), CONTENT, ATTACKER));
  });

  it('gives an actor with full visibility every event of a package, those no side sees included', () => {
    const note = event(0, 'acme:note', {}, []);

    expect(DATA_KERNEL.projectEvents(STATE, [note], CONTENT, FULL)).toStrictEqual([note]);
  });

  it('passes an event of a package without data that the sides see, and hides one they do not see', () => {
    const seen = event(0, 'acme:note', {});
    const unseen = event(1, 'acme:note', {}, ['defender']);

    expect(DATA_KERNEL.projectEvents(STATE, [seen, unseen], CONTENT, ATTACKER))
      .toStrictEqual([seen, hiddenEvent(1, {})]);

    expect(DATA_KERNEL.projectEvents(STATE, [seen], CONTENT, NOBODY)).toStrictEqual([seen]);
  });

  it('hides an initialization that changes nothing in the full state but would add data the sides do not see', () => {
    const before = { ...STATE, extensions: { ...STATE.extensions, 'acme:init': { initialized: true } } };
    const ensure = event(0, 'acme:init', {});

    expect(DATA_KERNEL.projectEvents(before, [ensure], CONTENT, ATTACKER)).toStrictEqual([hiddenEvent(0, {})]);

    expect(prefixes(DATA_KERNEL, before, [ensure], ATTACKER).map(({ extensions }) => extensions))
      .toStrictEqual([{}, {}]);

    expect(DATA_KERNEL.projectEvents(before, [ensure], CONTENT, FULL)).toStrictEqual([ensure]);
  });

  it('passes an event that gives the projected data, and hides one that would add a unit the sides do not see', () => {
    const empty = { ...STATE, extensions: { 'acme:ledger': { units: [] } } };
    const seen = event(0, 'acme:ledger-add', { unit: 'archers-1' });
    const unseen = event(1, 'acme:ledger-add', { unit: 'pikemen-1' });
    const projected = DATA_KERNEL.projectEvents(empty, [seen, unseen], CONTENT, ATTACKER);
    const after = [seen, unseen].reduce(DATA_KERNEL.applyEvent, empty);

    expect(projected).toStrictEqual([seen, hiddenEvent(1, {})]);
    expect(JSON.stringify(projected).includes('pikemen-1')).toBe(false);

    expect(prefixes(DATA_KERNEL, empty, [seen, unseen], ATTACKER).map(({ extensions }) => extensions))
      .toStrictEqual([{ 'acme:ledger': { units: [] } }, { 'acme:ledger': { units: ['archers-1'] } }, {
        'acme:ledger': { units: ['archers-1'] },
      }]);

    expect(replayed(DATA_KERNEL, CONTENT, empty, [seen, unseen], ATTACKER))
      .toStrictEqual(DATA_KERNEL.project(after, CONTENT, ATTACKER));
  });

  it('lists the changed data in the order of the names of extensions', () => {
    const [shown] = DATA_KERNEL.projectEvents(STATE, [event(0, 'acme:both', {}, [])], CONTENT, ATTACKER);

    expect(Object.keys((shown?.payload as { readonly changed: object }).changed)).toStrictEqual(['acme:a', 'acme:z']);
  });
});

describe('an event of a package the sides do not see', () => {
  it('comes as the change of the data it makes, if the sides see that data', () => {
    const before = { ...STATE, extensions: { 'acme:count': { count: 0 } } };
    const counted = event(0, 'acme:count-add', {}, ['defender']);
    const after = COUNT_KERNEL.applyEvent(before, counted);

    expect(COUNT_KERNEL.projectEvents(before, [counted], CONTENT, ATTACKER))
      .toStrictEqual([dataChanged(0, { 'acme:count': { count: 1 } }, [])]);

    expect(replayed(COUNT_KERNEL, CONTENT, before, [counted], ATTACKER))
      .toStrictEqual(COUNT_KERNEL.project(after, CONTENT, ATTACKER));

    expect(COUNT_KERNEL.projectEvents(before, [counted], CONTENT, DEFENDER)).toStrictEqual([counted]);
    expect(COUNT_KERNEL.projectEvents(before, [counted], CONTENT, FULL)).toStrictEqual([counted]);
  });

  it('comes hidden, if the data the sides see does not change', () => {
    const before = { ...STATE, extensions: { 'acme:count': { count: 0 } } };
    const noted = event(0, 'acme:count-note', {}, ['defender']);

    expect(COUNT_KERNEL.projectEvents(before, [noted], CONTENT, ATTACKER)).toStrictEqual([hiddenEvent(0, {})]);
  });
});

describe('data that a change of the units seen changes', () => {
  it('ends the batch with the data the sides see when a summoned unit becomes one they see', () => {
    const before = {
      ...STATE,
      extensions: { 'acme:ledger': { units: ['#8'] }, 'acme:waiting': { for: '#8' } },
    };
    const summon = event(0, 'kernel:unit-summoned', { unit: FUTURE }, ['attacker']);
    const after = DATA_KERNEL.applyEvent(before, summon);
    const projected = DATA_KERNEL.projectEvents(before, [summon], CONTENT, ATTACKER);

    expect(DATA_KERNEL.project(before, CONTENT, ATTACKER).extensions)
      .toStrictEqual({ 'acme:ledger': { units: [] }, 'acme:waiting': { for: 'someone' } });

    expect(projected).toStrictEqual([summon, dataChanged(1, { 'acme:ledger': { units: ['#8'] } }, ['acme:waiting'])]);

    expect(replayed(DATA_KERNEL, CONTENT, before, [summon], ATTACKER))
      .toStrictEqual(DATA_KERNEL.project(after, CONTENT, ATTACKER));
  });

  it('adds nothing for the sides that still do not see the unit and for full visibility', () => {
    const before = { ...STATE, extensions: { 'acme:ledger': { units: ['#8'] } } };
    const summon = event(0, 'kernel:unit-summoned', { unit: FUTURE }, ['attacker']);

    expect(DATA_KERNEL.projectEvents(before, [summon], CONTENT, DEFENDER))
      .toStrictEqual([hiddenEvent(0, { nextId: 9 })]);

    expect(DATA_KERNEL.projectEvents(before, [summon], CONTENT, FULL)).toStrictEqual([summon]);
    expect(DATA_KERNEL.projectEvents(before, [], CONTENT, ATTACKER)).toStrictEqual([]);
  });
});

describe('events of packages checked on the copy the actor has', () => {
  it('turns an event whose handler reads a part the projection lacks into the data the sides see', () => {
    const inspect = event(0, 'acme:inspect', { value: 1 });
    const after = READER_KERNEL.applyEvent(STATE, inspect);

    expect(READER_KERNEL.projectEvents(STATE, [inspect], CONTENT, ATTACKER))
      .toStrictEqual([dataChanged(0, { 'acme:inspect': { value: 1 } }, [])]);

    expect(READER_KERNEL.projectEvents(STATE, [inspect], CONTENT, DEFENDER)).toStrictEqual([inspect]);

    expect(replayed(READER_KERNEL, CONTENT, STATE, [inspect], ATTACKER))
      .toStrictEqual(READER_KERNEL.project(after, CONTENT, ATTACKER));
  });

  it('checks an event of a package on the data an earlier event of the batch gave the copy', () => {
    const before = { ...STATE, extensions: { 'acme:ledger': { units: ['#8'] } } };
    const events = [event(0, 'kernel:unit-summoned', { unit: FUTURE }, ['attacker']), event(1, 'acme:confirm', {})];
    const after = events.reduce(READER_KERNEL.applyEvent, before);
    const projected = READER_KERNEL.projectEvents(before, events, CONTENT, ATTACKER);

    expect(projected).toStrictEqual([
      events[0],
      dataChanged(1, { 'acme:confirm': { confirmed: '#8' }, 'acme:ledger': { units: ['#8'] } }, []),
    ]);

    expect(replayed(READER_KERNEL, CONTENT, before, events, ATTACKER))
      .toStrictEqual(READER_KERNEL.project(after, CONTENT, ATTACKER));
  });

  it('turns an event whose handler needs the generator into the data for full visibility', () => {
    const rolled = event(0, 'acme:rolled', { value: 3 });
    const after = READER_KERNEL.applyEvent(STATE, rolled);

    expect(READER_KERNEL.projectEvents(STATE, [rolled], CONTENT, FULL))
      .toStrictEqual([dataChanged(0, { 'acme:rolled': { value: 3 } }, [])]);

    expect(replayed(READER_KERNEL, CONTENT, STATE, [rolled], FULL))
      .toStrictEqual(READER_KERNEL.project(after, CONTENT, FULL));
  });

  it('turns an event whose handler gives data JSON cannot keep on the copy into the data the sides see', () => {
    const halved = event(0, 'acme:halved', {});
    const after = READER_KERNEL.applyEvent(STATE, halved);

    expect(READER_KERNEL.projectEvents(STATE, [halved], CONTENT, ATTACKER))
      .toStrictEqual([dataChanged(0, { 'acme:halved': { value: 1 } }, [])]);

    expect(replayed(READER_KERNEL, CONTENT, STATE, [halved], ATTACKER))
      .toStrictEqual(READER_KERNEL.project(after, CONTENT, ATTACKER));
  });
});

describe('the check of a batch of packages before its projection', () => {
  it('refuses an event of a package in an old version for full visibility as for sides', () => {
    const old = { ...event(0, 'acme:note', {}), version: 2 };

    for (const visibility of [FULL, ATTACKER]) {
      expect(() => DATA_KERNEL.projectEvents(STATE, [old], CONTENT, visibility)).toThrow(TypeError);
    }
  });

  it('gives a fitting batch to full visibility unchanged', () => {
    const note = event(0, 'acme:note', {});
    const healed = event(1, 'kernel:health-changed', { count: 10, health: 9, unit: 'archers-1' });

    expect(DATA_KERNEL.projectEvents(STATE, [note, healed], CONTENT, FULL)).toStrictEqual([note, healed]);
  });
});

const TALLIED = { units: ['archers-1', 'pikemen-1'] };

const FUTURE: Unit = summoned('attacker', ['attacker'], { cell: '3,3' });

const OWN = { project: (data: JsonValue) => data, schema: { type: 'object' }, version: 1 };

const TALLY: ExtensionEventKind<JsonValue> = packageEventKind('acme:tally', withData('acme:tally'), {
  project: (data, view) => {
    const units = (data as { readonly units: readonly string[] }).units.filter((unit) => view.seesUnit(unit));

    return units.length === 0 ? undefined : { units };
  },
  schema: { type: 'object' },
  version: 1,
});

const LOG: ExtensionEventKind<JsonValue> = packageEventKind('acme:log', withData('acme:log'), {
  schema: { type: 'object' },
  version: 1,
});

const BOTH_KINDS: ReadonlyArray<ExtensionEventKind<JsonValue>> = ['acme:a', 'acme:z'].map((name) =>
  packageEventKind(name, (state) => state, OWN));

const SET_BOTH: ExtensionEventKind<JsonValue> = packageEventKind('acme:both', (state) => ({
  ...state,
  extensions: { ...state.extensions, ...Object.fromEntries([['acme:z', 1], ['acme:a', 2]]) },
}));

const INIT: ExtensionEventKind<JsonValue> = packageEventKind('acme:init', (state) =>
  (Object.hasOwn(state.extensions, 'acme:init')
    ? state
    : { ...state, extensions: { ...state.extensions, 'acme:init': { initialized: true } } }));

const LEDGER_ADD: ExtensionEventKind<JsonValue> = packageEventKind('acme:ledger-add', (state, payload) => {
  const ledger = state.extensions['acme:ledger'] as { readonly units: readonly string[] } | undefined;
  const { unit } = payload as { readonly unit: string };

  return { ...state, extensions: { ...state.extensions, 'acme:ledger': { units: [...ledger?.units ?? [], unit] } } };
});

const WAITING: ExtensionEventKind<JsonValue> = packageEventKind('acme:waiting', (state) => state, {
  project: (data, view) => (view.seesUnit((data as { readonly for: string }).for) ? undefined : { for: 'someone' }),
  schema: { type: 'object' },
  version: 1,
});

const NOTE: ExtensionEventKind<JsonValue> = packageEventKind('acme:note', (state) => state);

const LEDGER: ExtensionEventKind<JsonValue> = packageEventKind('acme:ledger', (state) => state, {
  project: (data, view) => ({
    units: (data as { readonly units: readonly string[] }).units.filter((unit) => view.seesUnit(unit)),
  }),
  schema: { type: 'object' },
  version: 1,
});

const INSPECT: ExtensionEventKind<JsonValue> = packageEventKind('acme:inspect', (state, payload) => {
  if (!state.units.some((unit) => unit.side === 'defender')) throw new RangeError('Missing defender');

  return { ...state, extensions: { ...state.extensions, 'acme:inspect': payload } };
}, OWN);

const CONFIRM: ExtensionEventKind<JsonValue> = packageEventKind('acme:confirm', (state) => {
  const ledger = state.extensions['acme:ledger'] as { readonly units: readonly string[] } | undefined;
  const [first] = ledger?.units ?? [];

  if (first === undefined) throw new RangeError('Nothing to confirm');

  return { ...state, extensions: { ...state.extensions, 'acme:confirm': { confirmed: first } } };
}, OWN);

const ROLLED: ExtensionEventKind<JsonValue> = packageEventKind('acme:rolled', (state, payload) => {
  if (state.rng === undefined) throw new RangeError('No generator');

  return { ...state, extensions: { ...state.extensions, 'acme:rolled': payload } };
}, OWN);

const HALVED: ExtensionEventKind<JsonValue> = packageEventKind('acme:halved', (state) => ({
  ...state,
  extensions: { ...state.extensions, 'acme:halved': { value: state.rng === undefined ? 0.5 : 1 } },
}), OWN);

const COUNT: ExtensionEventKind<JsonValue> = packageEventKind('acme:count', (state) => state, OWN);

const COUNT_ADD: ExtensionEventKind<JsonValue> = packageEventKind('acme:count-add', (state) => {
  const counted = state.extensions['acme:count'] as { readonly count: number } | undefined;

  return { ...state, extensions: { ...state.extensions, 'acme:count': { count: (counted?.count ?? 0) + 1 } } };
});

const COUNT_NOTE: ExtensionEventKind<JsonValue> = packageEventKind('acme:count-note', (state) => state);

const DATA_KERNEL = createKernel({
  extensions: [
    TALLY,
    LOG,
    ...BOTH_KINDS,
    SET_BOTH,
    INIT,
    LEDGER_ADD,
    LEDGER,
    WAITING,
    NOTE,
    GRID,
    FACING_GRID,
    SPEED_ORDER,
  ],
});

const READER_KERNEL = createKernel({
  extensions: [INSPECT, CONFIRM, ROLLED, HALVED, LEDGER, GRID, FACING_GRID, SPEED_ORDER],
});

const COUNT_KERNEL = createKernel({ extensions: [COUNT, COUNT_ADD, COUNT_NOTE, GRID, FACING_GRID, SPEED_ORDER] });

function withData(name: string): ExtensionEventKind<JsonValue>['apply'] {
  return (state, payload) => ({ ...state, extensions: { ...state.extensions, [name]: payload } });
}

function prefixes(
  kernel: Kernel,
  before: BattleState,
  events: readonly BattleEvent[],
  visibility: Visibility,
): readonly BattleState[] {
  const projected = kernel.projectEvents(before, events, CONTENT, visibility);
  const start = kernel.project(before, CONTENT, visibility);

  return projected.reduce<readonly BattleState[]>(
    (states, one) => [...states, kernel.applyEvent(states.at(-1) ?? start, one)],
    [start],
  );
}
